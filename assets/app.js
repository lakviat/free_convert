const state = {
  files: [],
  outputs: [],
};

const outputFormats = [
  { value: "jpeg", label: "JPEG (.jpg)" },
  { value: "png", label: "PNG (.png)" },
  { value: "webp", label: "WebP (.webp)" },
  { value: "avif", label: "AVIF (.avif)" },
  { value: "heic", label: "HEIC (.heic)" },
];

const elements = {
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  chooseBtn: document.getElementById("chooseBtn"),
  outputFormat: document.getElementById("outputFormat"),
  sizePreset: document.getElementById("sizePreset"),
  customSizeWrap: document.getElementById("customSizeWrap"),
  customSize: document.getElementById("customSize"),
  convertBtn: document.getElementById("convertBtn"),
  clearBtn: document.getElementById("clearBtn"),
  status: document.getElementById("status"),
  supportNote: document.getElementById("supportNote"),
  fileList: document.getElementById("fileList"),
};

const support = {
  webp: canEncode("image/webp"),
  avif: canEncode("image/avif"),
  heic: false,
};

function canEncode(type) {
  const canvas = document.createElement("canvas");
  try {
    return canvas.toDataURL(type).startsWith(`data:${type}`);
  } catch (error) {
    return false;
  }
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function toTargetBytes(originalBytes, preset, customKb) {
  if (!originalBytes) return null;
  if (preset === "same") return originalBytes;
  if (preset === "large") return Math.round(originalBytes * 0.75);
  if (preset === "medium") return Math.round(originalBytes * 0.5);
  if (preset === "small") return Math.round(originalBytes * 0.25);
  if (preset === "custom") return customKb ? Math.round(customKb * 1024) : null;
  return originalBytes;
}

function updateStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "#c03" : "";
}

function updateFileList() {
  elements.fileList.innerHTML = "";
  state.outputs.forEach((item) => {
    const row = document.createElement("div");
    row.className = "file-item";
    row.innerHTML = `
      <div class="meta">
        <strong>${item.name}</strong>
        <span>${item.inputType} -> ${item.outputType}</span>
        <span>${formatBytes(item.inputSize)} -> ${formatBytes(item.outputSize)}</span>
      </div>
      <div class="actions">
        <a class="download" href="${item.url}" download="${item.downloadName}">
          <button class="primary">Download</button>
        </a>
      </div>
    `;
    elements.fileList.appendChild(row);
  });
}


function setSupportNote() {
  const notes = [];
  if (!support.webp) notes.push("WebP output is not supported in this browser.");
  if (!support.avif) notes.push("AVIF output is not supported in this browser.");
  notes.push("HEIC output is not available in-browser yet.");
  elements.supportNote.textContent = notes.join(' ');
}

function refreshOutputOptions() {
  elements.outputFormat.innerHTML = "";
  outputFormats.forEach((format) => {
    const option = document.createElement("option");
    option.value = format.value;
    option.textContent = format.label;
    if (format.value === "webp" && !support.webp) option.disabled = true;
    if (format.value === "avif" && !support.avif) option.disabled = true;
    if (format.value === "heic") option.disabled = true;
    elements.outputFormat.appendChild(option);
  });
}

function syncDefaults() {
  const defaultOutput = document.body.dataset.defaultOutput || "jpeg";
  if ([...elements.outputFormat.options].some((opt) => opt.value === defaultOutput && !opt.disabled)) {
    elements.outputFormat.value = defaultOutput;
  }
}

function setCustomVisibility() {
  const show = elements.sizePreset.value === "custom";
  elements.customSizeWrap.style.display = show ? "block" : "none";
}

function attachDropHandlers() {
  const highlight = () => elements.dropZone.classList.add("dragover");
  const unhighlight = () => elements.dropZone.classList.remove("dragover");

  ["dragenter", "dragover"].forEach((event) => {
    elements.dropZone.addEventListener(event, (e) => {
      e.preventDefault();
      e.stopPropagation();
      highlight();
    });
  });

  ["dragleave", "drop"].forEach((event) => {
    elements.dropZone.addEventListener(event, (e) => {
      e.preventDefault();
      e.stopPropagation();
      unhighlight();
    });
  });

  elements.dropZone.addEventListener("drop", (e) => {
    const files = [...e.dataTransfer.files];
    setFiles(files);
  });
}

