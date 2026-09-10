"""Generate the self-hosted INTO Android delta-patch format.

The patch never contains signing material. It reuses byte ranges from an old,
already signed APK and embeds compressed new ranges. The client reconstructs
the exact target APK, then verifies its SHA-256 and Android signing certificate.
"""

from __future__ import annotations

import argparse
import hashlib
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path


MAGIC = b"IYDPATCH"
FORMAT_VERSION = 1
MIN_CHUNK = 2 * 1024
AVERAGE_CHUNK = 8 * 1024
MAX_CHUNK = 32 * 1024
MAX_DATA_OPERATION = 1024 * 1024
MASK_64 = (1 << 64) - 1
GEAR = tuple(
    int.from_bytes(hashlib.sha256(bytes((value,))).digest()[:8], "big")
    for value in range(256)
)


@dataclass(frozen=True)
class Chunk:
    offset: int
    data: bytes


def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def chunks(data: bytes) -> list[Chunk]:
    result: list[Chunk] = []
    start = 0
    rolling = 0
    for index, value in enumerate(data):
        rolling = ((rolling << 1) + GEAR[value]) & MASK_64
        size = index + 1 - start
        if size < MIN_CHUNK:
            continue
        if (rolling & (AVERAGE_CHUNK - 1)) != 0 and size < MAX_CHUNK:
            continue
        result.append(Chunk(start, data[start : index + 1]))
        start = index + 1
        rolling = 0
    if start < len(data):
        result.append(Chunk(start, data[start:]))
    return result


def build_operations(old: bytes, new: bytes) -> list[tuple[str, int | bytes, int]]:
    index: dict[bytes, list[Chunk]] = {}
    for chunk in chunks(old):
        index.setdefault(sha256(chunk.data), []).append(chunk)

    operations: list[tuple[str, int | bytes, int]] = []
    for chunk in chunks(new):
        match = next(
            (
                candidate
                for candidate in index.get(sha256(chunk.data), ())
                if candidate.data == chunk.data
            ),
            None,
        )
        if match is not None:
            if (
                operations
                and operations[-1][0] == "copy"
                and int(operations[-1][1]) + operations[-1][2] == match.offset
            ):
                previous = operations[-1]
                operations[-1] = ("copy", previous[1], previous[2] + len(chunk.data))
            else:
                operations.append(("copy", match.offset, len(chunk.data)))
            continue

        if (
            operations
            and operations[-1][0] == "data"
            and len(operations[-1][1]) + len(chunk.data) <= MAX_DATA_OPERATION
        ):
            previous_data = bytes(operations[-1][1])
            combined = previous_data + chunk.data
            operations[-1] = ("data", combined, len(combined))
        else:
            operations.append(("data", chunk.data, len(chunk.data)))
    return operations


def generate(old_path: Path, new_path: Path, patch_path: Path) -> None:
    old = old_path.read_bytes()
    new = new_path.read_bytes()
    operations = build_operations(old, new)
    patch_path.parent.mkdir(parents=True, exist_ok=True)
    with patch_path.open("wb") as output:
        output.write(MAGIC)
        output.write(
            struct.pack(
                ">BQQ32s32sI",
                FORMAT_VERSION,
                len(old),
                len(new),
                sha256(old),
                sha256(new),
                len(operations),
            )
        )
        for operation, value, length in operations:
            if operation == "copy":
                output.write(struct.pack(">BQI", 0, int(value), length))
            else:
                compressed = zlib.compress(bytes(value), level=9)
                output.write(struct.pack(">BII", 1, len(compressed), length))
                output.write(compressed)

    rebuilt = apply_for_verification(old, patch_path.read_bytes())
    if rebuilt != new:
        patch_path.unlink(missing_ok=True)
        raise RuntimeError("Generated patch did not reproduce the target APK.")

    print(f"old_sha256={sha256(old).hex()}")
    print(f"new_sha256={sha256(new).hex()}")
    print(f"patch_sha256={hashlib.sha256(patch_path.read_bytes()).hexdigest()}")
    print(f"old_bytes={len(old)}")
    print(f"new_bytes={len(new)}")
    print(f"patch_bytes={patch_path.stat().st_size}")
    print(f"operations={len(operations)}")


def apply_for_verification(old: bytes, patch: bytes) -> bytes:
    cursor = len(MAGIC)
    if patch[:cursor] != MAGIC:
        raise ValueError("Invalid patch magic.")
    version, old_size, new_size, old_hash, new_hash, count = struct.unpack_from(
        ">BQQ32s32sI", patch, cursor
    )
    cursor += struct.calcsize(">BQQ32s32sI")
    if version != FORMAT_VERSION or old_size != len(old) or sha256(old) != old_hash:
        raise ValueError("Patch base does not match.")
    output = bytearray()
    for _ in range(count):
        operation = patch[cursor]
        cursor += 1
        if operation == 0:
            offset, length = struct.unpack_from(">QI", patch, cursor)
            cursor += struct.calcsize(">QI")
            output.extend(old[offset : offset + length])
        elif operation == 1:
            compressed_length, raw_length = struct.unpack_from(">II", patch, cursor)
            cursor += struct.calcsize(">II")
            raw = zlib.decompress(patch[cursor : cursor + compressed_length])
            cursor += compressed_length
            if len(raw) != raw_length:
                raise ValueError("Patch data length mismatch.")
            output.extend(raw)
        else:
            raise ValueError("Unknown patch operation.")
    rebuilt = bytes(output)
    if len(rebuilt) != new_size or sha256(rebuilt) != new_hash:
        raise ValueError("Target validation failed.")
    return rebuilt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("old_apk", type=Path)
    parser.add_argument("new_apk", type=Path)
    parser.add_argument("output_patch", type=Path)
    arguments = parser.parse_args()
    generate(arguments.old_apk, arguments.new_apk, arguments.output_patch)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
