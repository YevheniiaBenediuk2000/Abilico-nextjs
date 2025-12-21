/**
 * Accessibility Prediction API Route
 *
 * Predicts wheelchair accessibility for places based on OSM features
 * using a trained Gradient Boosting model converted to ONNX format.
 *
 * POST /api/accessibility-predict
 * Body: { places: [{ amenity: "restaurant", building: "yes", ... }] }
 *
 * GET /api/accessibility-predict?amenity=restaurant&building=yes
 *
 * Response: {
 *   predictions: [{
 *     label: "accessible" | "not_accessible",
 *     probability: 0.85,
 *     confidence: "high" | "medium" | "low"
 *   }]
 * }
 */

import { NextResponse } from "next/server";
import * as ort from "onnxruntime-node";
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
  const session = await OnnxModelSingleton.getInstance();
  const config = OnnxModelSingleton.getConfig();

  const numFeatures = config.feature_columns.length;
  const batchSize = places.length;

  // Encode features
  const featuresArray = encodeBatch(places);

  // Create ONNX tensor
  const inputTensor = new ort.Tensor("float32", featuresArray, [
    batchSize,
    numFeatures,
  ]);

  // Run inference
  const feeds = { [config.input_name]: inputTensor };
  const results = await session.run(feeds);

  // Extract predictions - the model outputs label and probabilities tensors
  const labels = results.output_label?.data || results.label?.data;
  const probabilities =
    results.output_probability?.data || results.probabilities?.data;

  // Format results
  const predictions = [];
  for (let i = 0; i < batchSize; i++) {
    const label = labels ? Number(labels[i]) : 1;

    // Probabilities are in format [class0_prob_sample0, class1_prob_sample0, class0_prob_sample1, class1_prob_sample1, ...]
    // With zipmap=False, each sample has 2 probability values (for class 0 and class 1)
    let accessibleProbability = 0.5;

    if (probabilities && probabilities.length) {
      // Each sample has 2 values: [prob_class_0, prob_class_1]
      const numClasses = 2;
      accessibleProbability = probabilities[i * numClasses + 1] ?? 0.5;
    }

    const labelName = label === 1 ? "accessible" : "not_accessible";
    const displayProbability =
      label === 1 ? accessibleProbability : 1 - accessibleProbability;

    const prediction = {
      label: labelName,
      probability: Math.round(displayProbability * 1000) / 1000,
      confidence: getConfidence(accessibleProbability),
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
    metrics: config.metrics,
  };
}

/**
 * GET handler - predict for a single place from query parameters
 */
export async function GET(request) {
  try {
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
