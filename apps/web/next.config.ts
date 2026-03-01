import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yt/core", "@yt/contracts", "@yt/sdk"],
};

export default nextConfig;