function setFiles(files) {
  state.files = files;
  state.outputs = [];
  updateFileList();
  if (!files.length) {
    updateStatus("No files selected.");
    return;
  }
  updateStatus(`${files.length} file(s) ready for conversion.`);
}

function pickOutputType() {
  return elements.outputFormat.value;
}

async function ensureHeic2Any() {
  if (window.heic2any) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/heic2any/dist/heic2any.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function decodeImage(file) {
  const fileName = file.name.toLowerCase();
  const isHeic = file.type.includes("heic") || fileName.endsWith(".heic") || fileName.endsWith(".heif");

  if (isHeic) {
    await ensureHeic2Any();
    const blob = await window.heic2any({ blob: file, toType: "image/png" });
    return createImageBitmap(blob);
  }

  return createImageBitmap(file);
}

async function encodeImage(bitmap, type, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      type,
      quality
    );
  });
}

async function compressToTarget(bitmap, outputMime, targetBytes, allowQuality) {
  if (!allowQuality || !targetBytes) {
    return encodeImage(bitmap, outputMime, 0.92);
  }

  let low = 0.35;
  let high = 0.95;
  let bestBlob = null;

  for (let i = 0; i < 8; i += 1) {
    const mid = (low + high) / 2;
    const blob = await encodeImage(bitmap, outputMime, mid);
    bestBlob = blob;
    if (!blob) break;
    if (blob.size > targetBytes) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return bestBlob;
}

function outputMimeFor(type) {
  if (type === "jpeg") return "image/jpeg";
  if (type === "png") return "image/png";
  if (type === "webp") return "image/webp";
  if (type === "avif") return "image/avif";
  return "";
}

function replaceExtension(name, newExt) {
  const base = name.replace(/\.[^/.]+$/, "");
  return `${base}.${newExt}`;
}

async function processFile(file, outputType, targetBytes) {
  if (outputType === "heic") {
    throw new Error("HEIC output is not supported in this browser.");
  }

  const outputMime = outputMimeFor(outputType);
  if (!outputMime) {
    throw new Error("Unsupported output format.");
  }

  const bitmap = await decodeImage(file);
  const allowQuality = outputType !== "png";
  const blob = await compressToTarget(bitmap, outputMime, targetBytes, allowQuality);

  if (!blob) {
    throw new Error("Conversion failed.");
  }

  const url = URL.createObjectURL(blob);
  return {
    name: file.name,
    downloadName: replaceExtension(file.name, outputType === "jpeg" ? "jpg" : outputType),
    inputType: file.type || "image",
    outputType: outputMime,
    inputSize: file.size,
    outputSize: blob.size,
    url,
  };
}

async function convertAll() {
  if (!state.files.length) {
    updateStatus("Select at least one file.", true);
    return;
  }

  const outputType = pickOutputType();
  const preset = elements.sizePreset.value;
  const customKb = Number(elements.customSize.value || 0);

  updateStatus("Converting... please wait.");
  state.outputs = [];

  for (const file of state.files) {
    try {
      const target = toTargetBytes(file.size, preset, customKb);
      const result = await processFile(file, outputType, target);
      state.outputs.push(result);
      updateFileList();
    } catch (error) {
      updateStatus(error.message || "Conversion error.", true);
    }
  }

  updateStatus(`Done. Converted ${state.outputs.length} file(s).`);
}

function init() {
  refreshOutputOptions();
  syncDefaults();
  setCustomVisibility();
  attachDropHandlers();
  setSupportNote();

  elements.chooseBtn.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (e) => setFiles([...e.target.files]));
  elements.sizePreset.addEventListener("change", setCustomVisibility);
  elements.convertBtn.addEventListener("click", convertAll);
  elements.clearBtn.addEventListener("click", () => {
    state.files = [];
    state.outputs = [];
    elements.fileInput.value = "";
    updateFileList();
    updateStatus("Cleared.");
  });

  updateStatus("Ready to convert.");
}

init();
