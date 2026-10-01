import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

function loadStencil() {
  const source = readFileSync(new URL("../components/cropSelection.tsx", import.meta.url), "utf8");
  const compiled = transformSync(source, { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
  const frames = new Map();
  let nextFrame = 0;
  const exports = {};
  const commonJsModule = { exports };
  runInNewContext(compiled, {
    exports,
    module: commonJsModule,
    require(name) {
      if (name === "react") return { forwardRef: (render) => render, useRef: (current) => ({ current }), useEffect: () => {} };
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" };
      if (name === "react-advanced-cropper") return { getStencilCoordinates: () => ({ left: 0, top: 0, width: 560, height: 560 }) };
      throw new Error(`Unexpected import: ${name}`);
    },
    requestAnimationFrame(callback) {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  return {
    stencil: commonJsModule.exports.SelectionRectangleStencil,
    squareStencil: commonJsModule.exports.SelectionSquareStencil,
    circleStencil: commonJsModule.exports.SelectionCircleStencil,
    flushFrame() {
      const [id, callback] = frames.entries().next().value ?? [];
      if (!callback) return false;
      frames.delete(id);
      callback();
      return true;
    },
    get queuedFrames() { return frames.size; },
  };
}

function createCropper() {
  const state = {
    boundary: { width: 560, height: 560 },
    coordinates: { left: 0, top: 0, width: 560, height: 560 },
    visibleArea: { left: 0, top: 0, width: 560, height: 560 },
  };
  return {
    state,
    getState() { return state; },
    getVisibleArea() { return { ...state.visibleArea }; },
    moveCoordinates() {},
    moveCoordinatesEnd() {},
    moveImage(left, top) {
      state.visibleArea.left = Math.max(0, Math.min(50, state.visibleArea.left + left));
      state.visibleArea.top = Math.max(0, Math.min(50, state.visibleArea.top + top));
    },
    resizeCoordinates(_anchor, _directions, options) { this.lastResizeOptions = options; },
  };
}

test("holding the selection at the preview edge keeps panning until the source edge", () => {
  const browser = loadStencil();
  const cropper = createCropper();
  const proxy = browser.stencil({ cropper }, null).props.cropper;

  proxy.moveCoordinates({ top: 10 });
  browser.flushFrame();
  assert.equal(cropper.state.visibleArea.top, 10);
  browser.flushFrame();
  assert.equal(cropper.state.visibleArea.top, 16, "panning continues without another pointer move");

  for (let i = 0; i < 20 && browser.flushFrame(); i++);
  assert.equal(cropper.state.visibleArea.top, 50);
  assert.equal(browser.queuedFrames, 0, "panning stops at the source boundary");
});

test("square media selection remains square when any edge is resized", () => {
  const browser = loadStencil();
  const cropper = createCropper();
  const stencil = browser.squareStencil({ cropper }, null);
  assert.equal(stencil.props.aspectRatio, 1);
  stencil.props.cropper.resizeCoordinates("north", { top: -20 }, {});
  assert.equal(cropper.lastResizeOptions.preserveAspectRatio, true);
});

test("circular selection has no square handles or border lines", () => {
  const browser = loadStencil();
  const cropper = createCropper();
  const stencil = browser.circleStencil({ cropper }, null);
  const [circle, ring] = stencil.props.children;
  assert.equal(circle.props.resizable, false);
  assert.deepEqual(Object.keys(circle.props.handlers), []);
  assert.deepEqual(Object.keys(circle.props.lines), []);
  assert.equal(ring.props.children.type, "circle");
});

test("releasing the selection stops automatic panning", () => {
  const browser = loadStencil();
  const cropper = createCropper();
  const proxy = browser.stencil({ cropper }, null).props.cropper;

  proxy.moveCoordinates({ top: 10 });
  browser.flushFrame();
  proxy.moveCoordinatesEnd();
  assert.equal(browser.queuedFrames, 0);
  assert.equal(cropper.state.visibleArea.top, 10);
});

test("reversing direction pans back and stops at the opposite source edge", () => {
  const browser = loadStencil();
  const cropper = createCropper();
  cropper.state.visibleArea.top = 25;
  const proxy = browser.stencil({ cropper }, null).props.cropper;

  proxy.moveCoordinates({ top: -5 });
  browser.flushFrame();
  browser.flushFrame();
  assert.equal(cropper.state.visibleArea.top, 14);

  for (let i = 0; i < 20 && browser.flushFrame(); i++);
  assert.equal(cropper.state.visibleArea.top, 0);
  assert.equal(browser.queuedFrames, 0);
});
