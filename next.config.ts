import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // ativa exportação estática
  eslint: {
    ignoreDuringBuilds: true, // ignora ESLint no build
  },
};

export default nextConfig;
