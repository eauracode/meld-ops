import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen shows live, per-user data behind sign-in, so pages render per request.
  // Cache Components (static shells) would add Suspense boundaries everywhere for no gain.
  cacheComponents: false,
};

export default nextConfig;
