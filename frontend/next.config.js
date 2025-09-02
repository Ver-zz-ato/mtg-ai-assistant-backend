// frontend/next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Uncomment if ESLint warnings should not block builds:
  // eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
