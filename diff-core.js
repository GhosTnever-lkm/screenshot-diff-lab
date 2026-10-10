export function compareRgba(baseline, current, width, height, threshold = 24) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Image dimensions must be positive integers");
  }
  const expectedLength = width * height * 4;
  if (baseline.length !== expectedLength || current.length !== expectedLength) {
    throw new RangeError(`Each image must contain exactly ${expectedLength} RGBA values`);
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) {
    throw new RangeError("Threshold must be from 0 to 255");
  }

  const pixels = width * height;
  let changedPixels = 0;
  let absoluteError = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const diff = new Uint8ClampedArray(expectedLength);

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const r = Math.abs(baseline[offset] - current[offset]);
    const g = Math.abs(baseline[offset + 1] - current[offset + 1]);
    const b = Math.abs(baseline[offset + 2] - current[offset + 2]);
    const a = Math.abs(baseline[offset + 3] - current[offset + 3]);
    const delta = Math.max(r, g, b, a);
    absoluteError += r + g + b + a;

    if (delta > threshold) {
      changedPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      diff[offset] = 255;
      diff[offset + 1] = Math.max(0, 255 - delta);
      diff[offset + 2] = 24;
      diff[offset + 3] = Math.min(255, Math.max(96, delta));
    } else {
      diff[offset] = Math.round((baseline[offset] + current[offset]) / 2);
      diff[offset + 1] = Math.round((baseline[offset + 1] + current[offset + 1]) / 2);
      diff[offset + 2] = Math.round((baseline[offset + 2] + current[offset + 2]) / 2);
      diff[offset + 3] = 255;
    }
  }

  const bounds = changedPixels === 0
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  return {
    width,
    height,
    totalPixels: pixels,
    changedPixels,
    changedPercent: pixels === 0 ? 0 : (changedPixels / pixels) * 100,
    meanAbsoluteError: absoluteError / (pixels * 4),
    bounds,
    diff,
  };
}
