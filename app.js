import { compareRgba } from "./diff-core.js";

const byId = (id) => document.getElementById(id);
const baselineInput = byId("baseline-input");
const currentInput = byId("current-input");
const thresholdInput = byId("threshold-input");
const resizeMode = byId("resize-mode");
const viewer = byId("viewer");
const state = { baseline: null, current: null, comparison: null, result: null, mode: "side", opacity: 50 };

function setStatus(message, kind = "") {
  const node = byId("status");
  node.textContent = message;
  node.className = `status ${kind}`.trim();
}

function loadImage(file, side) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Choose a supported image file.", "error");
    return;
  }
  createImageBitmap(file).then((bitmap) => {
    if (bitmap.width * bitmap.height > 10_000_000) {
      bitmap.close?.();
      setStatus(`${file.name} is larger than the 10-megapixel input limit. Resize a copy and try again.`, "error");
      return;
    }
    state[side]?.bitmap?.close?.();
    state[side] = { bitmap, fileName: file.name, width: bitmap.width, height: bitmap.height };
    byId(`${side}-name`).textContent = `${file.name} · ${bitmap.width} × ${bitmap.height}`;
    render();
  }).catch(() => setStatus(`Could not decode ${file.name}. Try PNG, JPEG, WebP, or BMP.`, "error"));
}

baselineInput.addEventListener("change", () => loadImage(baselineInput.files[0], "baseline"));
currentInput.addEventListener("change", () => loadImage(currentInput.files[0], "current"));
thresholdInput.addEventListener("input", () => {
  byId("threshold-output").value = thresholdInput.value;
  render();
});
byId("opacity-input").addEventListener("input", (event) => {
  state.opacity = Number(event.target.value);
  byId("opacity-output").value = `${state.opacity}%`;
  renderViewer();
});
resizeMode.addEventListener("change", render);
document.querySelectorAll('input[name="view-mode"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.mode = input.value;
    renderViewer();
  });
});

