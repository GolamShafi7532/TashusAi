/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native-module / heavy server packages out of the browser bundle.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'ioredis', 'bullmq', 'argon2'],
  },

  // Allow images from Cloudinary and Supabase storage used by vehicle cards
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },

  // Suppress env validation errors during the build phase.
  // All actual validation happens at runtime when real values are injected.
  // This prevents "Failed to collect page data" errors on Vercel builds where
  // env vars are not present during static analysis.
  env: {
    // These are read at build time only to prevent validation crash.
    // Real values come from Vercel Environment Variables at runtime.
    NEXT_PHASE: process.env.NEXT_PHASE,
  },
};

module.exports = nextConfig;
