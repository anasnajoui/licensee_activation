import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.circle.so',
      },
      {
        protocol: 'https',
        hostname: 'assets-v2.circle.so',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
      },
      {
        protocol: 'https',
        hostname: 'www.acquisition.com',
      },
       {
        protocol: 'https',
        hostname: 'blog.logomyway.com',
      },
       {
        protocol: 'https',
        hostname: 'www.amst.com',
      },
      // Add other necessary hostnames here if needed
    ],
  },
};

export default nextConfig;
