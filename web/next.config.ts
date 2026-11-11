import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "export",
  basePath: "/AbsenControl",
  assetPrefix: "/AbsenControl/",
  trailingSlash: true,
};

export default nextConfig;
