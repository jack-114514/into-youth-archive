import assert from "node:assert/strict";
import test from "node:test";
import { galaxyDetailImageAspect, prepareGalaxyDetailImage } from "../components/galaxyDetailImages.ts";

const images = [];
globalThis.Image = class {
  naturalWidth = 0;
  naturalHeight = 0;
  decodeCalls = 0;
  constructor() { images.push(this); }
  async decode() { this.decodeCalls += 1; }
};

test("hover and press share one original, decoded before detail layout", () => {
  prepareGalaxyDetailImage("portrait");
  prepareGalaxyDetailImage("portrait");
  assert.equal(images.length, 1);
  assert.equal(galaxyDetailImageAspect("portrait"), 1);
  Object.assign(images[0], { naturalWidth: 900, naturalHeight: 1200 });
  images[0].onload();
  assert.equal(images[0].decoding, "async");
  assert.equal(images[0].decodeCalls, 1);
  assert.equal(galaxyDetailImageAspect("portrait"), .75);
});

test("original cache is bounded and an evicted image can be prepared again", () => {
  for (const url of ["second", "third", "fourth"]) prepareGalaxyDetailImage(url);
  assert.equal(galaxyDetailImageAspect("portrait"), 1);
  prepareGalaxyDetailImage("portrait");
  assert.equal(images.length, 5);
  Object.assign(images[4], { naturalWidth: 600, naturalHeight: 800 });
  images[0].onerror();
  assert.equal(galaxyDetailImageAspect("portrait"), .75);
});

test("failed preload can retry without blocking a later open", () => {
  images[4].onerror();
  prepareGalaxyDetailImage("portrait");
  assert.equal(images.length, 6);
});
