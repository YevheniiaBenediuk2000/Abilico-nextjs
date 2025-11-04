import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers";

// Configure transformers inside the worker
env.allowRemoteModels = true;
env.useBrowserCache = true; // IndexedDB cache (shared by worker/main on same origin)
try {
  // If you hit SharedArrayBuffer/Cross-Origin isolation issues, reduce to 1.
  env.backends.onnx.wasm.numThreads = self.navigator.hardwareConcurrency || 1;
} catch {
  env.backends.onnx.wasm.numThreads = 1;
}

const ACCESSIBILITY_LABELS = [
  "wheelchair access",
  "ramp",
  "accessible toilet",
  "elevator",
  "accessible parking",
  "stairs",
  "wide door",
  "automatic door",
];

let classifier = null;
async function getClassifier() {
  if (!classifier) {
    classifier = await pipeline(
      "zero-shot-classification",
      "Xenova/distilbert-base-uncased-mnli",
      { quantized: true }
    );
  }
  return classifier;
}

const RAW_CACHE = new Map();
const norm = (t) =>
  String(t || "")
    .trim()
    .toLowerCase();

self.addEventListener("message", async (e) => {
  const { id, type } = e.data || {};

  try {
    if (type === "init") {
      await getClassifier(); // warm-up load
      self.postMessage({ id, type: "ready" });
      return;
    }

    if (type === "classify") {
      const { text, options = {} } = e.data;
      const t = norm(text);
      if (!RAW_CACHE.has(t)) {
        const clf = await getClassifier();
        const out = await clf(t, ACCESSIBILITY_LABELS, {
          multi_label: true,
          hypothesis_template: "This review mentions {}.",
          ...options,
        });
        RAW_CACHE.set(t, out);
      }
      const out = RAW_CACHE.get(t);

      self.postMessage({ id, type: "result", raw: out });
      return;
    }

    if (type === "classify-many") {
      const { texts = [], options = {} } = e.data;
      const results = new Array(texts.length);
      const toRunIdx = [];
      const toRunTexts = [];
      texts.forEach((tx, i) => {
        const k = norm(tx);
        if (RAW_CACHE.has(k)) {
          results[i] = RAW_CACHE.get(k);
        } else {
          toRunIdx.push(i);
          toRunTexts.push(k);
        }
      });

      if (toRunTexts.length) {
        const clf = await getClassifier();
        // Chunk to avoid big memory spikes
        const CHUNK = 8;
        for (let i = 0; i < toRunTexts.length; i += CHUNK) {
          const chunkTexts = toRunTexts.slice(i, i + CHUNK);
          const outs = await clf(chunkTexts, ACCESSIBILITY_LABELS, {
            multi_label: true,
            hypothesis_template: "This review mentions {}.",
            ...options,
          });
          const arr = Array.isArray(outs) ? outs : [outs];
          arr.forEach((out, j) => {
            const globalIdx = toRunIdx[i + j];
            RAW_CACHE.set(chunkTexts[j], out);
            results[globalIdx] = out;
          });
        }
      }

      self.postMessage({ id, type: "result-many", items: results });
      return;
    }

    self.postMessage({
      id,
      type: "error",
      error: `Unknown message type: ${type}`,
    });
  } catch (err) {
    self.postMessage({ id, type: "error", error: err?.message || String(err) });
  }
});
