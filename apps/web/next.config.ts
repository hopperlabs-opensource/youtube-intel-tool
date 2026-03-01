import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yt/core", "@yt/contracts", "@yt/sdk", "@yt/experience-core"],
};

export default nextConfig;
