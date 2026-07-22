/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native module — must stay external to the bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
