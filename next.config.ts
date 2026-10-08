import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allows the hosted preview proxy (and any other host you run this on) to
  // reach the dev server. Production deployments do not need this.
  allowedDevOrigins: ['*.e2b.app', '*.vercel.app', 'localhost:3000'],
};

export default nextConfig;
