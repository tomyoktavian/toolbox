import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Local Proxy script is read from disk at request time; make sure a traced (standalone) build keeps it.
  outputFileTracingIncludes: {
    "/api/http-client/agent/script": ["./scripts/local-proxy.mjs"],
  },
};

export default nextConfig;
