import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { galaxyMediaLayout } from "../components/galaxyMediaLayout.ts";

test("original ratios fit desktop and narrow viewports without clipping", () => {
  for (const [vw, vh] of [[1920,1080], [1294,950], [1024,768], [390,844], [844,390]]) {
    for (const aspect of [.1, .4, .75, 1, 1.24, 1.25, 16/9, 3, 10]) {
      const layout = galaxyMediaLayout(aspect, vw, vh);
      assert.ok(layout.width > 0 && layout.height > 0);
      assert.ok(layout.panelWidth <= vw - 32 + .01);
      assert.ok(layout.height + (layout.stacked ? 112 : 0) + 40 <= vh * .78 + .01);
      assert.ok(Math.abs(layout.width / layout.height - aspect) < .00001);
    }
  }
});

test("landscape and portrait stay substantial without filling the scene", () => {
  const landscape = galaxyMediaLayout(16/9, 1294, 950);
  assert.equal(landscape.stacked, true);
  assert.ok(landscape.width >= 750 && landscape.width <= 840);
  assert.ok(landscape.panelWidth <= 880);
  assert.ok(landscape.height <= 460);
  const portrait = galaxyMediaLayout(.75, 1294, 950);
  assert.equal(portrait.stacked, false);
  assert.ok(portrait.height >= 480 && portrait.height <= 520);
  assert.ok(portrait.width >= 360 && portrait.width <= 390);
  assert.ok(portrait.panelWidth <= 740);
  assert.ok(galaxyMediaLayout(1,1920,1080).panelWidth <= 900);
});

test("the square 3D photo has visible framing on all four sides", async () => {
  const source = await readFile(new URL("../components/MemoryGalaxy.tsx", import.meta.url), "utf8");
  const surface = source.slice(source.indexOf("function ImageMediaSurface"), source.indexOf("function VideoMediaSurface"));
  const [, x, y, width, height] = surface.match(/<mesh position=\{\[([\d.-]+), ([\d.-]+), 0\]\}><planeGeometry args=\{\[([\d.]+), ([\d.]+)\]\}/);
  const [, frameWidth, frameHeight] = source.match(/\[3\.05, 3\.95\] : \[([\d.]+), ([\d.]+)\]/);
  assert.ok(Number(frameWidth) / 2 - Math.abs(Number(x)) - Number(width) / 2 > .1);
  assert.ok(Number(frameHeight) / 2 - Math.abs(Number(y)) - Number(height) / 2 > .1);
});
