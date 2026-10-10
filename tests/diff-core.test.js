import test from "node:test";
import assert from "node:assert/strict";
import { compareRgba } from "../diff-core.js";

test("identical RGBA images report no changes and no bounding box", () => {
  const pixels = new Uint8ClampedArray([20, 40, 60, 255, 0, 0, 0, 0]);
  const result = compareRgba(pixels, pixels, 2, 1, 0);
  assert.equal(result.changedPixels, 0);
  assert.equal(result.changedPercent, 0);
  assert.equal(result.bounds, null);
  assert.equal(result.meanAbsoluteError, 0);
});

test("threshold is strict and counts pixels, not changed channels", () => {
  const baseline = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]);
  const current = new Uint8ClampedArray([24, 0, 0, 255, 10, 10, 10, 255]);
  assert.equal(compareRgba(baseline, current, 2, 1, 24).changedPixels, 0);
  const above = new Uint8ClampedArray([25, 0, 0, 255, 10, 10, 10, 255]);
  const result = compareRgba(baseline, above, 2, 1, 24);
  assert.equal(result.changedPixels, 1);
  assert.equal(result.changedPercent, 50);
});

test("reports a tight bounding rectangle around changed pixels", () => {
  const baseline = new Uint8ClampedArray(3 * 2 * 4).fill(0);
  const current = new Uint8ClampedArray(baseline);
  current[(1 * 3 + 2) * 4] = 255;
  current[(1 * 3 + 1) * 4 + 1] = 255;
  const result = compareRgba(baseline, current, 3, 2, 0);
  assert.equal(result.changedPixels, 2);
  assert.deepEqual(result.bounds, { x: 1, y: 1, width: 2, height: 1 });
});

test("alpha differences participate in comparison", () => {
  const result = compareRgba(new Uint8ClampedArray([1, 2, 3, 255]), new Uint8ClampedArray([1, 2, 3, 0]), 1, 1, 100);
  assert.equal(result.changedPixels, 1);
  assert.equal(result.meanAbsoluteError, 63.75);
});

test("rejects invalid dimensions, buffer lengths, and thresholds", () => {
  const pixel = new Uint8ClampedArray([0, 0, 0, 0]);
  assert.throws(() => compareRgba(pixel, pixel, 0, 1), RangeError);
  assert.throws(() => compareRgba(pixel, new Uint8ClampedArray(8), 1, 1), RangeError);
  assert.throws(() => compareRgba(pixel, pixel, 1, 1, 256), RangeError);
});
