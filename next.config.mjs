import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optional; keep if you’re using standalone output
  // output: 'standalone',

  // Next.js 16: `experimental.serverComponentsExternalPackages` was renamed.
  // Keeping this correct avoids config warnings and weird root inference behavior.
  serverExternalPackages: ['sharp', 'onnxruntime-node'],

  // Ensure Turbopack treats this folder as the project root (we have another lockfile one level up).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;


