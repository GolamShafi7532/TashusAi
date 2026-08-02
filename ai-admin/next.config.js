/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native-module packages server-side only — never bundled into the browser.
  // argon2 uses native bindings; bullmq/ioredis must not appear in client bundles.
  experimental: {
    serverComponentsExternalPackages: ['bullmq', 'ioredis'],
  },

  // Allow images from Cloudinary (vehicle photos) and Supabase storage
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

module.exports = nextConfig;
