import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yt/core", "@yt/contracts", "@yt/sdk", "@yt/experience-core"],
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
