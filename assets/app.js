const state = {
  files: [],
  outputs: [],
  isConverting: false,
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

const inputAliases = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  heic: "heic",
  heif: "heic",
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

function revokeOutputUrls() {
  state.outputs.forEach((item) => {
    if (item.url) {
      URL.revokeObjectURL(item.url);
    }
  });
}

function setBusy(isBusy) {
  state.isConverting = isBusy;
  elements.convertBtn.disabled = isBusy;
  elements.clearBtn.disabled = isBusy;
  elements.chooseBtn.disabled = isBusy;
}

function updateFileList() {
  elements.fileList.innerHTML = "";
  if (!state.outputs.length) {
    return;
  }

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
        <a class="download button primary" href="${item.url}" download="${item.downloadName}">
          Download
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

function guessInputFormat(file) {
  const fileName = file.name.toLowerCase();
  const extensionMatch = fileName.match(/\.([a-z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : "";
  const mime = (file.type || "").toLowerCase();

  if (mime.includes("heic") || mime.includes("heif")) return "heic";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("avif")) return "avif";
  return inputAliases[extension] || "image";
}

function getDetectedInputTypes(files) {
  return [...new Set(files.map(guessInputFormat))];
}

function findSelectableOutput(preferredType) {
  const options = [...elements.outputFormat.options];
  return options.find((option) => option.value === preferredType && !option.disabled);
}

function pickSuggestedOutput(types) {
  const defaultOutput = document.body.dataset.defaultOutput || "jpeg";
  const [firstType] = types;

  if (findSelectableOutput(defaultOutput) && defaultOutput !== firstType) {
    return defaultOutput;
  }

  const firstDifferent = [...elements.outputFormat.options].find(
    (option) => !option.disabled && option.value !== firstType
  );
  return firstDifferent ? firstDifferent.value : elements.outputFormat.value;
}

function syncOutputForFiles(files) {
  if (!files.length) {
    syncDefaults();
    setSupportNote();
    return;
  }

  const detectedTypes = getDetectedInputTypes(files);
  const suggestedOutput = pickSuggestedOutput(detectedTypes);
  if (suggestedOutput) {
    elements.outputFormat.value = suggestedOutput;
  }

  const labels = detectedTypes.map((type) => type.toUpperCase());
  const notes = [];
  if (labels.length === 1) {
    notes.push(`Detected input: ${labels[0]}.`);
  } else {
    notes.push(`Detected inputs: ${labels.join(", ")}.`);
  }
  if (!support.webp) notes.push("WebP output is not supported in this browser.");
  if (!support.avif) notes.push("AVIF output is not supported in this browser.");
  notes.push("HEIC output is not available in-browser yet.");
  elements.supportNote.textContent = notes.join(" ");
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
  revokeOutputUrls();
  state.files = files;
  state.outputs = [];
  updateFileList();
  syncOutputForFiles(files);
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
    try {
      await ensureHeic2Any();
      const result = await window.heic2any({ blob: file, toType: "image/png" });
      const blob = Array.isArray(result) ? result[0] : result;
      if (!blob) {
        throw new Error("Unable to decode this HEIC file in the browser.");
      }
      return decodeBitmapSource(blob);
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message.includes("ERR_LIBHEIF")) {
        throw new Error("This HEIC file could not be decoded in the browser. Try another HEIC image or convert it on-device first.");
      }
      throw new Error("Unable to decode this HEIC file in the browser.");
    }
  }

  return decodeBitmapSource(file);
}

async function decodeBitmapSource(source) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(source);
    } catch (error) {
      // Fall back to image decoding below for browsers with partial support.
    }
  }

  const objectUrl = URL.createObjectURL(source);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to decode the selected image."));
      img.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function encodeImage(bitmap, type, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      type,
      quality
    );
  });

  if (blob) {
    return blob;
  }

  const dataUrl = canvas.toDataURL(type, quality);
  return dataUrlToBlob(dataUrl);
}

function dataUrlToBlob(dataUrl) {
  const [meta, body] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
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

function buildDownloadName(name, outputType) {
  const extension = outputType === "jpeg" ? "jpg" : outputType;
  const convertedName = replaceExtension(name, extension);
  return `convertjpgs_${convertedName}`;
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
  try {
    const allowQuality = outputType !== "png";
    const blob = await compressToTarget(bitmap, outputMime, targetBytes, allowQuality);

    if (!blob) {
      throw new Error("Conversion failed.");
    }

    const url = URL.createObjectURL(blob);
    return {
      name: file.name,
      downloadName: buildDownloadName(file.name, outputType),
      inputType: file.type || "image",
      outputType: outputMime,
      inputSize: file.size,
      outputSize: blob.size,
      url,
    };
  } finally {
    if (bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}

async function convertAll() {
  if (!state.files.length) {
    updateStatus("Select at least one file.", true);
    return;
  }

  const outputType = pickOutputType();
  const preset = elements.sizePreset.value;
  const customKb = Number(elements.customSize.value || 0);

  setBusy(true);
  updateStatus("Converting... please wait.");
  revokeOutputUrls();
  state.outputs = [];
  updateFileList();
  const failures = [];

  for (const file of state.files) {
    try {
      const target = toTargetBytes(file.size, preset, customKb);
      const result = await processFile(file, outputType, target);
      state.outputs.push(result);
      updateFileList();
    } catch (error) {
      failures.push(`${file.name}: ${error.message || "Conversion error."}`);
    }
  }

  if (state.outputs.length && !failures.length) {
    updateStatus(`Done. Converted ${state.outputs.length} file(s).`);
  } else if (state.outputs.length) {
    updateStatus(`Converted ${state.outputs.length} file(s). ${failures.length} failed. ${failures[0]}`, true);
  } else {
    updateStatus(failures[0] || "No files were converted.", true);
  }

  setBusy(false);
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
    revokeOutputUrls();
    state.files = [];
    state.outputs = [];
    elements.fileInput.value = "";
    updateFileList();
    syncDefaults();
    setSupportNote();
    updateStatus("Cleared.");
  });

  updateStatus("Ready to convert.");
}

init();
