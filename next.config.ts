import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

// Stripe.js and Elements require these origins. Tighten with nonces before launch (see README checklist).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.stripe.com ${supabaseHost}`,
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com ${supabaseHost} ${supabaseHost.replace("https://", "wss://")}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfkit"],
  // File uploads: expense receipts (5 MB) and project images (several files, 28 MB total enforced in code).
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Private areas must never be indexed.
      {
        source: "/(admin|dashboard|sign-in|register|reset-password|receipts|auth|unsubscribe)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
