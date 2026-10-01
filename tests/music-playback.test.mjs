import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

function setup() {
  let now = 0;
  let nextFrame = 0;
  const frames = new Map();
  const module = { exports: {} };
  const source = readFileSync(new URL("../components/musicPlayback.ts", import.meta.url), "utf8");
  runInNewContext(transformSync(source, { loader: "ts", format: "cjs" }).code, {
    module, exports: module.exports, performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const audio = { volume: 1, paused: true, currentTime: 15, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
  const states = [];
  const playback = module.exports.createMusicPlayback(audio, (playing) => states.push(playing));
  playback.setVolume(0.6);
  return { audio, playback, states, advance(ms) { now += ms; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(now)); } };
}

test("music starts silent and reaches the configured volume gradually", async () => {
  const { audio, playback, advance } = setup();
  await playback.play();
  assert.equal(audio.volume, 0);
  advance(500);
  assert.ok(audio.volume > 0 && audio.volume < 0.6);
  advance(500);
  assert.equal(audio.volume, 0.6);
});

test("pause fades to silence before stopping the audio", async () => {
  const { audio, playback, advance } = setup();
  await playback.play();
  advance(1000);
  playback.pause();
  advance(325);
  assert.equal(audio.paused, false);
  assert.ok(audio.volume > 0 && audio.volume < 0.6);
  advance(325);
  assert.equal(audio.volume, 0);
  assert.equal(audio.paused, true);
});

test("reversing a fade preserves the current volume and cancels the pending pause", async () => {
  const { audio, playback, advance } = setup();
  await playback.play();
  advance(1000);
  playback.pause();
  advance(325);
  const halfway = audio.volume;
  await playback.play();
  assert.equal(audio.volume, halfway);
  advance(1000);
  assert.equal(audio.volume, 0.6);
  assert.equal(audio.paused, false);
});

test("a delayed play result cannot restart a cancelled request", async () => {
  const { audio, playback, advance, states } = setup();
  let resolvePlay;
  audio.play = () => { audio.paused = false; return new Promise((resolve) => { resolvePlay = resolve; }); };
  const pending = playback.play();
  playback.pause();
  resolvePlay();
  assert.equal(await pending, false);
  advance(650);
  assert.equal(audio.paused, true);
  assert.deepEqual(states, [false]);
});
