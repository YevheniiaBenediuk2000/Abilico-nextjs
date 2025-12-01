import * as tf from "@tensorflow/tfjs-node";
import osmtogeojson from "osmtogeojson";
import fs from "fs";
import path from "path";

// Configuration
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";
const BBOX = "34.0,-10.0,72.0,40.0"; // Europe
const CACHE_FILE = "osm_data_cache.json";
const MODEL_SAVE_PATH = "public/models/accessibility_model";

// Features to extract (one-hot encoding candidates)
export const FEATURE_KEYS = [
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
  "step_count",
  "incline",
  "toilets:wheelchair",
  "wheelchair_toilet",
  "public_transport",
  "railway",
  "platform",
  "indoor",
  "level",
  "elevator",
  "lift",
  "tactile_paving",
  "sidewalk",
  "sidewalk:left",
  "sidewalk:right",
  "crossing",
  "crossing_ref",
  "smoothness",
  "width",
  "barrier",
  "door",
  "door:width",
  "automatic_door",
  "traffic_signals:sound",
  "traffic_signals:vibration",
  "ramp:wheelchair",
];
const TOP_N_VALUES = 100; // Keep top N most common values for each key

// Label mapping
const LABEL_MAP = { yes: 2, designated: 2, limited: 1, no: 0 };

async function fetchOSMData() {
  const cachePath = path.resolve(process.cwd(), CACHE_FILE);
  if (fs.existsSync(cachePath)) {
    console.log(`Loading OSM data from cache: ${cachePath}`);
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  }

  console.log("Fetching OSM data in chunks...");
  const [s, w, n, e] = BBOX.split(",").map(Number);
  const latStep = 4;
  const lonStep = 4;

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

      const bbox = `${south},${west},${north},${east}`;

      const query = `
    [out:json][timeout:8600];
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

          const data = await response.json();
          console.log(
            `Fetched chunk ${currentChunk}/${totalChunks}. ${data.elements.length} elements from chunk.`
          );

          data.elements.forEach((el) => {
            allElements.set(`${el.type}-${el.id}`, el);
          });

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
  }

  const combinedData = {
    version: 0.6,
    generator: "Overpass API",
    elements: Array.from(allElements.values()),
  };

  console.log(`Total elements fetched: ${combinedData.elements.length}`);
  fs.writeFileSync(cachePath, JSON.stringify(combinedData));
  console.log(`Saved data to cache: ${cachePath}`);
  return combinedData;
}

function preprocessData(geojson) {
  console.log("Preprocessing data...");
  const features = [];
  const labels = [];
  const vocab = {}; // To store value counts for one-hot encoding

  // 1. Collect vocabulary
  geojson.features.forEach((feature) => {
    const props = feature.properties;
    const wheelchair = props.wheelchair;

    if (LABEL_MAP.hasOwnProperty(wheelchair)) {
      FEATURE_KEYS.forEach((key) => {
        const val = props[key];
        if (val) {
          if (!vocab[key]) vocab[key] = {};
          vocab[key][val] = (vocab[key][val] || 0) + 1;
        }
      });
    }
  });

  // 2. Select top values for vocabulary
  const featureVocab = {};
  FEATURE_KEYS.forEach((key) => {
    if (vocab[key]) {
      const sorted = Object.entries(vocab[key]).sort((a, b) => b[1] - a[1]);
      featureVocab[key] = sorted.slice(0, TOP_N_VALUES).map((x) => x[0]);
    } else {
      featureVocab[key] = [];
    }
  });

  // Save vocabulary for inference
  fs.mkdirSync(path.dirname(MODEL_SAVE_PATH), { recursive: true });
  fs.writeFileSync(
    path.join(path.dirname(MODEL_SAVE_PATH), "vocab.json"),
    JSON.stringify(featureVocab)
  );

  // 3. Create feature vectors and labels
  geojson.features.forEach((feature) => {
    const props = feature.properties;
    const wheelchair = props.wheelchair;

    if (LABEL_MAP.hasOwnProperty(wheelchair)) {
      const vector = [];
      FEATURE_KEYS.forEach((key) => {
        const val = props[key];
        featureVocab[key].forEach((vocabVal) => {
          vector.push(val === vocabVal ? 1 : 0);
        });
        // Add "other" category if needed, or just leave as 0s
      });

      features.push(vector);
      labels.push(LABEL_MAP[wheelchair]);
    }
  });

  return { features, labels, featureVocab };
}

async function trainModel(features, labels) {
  console.log("Training model...");
  const xs = tf.tensor2d(features);
  const ys = tf.oneHot(tf.tensor1d(labels, "int32"), 3); // 3 classes: 0, 1, 2

  const model = tf.sequential();
  model.add(
    tf.layers.dense({
      units: 32,
      activation: "relu",
      inputShape: [features[0].length],
    })
  );
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(
    tf.layers.dense({
      units: 16,
      activation: "relu",
    })
  );
  model.add(
    tf.layers.dense({
      units: 3,
      activation: "softmax",
    })
  );

  model.compile({
    optimizer: "adam",
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });

  await model.fit(xs, ys, {
    epochs: 50,
    validationSplit: 0.2,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(
          `Epoch ${epoch}: loss = ${logs.loss.toFixed(
            4
          )}, acc = ${logs.acc.toFixed(4)}`
        );
      },
    },
  });

  return model;
}

async function main() {
  try {
    const osmData = await fetchOSMData();
    const geojson = osmtogeojson(osmData);
    const { features, labels } = preprocessData(geojson);

    if (features.length === 0) {
      console.log("No labeled data found.");
      return;
    }

    console.log(`Training on ${features.length} samples.`);
    const model = await trainModel(features, labels);

    await model.save(`file://${MODEL_SAVE_PATH}`);
    console.log(`Model saved to ${MODEL_SAVE_PATH}`);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
