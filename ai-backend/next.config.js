/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native-module / heavy server packages out of the browser bundle.
  // pdf-parse uses require('fs'), ioredis/bullmq have Node-only internals.
  // argon2 has native C++ bindings — will never work in the browser.
  // NOTE: In Next.js 14 this lives under `experimental`. It moves to the
  //       top-level `serverExternalPackages` key in Next.js 15.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'ioredis', 'bullmq', 'argon2', 'nodemailer'],
  },

  // Allow images from Cloudinary and Supabase storage used by vehicle cards
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

module.exports = nextConfig;
