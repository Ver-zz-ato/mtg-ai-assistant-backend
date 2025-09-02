const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Prevent style-only lint errors from failing production builds
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
