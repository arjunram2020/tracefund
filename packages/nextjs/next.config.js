// Baseline security response headers for every route. These are low-risk and
// don't interfere with wallet connections (WalletConnect/MetaMask): we scope
// the Content-Security-Policy to `frame-ancestors` (anti-clickjacking) only,
// leaving a full script/connect CSP for a later, tested pass.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Quality is enforced via `yarn typecheck`; don't block builds on optional ESLint setup.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
