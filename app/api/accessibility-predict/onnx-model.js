/**
 * ONNX Model Singleton for Accessibility Prediction
 * 
 * Loads the trained Gradient Boosting model converted to ONNX format
 * for real-time wheelchair accessibility predictions.
 */

import path from "path";
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
      
      // Load the model from the public directory
      const modelPath = path.join(process.cwd(), "public", "models", "accessibility_model.onnx");
      
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
  
  static isAvailable() {
    // If we haven't tried loading yet, assume it's available
    // The actual check happens in getInstance()
    if (!ortLoadAttempted) return true;
    return ort !== null && !ortLoadError;
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
