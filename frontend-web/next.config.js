/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const nextConfig = {
  transpilePackages: ['@integrame/shared'],
  images: {
    domains: ['api.dicebear.com', 'ui-avatars.com'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: API_URL + '/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
