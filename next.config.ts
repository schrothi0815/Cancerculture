import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uploads.cancerculture.fun",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
