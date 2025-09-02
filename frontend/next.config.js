import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(new URL('.', import.meta.url).pathname, '..'),
  // If you want to allow ESLint warnings during build only:
  // eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
