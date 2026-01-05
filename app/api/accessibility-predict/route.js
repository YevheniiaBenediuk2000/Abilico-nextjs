/**
 * Accessibility Prediction API Route
 *
 * Predicts wheelchair accessibility for places based on OSM features
 * using a trained ML model converted to ONNX format.
 *
 * Supports 3-class classification:
 * - accessible (wheelchair=yes or designated)
 * - limited (wheelchair=limited)
 * - not_accessible (wheelchair=no)
 *
 * POST /api/accessibility-predict
 * Body: { places: [{ amenity: "restaurant", building: "yes", ... }] }
 *
 * GET /api/accessibility-predict?amenity=restaurant&building=yes
 *
 * Response: {
 *   predictions: [{
 *     label: "accessible" | "limited" | "not_accessible",
 *     probability: 0.85,
 *     confidence: "high" | "medium" | "low",
 *     probabilities: { accessible: 0.85, limited: 0.10, not_accessible: 0.05 }
 *   }]
 * }
 */

import { NextResponse } from "next/server";
import OnnxModelSingleton from "./onnx-model.js";
import {
  encodeFeatures,
  encodeBatch,
  explainFeatures,
  getContributingFeatures,
} from "./feature-encoder.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Dynamic import for onnxruntime-node (may not be available in all environments)
let ort = null;
async function getOrt() {
  if (!ort) {
    ort = await import("onnxruntime-node");
  }
  return ort;
}

/**
 * Determine confidence level based on probability distance from 0.5
 */
function getConfidence(probability) {
  const distance = Math.abs(probability - 0.5);
  if (distance > 0.35) return "high";
  if (distance > 0.15) return "medium";
  return "low";
}

/**
 * Run inference on the ONNX model
 */
async function runInference(places, options = {}) {
  const ortModule = await getOrt();
  const session = await OnnxModelSingleton.getInstance();
  const config = OnnxModelSingleton.getConfig();

  const numFeatures = config.feature_columns.length;
  const batchSize = places.length;
  const numClasses = config.n_classes || 2;
  const labels = config.labels || ["not_accessible", "accessible"];

  // Encode features
  const featuresArray = encodeBatch(places);

  // Create ONNX tensor
  const inputTensor = new ortModule.Tensor("float32", featuresArray, [
    batchSize,
    numFeatures,
  ]);

  // Run inference
  const feeds = { [config.input_name]: inputTensor };
  const results = await session.run(feeds);

  // Extract predictions - the model outputs label and probabilities tensors
  const labelData = results.output_label?.data || results.label?.data;
  const probData =
    results.output_probability?.data || results.probabilities?.data;

  // Format results
  const predictions = [];
  for (let i = 0; i < batchSize; i++) {
    const predictedClassIdx = labelData ? Number(labelData[i]) : 0;

    // Build probabilities object for all classes
    const classProbabilities = {};
    let maxProb = 0;

    if (probData && probData.length) {
      // Each sample has numClasses probability values
      for (let c = 0; c < numClasses; c++) {
        const prob = probData[i * numClasses + c] ?? 0;
        classProbabilities[labels[c]] = Math.round(prob * 1000) / 1000;
        if (prob > maxProb) maxProb = prob;
      }
    } else {
      // Fallback if no probabilities available
      labels.forEach((label, idx) => {
        classProbabilities[label] = idx === predictedClassIdx ? 1.0 : 0.0;
      });
      maxProb = 1.0;
    }

    const labelName = labels[predictedClassIdx] || "unknown";

    const prediction = {
      label: labelName,
      probability: Math.round(maxProb * 1000) / 1000,
      confidence: getConfidence(maxProb),
      probabilities: classProbabilities,
    };

    // Always include the top contributing features (based on feature importance)
    prediction.basedOn = getContributingFeatures(places[i], 3);

    // Include full feature explanation if requested
    if (options.explain) {
      prediction.features = explainFeatures(places[i]);
    }

    predictions.push(prediction);
  }

  return {
    predictions,
    model: config.model_name,
    n_classes: numClasses,
    metrics: config.metrics,
  };
}

/**
 * GET handler - predict for a single place from query parameters
 */
export async function GET(request) {
  try {
    // Check if ONNX runtime is available
    const isAvailable = await OnnxModelSingleton.checkAvailability();
    if (!isAvailable) {
      const loadError = OnnxModelSingleton.getLoadError();
      return NextResponse.json(
        {
          error: "ML model not available in this environment",
          hint: "ONNX runtime requires native binaries not available on serverless",
          details: loadError?.message || "Unknown error",
        },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Build place object from query params
    const place = {};
    for (const [key, value] of searchParams.entries()) {
      if (key !== "explain") {
        place[key] = value;
      }
    }

    if (Object.keys(place).length === 0) {
      return NextResponse.json(
        {
          error: "No features provided. Pass OSM tags as query parameters.",
          example: "/api/accessibility-predict?amenity=restaurant&building=yes",
          available_features: [
            "amenity",
            "shop",
            "tourism",
            "building",
            "entrance",
            "door",
            "automatic_door",
            "access",
            "level",
            "healthcare",
            "office",
            "bench",
            "changing_table",
            "indoor",
          ],
        },
        { status: 400 }
      );
    }

    const explain = searchParams.get("explain") === "true";
    const result = await runInference([place], { explain });

    return NextResponse.json({
      ...result.predictions[0],
      model: result.model,
    });
  } catch (error) {
    console.error("Accessibility prediction error:", error);
    return NextResponse.json(
      { error: error.message || "Prediction failed" },
      { status: 500 }
    );
  }
}

/**
 * POST handler - predict for multiple places
 */
export async function POST(request) {
  try {
    // Check if ONNX runtime is available
    const isAvailable = await OnnxModelSingleton.checkAvailability();
    if (!isAvailable) {
      const loadError = OnnxModelSingleton.getLoadError();
      return NextResponse.json(
        {
          error: "ML model not available in this environment",
          hint: "ONNX runtime requires native binaries not available on serverless",
          details: loadError?.message || "Unknown error",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { places, explain = false } = body;

    if (!places || !Array.isArray(places) || places.length === 0) {
      return NextResponse.json(
        {
          error: "Invalid request. Provide 'places' array with OSM features.",
          example: {
            places: [
              { amenity: "restaurant", building: "yes" },
              { shop: "supermarket", automatic_door: "yes" },
            ],
          },
        },
        { status: 400 }
      );
    }

    // Limit batch size
    if (places.length > 100) {
      return NextResponse.json(
        { error: "Batch size limited to 100 places per request." },
        { status: 400 }
      );
    }

    const result = await runInference(places, { explain });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Accessibility prediction error:", error);
    return NextResponse.json(
      { error: error.message || "Prediction failed" },
      { status: 500 }
    );
  }
}
