/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Quality is enforced via `yarn typecheck`; don't block builds on optional ESLint setup.
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // Silence optional dependency warnings from WalletConnect / wagmi.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // MetaMask SDK pulls in an optional React-Native storage module we don't use.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

module.exports = nextConfig;
