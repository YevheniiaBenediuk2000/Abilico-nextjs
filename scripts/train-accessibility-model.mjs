import * as tf from "@tensorflow/tfjs-node";
import osmtogeojson from "osmtogeojson";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

// Configuration
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";
const BBOX = "-90,-180,90,180"; // World
let CACHE_FILE = `osm_data_cache_${BBOX.replace(/,/g, "_")}.json`;
// CACHE_FILE = "osm_data_cache.json";
const CHUNKS_DIR = "osm_chunks";
const MODEL_SAVE_PATH = "public/models/accessibility_model";
const ONLY_USE_EXISTING_CHUNKS = false; // Set to true to skip fetching missing chunks

export const NUMERIC_KEYS = ["width", "step_count", "incline", "level"];

// Features to extract (one-hot encoding candidates)
export const CATEGORICAL_KEYS = [
  "amenity",
  "shop",
  "tourism",
  "leisure",
  "healthcare",
  "building",
  "office",
  "craft",
  "historic",
  "man_made",
  "military",
  "sport",
  "surface",
  "entrance",
  "handrail",
  "highway",
  "kerb",
  "ramp",
  "toilets:wheelchair",
  "wheelchair_toilet",
  "public_transport",
  "railway",
  "platform",
  "indoor",
  "elevator",
  "lift",
  "tactile_paving",
  "sidewalk",
  "sidewalk:left",
  "sidewalk:right",
  "crossing",
  "crossing_ref",
  "smoothness",
  "barrier",
  "door",
  "automatic_door",
  "traffic_signals:sound",
  "traffic_signals:vibration",
  "ramp:wheelchair",
  "access",
  "lit",
];
const TOP_N_VALUES = 50; // Keep top N most common values for each key

// Label mapping
const LABEL_MAP = { yes: 2, designated: 2, limited: 1, no: 0 };

// --- NEW: build examples first (props + label), then split, then fit schema on train only ---

function buildExamples(geojson) {
  const examples = [];
  geojson.features.forEach((f) => {
    const props = f.properties || {};
    const wheelchair = props.wheelchair;
    if (!LABEL_MAP.hasOwnProperty(wheelchair)) return;
    examples.push({ props, label: LABEL_MAP[wheelchair] });
  });
  return examples;
}

function stratifiedSplitIndices(labels, valFrac = 0.2) {
  const byClass = new Map();
  labels.forEach((y, i) => {
    if (!byClass.has(y)) byClass.set(y, []);
    byClass.get(y).push(i);
  });

  const trainIdx = [];
  const valIdx = [];

  for (const idxs of byClass.values()) {
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    const nVal = Math.floor(idxs.length * valFrac);
    valIdx.push(...idxs.slice(0, nVal));
    trainIdx.push(...idxs.slice(nVal));
  }

  return { trainIdx, valIdx };
}

function fitSchema(trainExamples) {
  const vocabCounts = {};
  const numericBuckets = {};
  NUMERIC_KEYS.forEach((k) => (numericBuckets[k] = []));

  for (const ex of trainExamples) {
    const props = ex.props;

    // categorical counts (TRAIN ONLY)
    for (const key of CATEGORICAL_KEYS) {
      const val = props[key];
      if (val == null || val === "") continue;
      const s = String(val); // important: normalize to string
      vocabCounts[key] ||= {};
      vocabCounts[key][s] = (vocabCounts[key][s] || 0) + 1;
    }

    // numeric buckets (TRAIN ONLY)
    for (const key of NUMERIC_KEYS) {
      const x = parseNumber(props[key], key);
      if (x != null) numericBuckets[key].push(x);
    }
  }

  // top-N vocab + __OTHER__/__MISSING__
  const vocab = {};
  for (const key of CATEGORICAL_KEYS) {
    const counts = vocabCounts[key] || {};
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N_VALUES)
      .map(([v]) => v);
    vocab[key] = [...top, "__OTHER__", "__MISSING__"];
  }

  // numeric stats
  const numericStats = {};
  for (const k of NUMERIC_KEYS) numericStats[k] = meanStd(numericBuckets[k]);

  return {
    version: 1,
    categoricalKeys: CATEGORICAL_KEYS,
    numericKeys: NUMERIC_KEYS,
    vocab,
    numericStats,
  };
}

