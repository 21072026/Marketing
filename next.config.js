/** @type {import('next').NextConfig} */

// Pragmatic CSP: same-origin by default; allow inline/eval for Next's runtime
// and styles, and data:/blob: images (avatars, CSV exports). Nothing in this app
// loads third-party scripts, so no host is allow-listed — keep it that way, and
// add hosts one path at a time if that ever changes.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  // Not `output: 'standalone'`: the deploy pipeline runs `prisma db push` and
  // `prisma migrate diff` (the destructive-schema guard) from one-off containers
  // of this same image, and the standalone bundle trims the Prisma CLI out of
  // node_modules. A slightly larger image buys a deploy that cannot half-work.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
