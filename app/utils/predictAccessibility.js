import * as tf from "@tensorflow/tfjs";
import { FEATURE_KEYS } from "../../scripts/train-accessibility-model.mjs";

let model = null;
let vocab = null;

const MODEL_PATH = "/models/accessibility_model/model.json";
const VOCAB_PATH = "/models/vocab.json";

export async function loadModel() {
  if (!model) {
    model = await tf.loadLayersModel(MODEL_PATH);
  }
  if (!vocab) {
    const response = await fetch(VOCAB_PATH);
    vocab = await response.json();
  }
}

export async function predictAccessibility(feature) {
  if (!model || !vocab) {
    await loadModel();
  }

  const props = feature.properties || {};
  const vector = [];

  FEATURE_KEYS.forEach((key) => {
    const val = props[key];
    const keyVocab = vocab[key] || [];

    // One-hot encode based on vocab
    keyVocab.forEach((vocabVal) => {
      vector.push(val === vocabVal ? 1 : 0);
    });
  });

  const input = tf.tensor2d([vector]);
  const prediction = model.predict(input);
  const probabilities = await prediction.data();

  // Classes: 0 (No), 1 (Limited), 2 (Yes)
  const classes = ["no", "limited", "yes"];
  const maxIdx = probabilities.indexOf(Math.max(...probabilities));

  return {
    prediction: classes[maxIdx],
    probabilities: Array.from(probabilities),
    confidence: probabilities[maxIdx],
  };
}
