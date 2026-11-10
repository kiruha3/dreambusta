import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext inspects multipart POSTs for progressive actions before API routing.
  // A book includes its original file (25 MiB) and extracted text (10 MiB).
  experimental: { serverActions: { bodySizeLimit: '40mb' } },
};

export default nextConfig;
