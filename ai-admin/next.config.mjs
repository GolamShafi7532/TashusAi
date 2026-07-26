/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_AI_BACKEND_URL || 'http://localhost:3001';
    return [
      {
        // Proxy all /api/ai/* requests through the admin server to avoid CORS.
        // The admin (port 3000) rewrites them to the backend (port 3001) server-side.
        source: '/api/ai/:path*',
        destination: `${backendUrl}/api/ai/:path*`,
      },
    ];
  },
};

export default nextConfig;
