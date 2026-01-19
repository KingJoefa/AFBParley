/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react']
  },
  outputFileTracingIncludes: {
    '/app/api/lines/status/route': ['my-parlaygpt/data/lines/**'],
    '/app/api/market/suggest/route': ['my-parlaygpt/data/lines/**'],
  },
}

export default nextConfig
