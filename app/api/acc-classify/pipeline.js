import { pipeline, env } from "@huggingface/transformers";

// Node runtime (server) settings
env.cacheDir = "./.cache/transformers"; // keep cache OUTSIDE node_modules
env.allowRemoteModels = true; // allow downloading models on first run
env.remoteModelTimeout = 300000; // 5 minutes
env.remoteModelMaxRetries = 5;

// Use the Singleton pattern to keep the pipeline warm between requests & hot-reloads
const P = () =>
  class PipelineSingleton {
    static task = "zero-shot-classification";
    // "Xenova/distilbert-base-uncased-mnli"
    static model = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli";
    static instance = null;

    static async getInstance(progress_callback = console.log) {
      if (this.instance === null) {
        this.instance = await pipeline(this.task, this.model, {
          quantized: true,
          progress_callback,
        });
      }
      return this.instance;
    }
  };

let PipelineSingleton;
if (process.env.NODE_ENV !== "production") {
  if (!global.PipelineSingleton) global.PipelineSingleton = P();
  PipelineSingleton = global.PipelineSingleton;
} else {
  PipelineSingleton = P();
}

export default PipelineSingleton;
