import type { NextConfig } from "next";

const pagesBuild = process.env.EXCOGITARE_PAGES === "true";
const pagesBasePath = "/Excogitare";
const pagesWebpack: NonNullable<NextConfig["webpack"]> = (config) => {
  config.resolve.fallback = {
    ...config.resolve.fallback,
    module: false,
    url: false,
  };
  return config;
};

const nextConfig: NextConfig = {
  output: pagesBuild ? "export" : undefined,
  basePath: pagesBuild ? pagesBasePath : "",
  assetPrefix: pagesBuild ? pagesBasePath : "",
  trailingSlash: pagesBuild,
  images: {
    unoptimized: pagesBuild,
  },
  ...(pagesBuild ? { webpack: pagesWebpack } : {}),
  env: {
    NEXT_PUBLIC_EXCOGITARE_SITE_URL: pagesBuild
      ? "https://angeladmerkel.github.io/Excogitare"
      : process.env.NEXT_PUBLIC_EXCOGITARE_SITE_URL ?? "http://localhost:3000",
  },
};

export default nextConfig;
