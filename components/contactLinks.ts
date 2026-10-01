export type CustomContactLink = { label: string; url: string };

export function readCustomContactLinks(value: unknown): CustomContactLink[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value || "[]"); } catch { parsed = []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, 12).filter((item) => item && typeof item === "object")
    .map((item) => ({ label: String(item.label ?? ""), url: String(item.url ?? "") }));
}

export function safeContactUrl(value: string): string {
  const url = value.trim();
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url) || url.length > 500) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname && !parsed.username && !parsed.password ? url : "";
  } catch { return ""; }
}

export function visibleCustomContactLinks(value: unknown): CustomContactLink[] {
  return readCustomContactLinks(value).map(({ label, url }) => ({ label: label.trim().slice(0, 32), url: safeContactUrl(url) }))
    .filter(({ label, url }) => label && url);
}
