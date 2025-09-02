// frontend/next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // We’re building from /frontend on Render, but file tracing may
  // touch the repo root, so point one level up.
  outputFileTracingRoot: path.join(__dirname, '..'),
  // If build fails on lint-only issues, you can temporarily enable:
  // eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
