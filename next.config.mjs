/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['recharts'],
    experimental: {
        serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
    },
};

export default nextConfig;
