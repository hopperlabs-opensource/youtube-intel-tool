import type { NextConfig } from "next";

const targetBase = process.env.YIT_BASE_URL || process.env.NEXT_PUBLIC_YIT_API_BASE_URL || "http://localhost:3333";

const nextConfig: NextConfig = {
  transpilePackages: ["@yt/contracts", "@yt/sdk", "@yt/experience-core"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${targetBase}/api/:path*`,
      },
      {
        source: "/metrics",
        destination: `${targetBase}/metrics`,
      },
    ];
  },
};

export default nextConfig;