function encodePropsWithSchema(props, schema) {
  const vector = [];

  // numeric: [z, missing] per key
  for (const key of schema.numericKeys) {
    const x = parseNumber(props[key], key);
    const { mean, std } = schema.numericStats[key];
    const missing = x == null ? 1 : 0;
    let z = x == null ? 0 : (x - mean) / std;
    if (z > 5) z = 5;
    if (z < -5) z = -5;
    vector.push(z, missing);
  }

  // categorical: one-hot over vocab[key]
  for (const key of schema.categoricalKeys) {
    const keyVocab = schema.vocab[key] || [];
    const raw = props[key];
    const s = raw == null || raw === "" ? null : String(raw);

    let token = "__MISSING__";
    if (s) token = keyVocab.includes(s) ? s : "__OTHER__";

    for (const v of keyVocab) vector.push(token === v ? 1 : 0);
  }

  return vector;
}

function encodeExamples(examples, schema) {
  const features = [];
  const labels = [];
  for (const ex of examples) {
    features.push(encodePropsWithSchema(ex.props, schema));
    labels.push(ex.label);
  }
  return { features, labels };
}

export function parseNumber(raw, key) {
  if (raw == null) return null;
  const s0 = String(raw).trim();
  const s = s0.toLowerCase();

  // incline special cases
  if (key === "incline") {
    if (s === "up" || s === "down" || s === "steep") return null;

    // ratio formats like "1:12" => 1/12
    const ratio = s.match(/^\s*(-?\d+(\.\d+)?)\s*:\s*(\d+(\.\d+)?)\s*$/);
    if (ratio) {
      const a = parseFloat(ratio[1]);
      const b = parseFloat(ratio[3]);
      if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
      return null;
    }
  }

  // lists like "0.9;1.0" or "3-5" -> pick a sensible aggregate
  const nums = (s.match(/-?\d+(\.\d+)?/g) || [])
    .map(Number)
    .filter(Number.isFinite);
  if (!nums.length) return null;

  let x;
  if (key === "step_count") x = Math.min(...nums); // conservative
  else if (key === "width") x = Math.min(...nums); // min width matters
  else x = nums[0];

  // unit handling
  if (s.includes("mm")) x /= 1000;
  else if (s.includes("cm")) x /= 100;

  // incline percent
  if (key === "incline" && s.includes("%")) x /= 100;

  return Number.isFinite(x) ? x : null;
}

function computeClassWeights(labels, alpha = 0.5) {
  const counts = { 0: 0, 1: 0, 2: 0 };
  labels.forEach((l) => counts[l]++);
  const total = labels.length;
  const nClasses = 3;

  const weights = {};
  for (const k of Object.keys(counts)) {
    const c = counts[k];
    const w = total / (nClasses * c);
    weights[k] = Math.pow(w, alpha); // alpha=0.5 => sqrt
  }
  return weights;
}

