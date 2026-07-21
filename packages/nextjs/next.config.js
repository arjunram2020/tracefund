// Baseline security response headers for every route. Content-Security-Policy
// covers script/style/connect/frame sources (not just frame-ancestors): it
// restricts everything to same-origin by default, blocks <object>/plugins and
// foreign form targets, and only opens up what wallet connections actually
// need. Two directives stay intentionally broad rather than pinned to one
// vendor, because the RPC endpoint and WalletConnect relay are runtime/env
// configured (NEXT_PUBLIC_*, not compile-time constants):
//   - connect-src allows https:/wss: broadly (the RPC provider — Alchemy,
//     public Base RPC, etc. — and the WalletConnect relay both vary by env).
//   - script/style keep 'unsafe-inline' because Next.js's App Router hydration
//     bootstrap and Tailwind's inline styles need it without a nonce-based
//     middleware pass (a stricter, nonce-based CSP is a further hardening
//     step, not yet done).
// Narrow connect-src to the deployment's actual RPC + relay hosts once they're
// pinned, and verify the wallet-connect flow (MetaMask + WalletConnect QR)
// after any CSP change — a misconfigured connect-src silently breaks RPC calls.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

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
  { key: "Content-Security-Policy", value: CSP },
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
