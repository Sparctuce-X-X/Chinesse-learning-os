import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Moteur Whisper natif (onnxruntime) : chargé par Node, pas empaqueté.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
};

export default nextConfig;