async function fetchOSMData() {
  const cachePath = path.resolve(process.cwd(), CACHE_FILE);
  if (fs.existsSync(cachePath)) {
    console.log(`Loading OSM data from cache: ${cachePath}`);
    try {
      return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    } catch (error) {
      console.warn(
        `Error loading cache (likely too large), falling back to chunks: ${error.message}`
      );
    }
  }

  // Ensure chunks directory exists
  if (!fs.existsSync(CHUNKS_DIR)) {
    fs.mkdirSync(CHUNKS_DIR, { recursive: true });
  }

  console.log("Fetching OSM data in chunks...");
  const [s, w, n, e] = BBOX.split(",").map(Number);
  const latStep = 6;
  const lonStep = 6;

  const totalChunks =
    Math.ceil((n - s) / latStep) * Math.ceil((e - w) / lonStep);
  let currentChunk = 0;

  const allElements = new Map();

  for (let lat = s; lat < n; lat += latStep) {
    for (let lon = w; lon < e; lon += lonStep) {
      currentChunk++;
      const south = lat;
      const west = lon;
      const north = Math.min(lat + latStep, n);
      const east = Math.min(lon + lonStep, e);

      const chunkFileName = `chunk_${south}_${west}_${north}_${east}.json`;
      const chunkFilePath = path.join(CHUNKS_DIR, chunkFileName);
      let data;

      if (fs.existsSync(chunkFilePath)) {
        console.log(
          `Chunk ${currentChunk}/${totalChunks} found in cache: ${chunkFileName}`
        );
        try {
          data = JSON.parse(fs.readFileSync(chunkFilePath, "utf-8"));
        } catch (err) {
          console.error(
            `Error reading chunk file ${chunkFileName}, will re-fetch.`,
            err
          );
        }
      }

      if (!data) {
        if (ONLY_USE_EXISTING_CHUNKS) {
          console.log(`Skipping missing chunk ${chunkFileName}`);
          continue;
        }
        const bbox = `${south},${west},${north},${east}`;

        const query = `
    [out:json][timeout:90000];
    (
      node["wheelchair"](${bbox});
      way["wheelchair"](${bbox});
      relation["wheelchair"](${bbox});
    );
    out body;
    >;
    out skel qt;
  `;

        let retries = 10;
        while (retries > 0) {
          try {
            const response = await fetch(OVERPASS_API_URL, {
              method: "POST",
              body: query,
            });

            if (!response.ok) {
              if (response.status === 429 || response.status === 504) {
                console.warn(`Status ${response.status}. Waiting 10s...`);
                await new Promise((r) => setTimeout(r, 10000));
                retries--;
                continue;
              }
              throw new Error(`Overpass API error: ${response.statusText}`);
            }

            // Stream response to file to avoid memory issues
            if (response.body) {
              await pipeline(
                Readable.fromWeb(response.body),
                fs.createWriteStream(chunkFilePath)
              );
            } else {
              // Fallback for environments where body might not be a stream (unlikely in Node 18+)
              const buffer = await response.arrayBuffer();
              fs.writeFileSync(chunkFilePath, Buffer.from(buffer));
            }

            // Read back to verify and use
            data = JSON.parse(fs.readFileSync(chunkFilePath, "utf-8"));

            console.log(
              `Fetched chunk ${currentChunk}/${totalChunks}. ${
                data.elements ? data.elements.length : 0
              } elements from chunk.`
            );

            break; // Success
          } catch (error) {
            console.error(`Error fetching chunk ${bbox}:`, error);
            retries--;
            if (retries === 0) throw error;
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        // Delay between chunks to be nice to the API
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (data && data.elements) {
        data.elements.forEach((el) => {
          allElements.set(`${el.type}-${el.id}`, el);
        });
      }
    }
  }

  const combinedData = {
    version: 0.6,
    generator: "Overpass API",
    elements: Array.from(allElements.values()),
  };

  console.log(`Total elements fetched: ${combinedData.elements.length}`);

  // Stream write to avoid "Invalid string length" error
  const writeStream = fs.createWriteStream(cachePath);
  writeStream.write('{"version":0.6,"generator":"Overpass API","elements":[');

  let first = true;
  for (const el of combinedData.elements) {
    if (!first) {
      writeStream.write(",");
    }
    const chunk = JSON.stringify(el);
    if (!writeStream.write(chunk)) {
      await new Promise((resolve) => writeStream.once("drain", resolve));
    }
    first = false;
  }

  writeStream.write("]}");
  writeStream.end();

  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  console.log(`Saved data to cache: ${cachePath}`);
  return combinedData;
}

function meanStd(values) {
  if (!values.length) return { mean: 0, std: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const var_ =
    values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  const std = Math.sqrt(var_) || 1;
  return { mean, std };
}

async function trainModel(xTrain, yTrain, xVal, yVal) {
  console.log("Training model...");

  const xsTrain = tf.tensor2d(xTrain);
  const ysTrain = tf.oneHot(tf.tensor1d(yTrain, "int32"), 3);

  const xsVal = tf.tensor2d(xVal);
  const ysVal = tf.oneHot(tf.tensor1d(yVal, "int32"), 3);

  const classWeight = computeClassWeights(yTrain);
  console.log("Class weights:", classWeight);

  const model = tf.sequential();
  model.add(
    tf.layers.dense({
      units: 256,
      activation: "relu",
      inputShape: [xTrain[0].length],
    })
  );
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.dropout({ rate: 0.3 }));

  model.add(tf.layers.dense({ units: 128, activation: "relu" }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.dropout({ rate: 0.3 }));

  model.add(tf.layers.dense({ units: 64, activation: "relu" }));
  model.add(tf.layers.dense({ units: 3, activation: "softmax" }));

  model.compile({
    optimizer: tf.train.adam(0.0005),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });

  function makeSaveBestEarlyStop(
    model,
    { patience = 6, minDelta = 0.001 } = {}
  ) {
    let best = Infinity;
    let wait = 0;
    let bestWeights = null;

    return {
      onEpochEnd: async (epoch, logs) => {
        const v = logs?.val_loss;
        if (v == null) return;

        const improved = v < best - minDelta;
        if (improved) {
          best = v;
          wait = 0;

          if (bestWeights) bestWeights.forEach((w) => w.dispose());
          bestWeights = model.getWeights().map((w) => w.clone());
        } else {
          wait += 1;
          if (wait >= patience) {
            // request stop
            model.stopTraining = true;
            console.log(
              `Early stop at epoch ${epoch + 1} (best val_loss=${best.toFixed(
                4
              )})`
            );
          }
        }
      },
      onTrainEnd: async () => {
        if (bestWeights) {
          model.setWeights(bestWeights);
          bestWeights.forEach((w) => w.dispose());
          bestWeights = null;
        }
      },
    };
  }

  const saveBestEarlyStop = makeSaveBestEarlyStop(model, {
    patience: 6,
    minDelta: 0.001,
  });

  await model.fit(xsTrain, ysTrain, {
    epochs: 50,
    validationData: [xsVal, ysVal],
    shuffle: true,
    classWeight,
    callbacks: [saveBestEarlyStop],
  });

  return model;
}

async function main() {
  try {
    const osmData = await fetchOSMData();
    const geojson = osmtogeojson(osmData);

    const examples = buildExamples(geojson);
    if (examples.length === 0) {
      console.log("No labeled data found.");
      return;
    }

    const allLabels = examples.map((e) => e.label);
    const { trainIdx, valIdx } = stratifiedSplitIndices(allLabels, 0.2);

    const trainExamples = trainIdx.map((i) => examples[i]);
    const valExamples = valIdx.map((i) => examples[i]);

    // Fit schema on TRAIN ONLY (no leakage)
    const schema = fitSchema(trainExamples);

    // Save schema for inference
    fs.mkdirSync(path.dirname(MODEL_SAVE_PATH), { recursive: true });
    fs.writeFileSync(
      path.join(path.dirname(MODEL_SAVE_PATH), "schema.json"),
      JSON.stringify(schema)
    );

    // Encode with fixed schema
    const { features: xTrain, labels: yTrain } = encodeExamples(
      trainExamples,
      schema
    );
    const { features: xVal, labels: yVal } = encodeExamples(
      valExamples,
      schema
    );

    console.log(
      `Training on ${xTrain.length} samples. Validating on ${xVal.length}.`
    );
    const model = await trainModel(xTrain, yTrain, xVal, yVal);

    await model.save(`file://${MODEL_SAVE_PATH}`);
    console.log(`Model saved to ${MODEL_SAVE_PATH}`);

    function confusionMatrix(yTrue, yPred, n = 3) {
      const cm = Array.from({ length: n }, () => Array(n).fill(0));
      for (let i = 0; i < yTrue.length; i++) cm[yTrue[i]][yPred[i]]++;
      return cm;
    }

    function classificationReport(cm) {
      const n = cm.length;
      const sumRow = (r) => cm[r].reduce((a, b) => a + b, 0);
      const sumCol = (c) => cm.reduce((a, row) => a + row[c], 0);

      const perClass = [];
      for (let k = 0; k < n; k++) {
        const tp = cm[k][k];
        const fp = sumCol(k) - tp;
        const fn = sumRow(k) - tp;
        const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
        const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
        const f1 =
          precision + recall === 0
            ? 0
            : (2 * precision * recall) / (precision + recall);
        perClass.push({ k, precision, recall, f1, support: sumRow(k) });
      }
      const macroF1 = perClass.reduce((a, x) => a + x.f1, 0) / n;
      return { perClass, macroF1 };
    }

    async function evalOnVal(model, xVal, yVal) {
      const xs = tf.tensor2d(xVal);
      const probs = model.predict(xs);
      const pred = probs.argMax(1);
      const yPred = Array.from(pred.dataSync());
      xs.dispose();
      probs.dispose();
      pred.dispose();

      const cm = confusionMatrix(yVal, yPred, 3);
      const rep = classificationReport(cm);
      console.log("Confusion matrix [true][pred]:", cm);
      console.log("Macro F1:", rep.macroF1.toFixed(3));
      console.log(
        "Per-class:",
        rep.perClass.map((x) => ({
          class: x.k,
          precision: +x.precision.toFixed(3),
          recall: +x.recall.toFixed(3),
          f1: +x.f1.toFixed(3),
          support: x.support,
        }))
      );
    }

    await evalOnVal(model, xVal, yVal);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
