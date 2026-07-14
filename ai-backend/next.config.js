/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolated from Tashus_Frontend_V1 — separate Vercel project
  // No rewrites to Tashus routes — all Tashus calls go through tashus-adapter only
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'ioredis', 'bullmq'],
  },
  // Prevent accidental bundling of server-only secrets
  serverExternalPackages: ['argon2'],
};

module.exports = nextConfig;
