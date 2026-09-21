// Cloudflare Workers entry. Wraps the static `dist/` bundle — served through
// the ASSETS binding — with the security-headers layer in
// src/security-headers.ts.
//
// A worker rather than wrangler's assets-only mode, which serves the SPA with
// no security headers at all.

import { applySecurityHeaders } from './security-headers'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request)
    return new Response(response.body, {
      status:     response.status,
      statusText: response.statusText,
      headers:    applySecurityHeaders(response.headers),
    })
  },
}