function drawBitmap(bitmap, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function canvasForBitmap(item) {
  return drawBitmap(item.bitmap, item.width, item.height);
}

function makeLabel(text, canvas) {
  const frame = document.createElement("figure");
  frame.className = "image-frame";
  const caption = document.createElement("figcaption");
  caption.textContent = text;
  frame.append(caption, canvas);
  return frame;
}

function renderViewer() {
  if (!state.baseline || !state.current || !state.comparison || !state.result) return;
  viewer.replaceChildren();
  viewer.className = `viewer mode-${state.mode}`;
  const { baselineCanvas, currentCanvas, diffCanvas } = state.comparison;
  if (state.mode === "side") {
    viewer.append(makeLabel("Baseline", canvasForBitmap(state.baseline)), makeLabel("Current", canvasForBitmap(state.current)));
  } else if (state.mode === "overlay") {
    const canvas = document.createElement("canvas");
    canvas.width = baselineCanvas.width;
    canvas.height = baselineCanvas.height;
    const context = canvas.getContext("2d");
    context.drawImage(baselineCanvas, 0, 0);
    context.globalAlpha = state.opacity / 100;
    context.drawImage(currentCanvas, 0, 0);
    context.globalAlpha = 1;
    viewer.append(makeLabel(`Overlay · Current at ${state.opacity}%`, canvas));
  } else {
    viewer.append(makeLabel("Difference heatmap · red pixels exceed threshold", diffCanvas));
  }
}

function renderSummary(result) {
  byId("changed-pixels").textContent = result.changedPixels.toLocaleString();
  byId("changed-percent").textContent = `${result.changedPercent.toFixed(3)}% of pixels above threshold`;
  byId("mean-error").textContent = result.meanAbsoluteError.toFixed(2);
  byId("changed-bounds").textContent = result.bounds
    ? `${result.bounds.width} × ${result.bounds.height} at (${result.bounds.x}, ${result.bounds.y})`
    : "No changed pixels";
  byId("export-png").disabled = false;
  byId("export-json").disabled = false;
  byId("export-md").disabled = false;
}

function render() {
  if (!state.baseline || !state.current) {
    setStatus("Select two images.");
    return;
  }
  const sameSize = state.baseline.width === state.current.width && state.baseline.height === state.current.height;
  byId("resize-row").classList.toggle("hidden", sameSize);
  byId("dimension-warning").classList.toggle("hidden", sameSize);
  if (!sameSize && !resizeMode.value) {
    byId("dimension-warning").textContent = `The images have different dimensions (${state.baseline.width} × ${state.baseline.height} and ${state.current.width} × ${state.current.height}). Choose which image to resize before comparing.`;
    state.comparison = null;
    state.result = null;
    viewer.replaceChildren();
    viewer.className = "viewer empty";
    viewer.innerHTML = '<div class="empty-state"><span class="empty-symbol">↔</span><strong>Choose a resize mode</strong><span>The app will stretch one image to the other image’s pixel dimensions.</span></div>';
    ["changed-pixels", "changed-percent", "mean-error", "changed-bounds"].forEach((id) => { byId(id).textContent = "—"; });
    ["export-png", "export-json", "export-md"].forEach((id) => { byId(id).disabled = true; });
    setStatus("Select a resize mode to continue.");
    return;
  }
  if (!sameSize) {
    const targetName = resizeMode.value === "baseline" ? "current" : "baseline";
    const targetWidth = resizeMode.value === "baseline" ? state.baseline.width : state.current.width;
    const targetHeight = resizeMode.value === "baseline" ? state.baseline.height : state.current.height;
    byId("dimension-warning").textContent = `The ${targetName} image will be stretched to ${targetWidth} × ${targetHeight}. Scaling can change the pixel metrics.`;
  }

  let width = state.baseline.width;
  let height = state.baseline.height;
  let baselineCanvas = canvasForBitmap(state.baseline);
  let currentCanvas = canvasForBitmap(state.current);
  if (!sameSize && resizeMode.value === "baseline") {
    currentCanvas = drawBitmap(state.current.bitmap, width, height);
  } else if (!sameSize && resizeMode.value === "current") {
    width = state.current.width;
    height = state.current.height;
    baselineCanvas = drawBitmap(state.baseline.bitmap, width, height);
  }
  const baselinePixels = baselineCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const currentPixels = currentCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const result = compareRgba(baselinePixels, currentPixels, width, height, Number(thresholdInput.value));
  const diffCanvas = document.createElement("canvas");
  diffCanvas.width = width;
  diffCanvas.height = height;
  diffCanvas.getContext("2d").putImageData(new ImageData(result.diff, width, height), 0, 0);
  state.comparison = { baselineCanvas, currentCanvas, diffCanvas, width, height, resizeMode: sameSize ? "none" : resizeMode.value };
  state.result = result;
  byId("image-size").textContent = `${width.toLocaleString()} × ${height.toLocaleString()} · ${result.totalPixels.toLocaleString()} px`;
  renderSummary(result);
  renderViewer();
  setStatus(`${result.changedPixels.toLocaleString()} changed pixels at threshold ${thresholdInput.value}.`, "success");
}

function reportData() {
  return {
    tool: "Screenshot Diff Lab",
    generatedAt: new Date().toISOString(),
    baseline: { fileName: state.baseline.fileName, width: state.baseline.width, height: state.baseline.height },
    current: { fileName: state.current.fileName, width: state.current.width, height: state.current.height },
    comparison: {
      width: state.comparison.width,
      height: state.comparison.height,
      resizeMode: state.comparison.resizeMode,
      threshold: Number(thresholdInput.value),
      changedPixels: state.result.changedPixels,
      totalPixels: state.result.totalPixels,
      changedPercent: Number(state.result.changedPercent.toFixed(6)),
      meanAbsoluteError: Number(state.result.meanAbsoluteError.toFixed(6)),
      bounds: state.result.bounds,
    },
    note: "Static pixel comparison; inspect the images before treating differences as defects. Files are processed in the browser.",
  };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

byId("export-png").addEventListener("click", () => state.comparison?.diffCanvas.toBlob((blob) => {
  if (blob) downloadBlob(blob, "screenshot-difference.png");
}, "image/png"));
byId("export-json").addEventListener("click", () => downloadBlob(
  new Blob([`${JSON.stringify(reportData(), null, 2)}\n`], { type: "application/json" }), "screenshot-diff-report.json"));
byId("export-md").addEventListener("click", () => {
  const report = reportData();
  const c = report.comparison;
  const bounds = c.bounds ? `${c.bounds.width} × ${c.bounds.height} at (${c.bounds.x}, ${c.bounds.y})` : "None";
  const markdown = [
    "# Screenshot Diff Lab report", "",
    `- Baseline: ${report.baseline.fileName} (${report.baseline.width} × ${report.baseline.height})`,
    `- Current: ${report.current.fileName} (${report.current.width} × ${report.current.height})`,
    `- Comparison canvas: ${c.width} × ${c.height}`,
    `- Resize mode: ${c.resizeMode}`,
    `- Difference threshold: ${c.threshold}`,
    `- Changed pixels: ${c.changedPixels.toLocaleString()} / ${c.totalPixels.toLocaleString()} (${c.changedPercent}%)`,
    `- Mean absolute error: ${c.meanAbsoluteError}`,
    `- Changed bounds: ${bounds}`, "",
    report.note, "",
  ].join("\n");
  downloadBlob(new Blob([markdown], { type: "text/markdown" }), "screenshot-diff-report.md");
});

byId("sample-button").addEventListener("click", () => {
  const makeSample = (variant) => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 280;
    const context = canvas.getContext("2d");
    const sky = context.createLinearGradient(0, 0, 0, 280);
    sky.addColorStop(0, "#183553");
    sky.addColorStop(1, "#d89962");
    context.fillStyle = sky;
    context.fillRect(0, 0, 480, 280);
    context.fillStyle = "#263b31";
    context.fillRect(0, 214, 480, 66);
    context.fillStyle = "#dfc08c";
    context.fillRect(154, 104, 172, 110);
    context.fillStyle = "#bb7752";
    context.fillRect(variant ? 224 : 214, 152, 44, 62);
    context.fillStyle = "#f2d8a3";
    context.fillRect(180, 128, 35, 28);
    context.fillRect(264, 128, 35, 28);
    context.fillStyle = "rgba(255,255,255,.65)";
    context.fillRect(18, 18, 118, 30);
    context.fillStyle = "#14202e";
    context.font = "bold 13px system-ui";
    context.fillText(variant ? "BUILD 02 · POST TWEAK" : "BUILD 01 · BASELINE", 28, 38);
    return createImageBitmap(canvas);
  };
  Promise.all([makeSample(false), makeSample(true)]).then(([baseline, current]) => {
    state.baseline = { bitmap: baseline, fileName: "sample-baseline.png", width: 480, height: 280 };
    state.current = { bitmap: current, fileName: "sample-current.png", width: 480, height: 280 };
    byId("baseline-name").textContent = "Built-in sample · 480 × 280";
    byId("current-name").textContent = "Built-in sample · 480 × 280";
    baselineInput.value = "";
    currentInput.value = "";
    render();
  });
});
