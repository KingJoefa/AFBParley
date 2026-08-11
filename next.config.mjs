/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react']
  },
}

export default nextConfig
