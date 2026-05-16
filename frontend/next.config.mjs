/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["wagmi", "@wagmi/core", "@wagmi/connectors", "viem", "@tanstack/react-query"],
};

export default nextConfig;
