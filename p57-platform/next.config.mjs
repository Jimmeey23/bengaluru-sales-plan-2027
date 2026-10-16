/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module: keep it external to the server bundle.
  serverExternalPackages: ['better-sqlite3'],
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // The app is previewed through a proxied host, so dev-server asset requests come from a
  // different origin than localhost. Without this, Next blocks them and the preview breaks.
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev', '*.arena.ai', 'localhost', '127.0.0.1'],
};
export default nextConfig;
