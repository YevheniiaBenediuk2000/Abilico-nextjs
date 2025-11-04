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
  "parking",
  "hearing assistance",
  "braille signs",
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

self.addEventListener("message", async (e) => {
  const { id, type } = e.data;

  try {
    if (type === "init") {
      await getClassifier(); // warm-up load
      self.postMessage({ id, type: "ready" });
      return;
    }

    if (type === "classify") {
      const { text, threshold = 0.3, options = {} } = e.data;
      const classifier = await getClassifier();

      const out = await classifier(text, ACCESSIBILITY_LABELS, {
        multi_label: true,
        hypothesis_template: "This review mentions {}.",
        ...options,
      });

      const hits = out.labels
        .map((label, i) => ({ label, score: out.scores[i] }))
        .filter((x) => x.score >= threshold);

      self.postMessage({ id, type: "result", hits, raw: out });
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
