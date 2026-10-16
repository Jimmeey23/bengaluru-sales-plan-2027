/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module: keep it external to the server bundle.
  serverExternalPackages: ['better-sqlite3'],
  // The schema and the derived evidence files are read with fs at runtime, which the bundler cannot
  // see; without this they are missing from the serverless function and every request fails.
  outputFileTracingIncludes: {
    '/**': ['./lib/db/schema.sql', './data/derived/**/*', './data/source/**/*'],
  },
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // The app is previewed through a proxied host, so dev-server asset requests come from a
  // different origin than localhost. Without this, Next blocks them and the preview breaks.
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev', '*.arena.ai', 'localhost', '127.0.0.1'],
};
export default nextConfig;
