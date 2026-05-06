/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['recharts'],
    serverExternalPackages: ['@anthropic-ai/sdk'],
};

export default nextConfig;
