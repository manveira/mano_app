/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
  },
  async rewrites() {
    // En dev, proxea /api/* al backend local para evitar CORS.
    // En producción nginx hace lo mismo, así que el comportamiento es idéntico.
    if (process.env.NODE_ENV === 'development') {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080'
      return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }]
    }
    return []
  },
}

module.exports = nextConfig
