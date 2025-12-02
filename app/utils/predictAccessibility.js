import * as tf from "@tensorflow/tfjs";
import { parseNumber } from "../../scripts/train-accessibility-model.mjs";

let model = null;
let schema = null;

const MODEL_PATH = "/models/accessibility_model/model.json";
const SCHEMA_PATH = "/models/schema.json";

export async function loadModel() {
  if (!model) model = await tf.loadLayersModel(MODEL_PATH);
  if (!schema) schema = await (await fetch(SCHEMA_PATH)).json();
}

function encodeFeature(feature) {
  const props = feature.properties || {};
  const vector = [];

  // numeric
  for (const key of schema.numericKeys) {
    const x = parseNumber(props[key], key);
    const { mean, std } = schema.numericStats[key];
    const missing = x == null ? 1 : 0;
    let z = x == null ? 0 : (x - mean) / std;
    if (z > 5) z = 5;
    if (z < -5) z = -5;
    vector.push(z, missing);
  }

  // categorical
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

export async function predictAccessibility(feature) {
  await loadModel();
  const vector = encodeFeature(feature);
  const input = tf.tensor2d([vector]);
  const pred = model.predict(input);
  const probabilities = await pred.data();

  const classes = ["no", "limited", "yes"];
  const maxIdx = probabilities.indexOf(Math.max(...probabilities));

  return {
    prediction: classes[maxIdx],
    probabilities: Array.from(probabilities),
    confidence: probabilities[maxIdx],
  };
}
