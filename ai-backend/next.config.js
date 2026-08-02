/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolated from Tashus_Frontend_V1 — separate Vercel project
  // No rewrites to Tashus routes — all Tashus calls go through tashus-adapter only
  experimental: {
    // Keep all server-only packages out of the browser bundle.
    // In Next.js 14 this is the correct location (renamed to serverExternalPackages in v15).
    serverComponentsExternalPackages: ['pdf-parse', 'ioredis', 'bullmq', 'argon2'],
  },
};

module.exports = nextConfig;
