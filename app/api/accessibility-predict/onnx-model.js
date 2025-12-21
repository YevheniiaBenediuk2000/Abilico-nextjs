/**
 * ONNX Model Singleton for Accessibility Prediction
 * 
 * Loads the trained Gradient Boosting model converted to ONNX format
 * for real-time wheelchair accessibility predictions.
 */

import path from "path";
import fs from "fs";
import modelConfig from "./model_config.json" with { type: "json" };

// Deferred import to handle environments where onnxruntime-node isn't available
let ort = null;
let ortLoadError = null;
let ortLoadAttempted = false;

async function loadOrt() {
  if (ortLoadAttempted) return;
  ortLoadAttempted = true;
  
  try {
    ort = await import("onnxruntime-node");
    console.log("✅ onnxruntime-node loaded successfully");
  } catch (e) {
    ortLoadError = e;
    console.warn("⚠️ onnxruntime-node not available:", e.message);
  }
}

/**
 * Find the model file in various possible locations
 */
function findModelPath() {
  const possiblePaths = [
    // Standard Next.js public folder
    path.join(process.cwd(), "public", "models", "accessibility_model.onnx"),
    // Vercel serverless function path
    path.join(process.cwd(), ".next", "server", "app", "api", "accessibility-predict", "accessibility_model.onnx"),
    // Alternative Vercel path
    path.join("/var/task", "public", "models", "accessibility_model.onnx"),
    // Standalone output
    path.join(process.cwd(), ".next", "standalone", "public", "models", "accessibility_model.onnx"),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log(`✅ Found model at: ${p}`);
      return p;
    }
  }
  
  console.error("❌ Model file not found in any of:", possiblePaths);
  console.error("Current working directory:", process.cwd());
  console.error("Directory contents:", fs.readdirSync(process.cwd()));
  
  // Try to list public folder if it exists
  const publicPath = path.join(process.cwd(), "public");
  if (fs.existsSync(publicPath)) {
    console.error("Public folder contents:", fs.readdirSync(publicPath));
    const modelsPath = path.join(publicPath, "models");
    if (fs.existsSync(modelsPath)) {
      console.error("Models folder contents:", fs.readdirSync(modelsPath));
    }
  }
  
  return null;
}

class OnnxModelSingleton {
  static instance = null;
  static config = modelConfig;

  static async getInstance() {
    // Ensure ONNX runtime is loaded
    await loadOrt();
    
    if (ortLoadError) {
      throw new Error(`ONNX runtime not available: ${ortLoadError.message}`);
    }
    
    if (this.instance === null) {
      console.log("Loading ONNX accessibility model...");
      
      // Find the model file
      const modelPath = findModelPath();
      if (!modelPath) {
        throw new Error("Model file not found. Check deployment includes public/models/accessibility_model.onnx");
      }
      
      this.instance = await ort.InferenceSession.create(modelPath, {
        executionProviders: ["cpu"],
        graphOptimizationLevel: "all",
      });
      
      console.log("ONNX accessibility model loaded successfully!");
      console.log(`Model: ${this.config.model_name}`);
      console.log(`Features: ${this.config.feature_columns.length}`);
    }
    return this.instance;
  }

  static getConfig() {
    return this.config;
  }
  
  static async checkAvailability() {
    // Try loading ONNX if not attempted yet
    await loadOrt();
    return ort !== null && !ortLoadError;
  }
  
  static isAvailable() {
    // If we haven't tried loading yet, we don't know
    if (!ortLoadAttempted) return null;
    return ort !== null && !ortLoadError;
  }
  
  static getLoadError() {
    return ortLoadError;
  }
}

// Keep warm in development (avoid re-loading on hot-reload)
let singleton;
if (process.env.NODE_ENV !== "production") {
  if (!global.OnnxModelSingleton) {
    global.OnnxModelSingleton = OnnxModelSingleton;
  }
  singleton = global.OnnxModelSingleton;
} else {
  singleton = OnnxModelSingleton;
}

export default singleton;
