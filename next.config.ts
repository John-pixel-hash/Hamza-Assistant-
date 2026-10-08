import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allows the hosted preview proxy (and any other host you run this on) to
  // reach the dev server. Production deployments do not need this.
  allowedDevOrigins: ['*.e2b.app', '*.vercel.app', 'localhost:3000'],

  // Server Actions check the request origin against the host, so a proxied
  // preview URL is refused by default and drafting silently fails with
  // "Invalid Server Actions request" while the page itself looks fine.
  // Production on Vercel matches the host automatically, so this only widens
  // what the preview and local runs accept.
  experimental: {
    serverActions: {
      allowedOrigins: ['*.e2b.app', '*.vercel.app', 'localhost:3000', '127.0.0.1:3000'],
    },
  },
};

export default nextConfig;
