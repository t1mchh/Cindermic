/** @type {import('next').NextConfig} */
export default {
  turbopack: { root: import.meta.dirname },
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  agentRules: false,
  devIndicators: false,
};
