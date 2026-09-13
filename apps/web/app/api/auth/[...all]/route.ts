import { loadWebServerConfig } from "@creatorcore/config/web-server";

/**
 * Transparent proxy for Better Auth's `/api/auth/*` surface (Phase 5 §1 —
 * the web->API identity boundary hard gate). `apps/web` never runs Better
 * Auth itself (ADR-0003: Better Auth lives only in `apps/api`) and never
 * inspects or decodes the session cookie here — every header, the request
 * body, and the response (status, body, every `Set-Cookie`) pass through
 * byte-for-byte. This is what makes the browser's session cookie a
 * same-origin, web-domain cookie (Better Auth's `baseURL` is configured to
 * `WEB_APP_ORIGIN`) while Better Auth's own logic runs entirely inside
 * `apps/api`.
 *
 * `redirect: "manual"` is required, not incidental: `/sign-in/social` and
 * the OAuth callback both respond with a 3xx redirect (to Discord's
 * consent screen, then back to this app) that the BROWSER must follow —
 * if this proxy auto-followed redirects server-side, the user would never
 * reach Discord's consent screen at all.
 */

const HOP_BY_HOP_REQUEST_HEADERS = new Set(["host", "content-length", "connection"]);
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
]);

/**
 * Every real Better Auth path segment (`sign-in`, `social`, `callback`,
 * `discord`, `get-session`, ...) is plain alphanumeric/hyphen/underscore.
 * Validated explicitly here rather than relying solely on Next.js's own
 * URL/route-param normalization to keep `..`, empty segments, or other
 * traversal-shaped input from ever reaching the target-URL string built
 * below (security review: this proxy is the one place a request path
 * segment flows into a URL constructed for a second, internal-only fetch —
 * apps/api's own path-allowlist middleware is a second, independent layer
 * over the *resolved* path, not a substitute for validating the pieces
 * that build it).
 */
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

async function proxyToApi(request: Request, pathSegments: string[]): Promise<Response> {
  if (pathSegments.length === 0 || !pathSegments.every((segment) => SAFE_PATH_SEGMENT.test(segment))) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const { API_INTERNAL_URL } = loadWebServerConfig();
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(
    `/api/auth/${pathSegments.join("/")}${requestUrl.search}`,
    API_INTERNAL_URL,
  );

  const forwardedHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardedHeaders.append(key, value);
    }
  });

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: forwardedHeaders,
    body: hasBody ? await request.arrayBuffer() : null,
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie") {
      responseHeaders.append(key, value);
    }
  });
  // Headers.forEach collapses multiple Set-Cookie values into one -- each
  // cookie (session, any other Better Auth sets) must be forwarded as its
  // own header, so they are read and re-appended individually.
  for (const cookie of upstreamResponse.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

interface RouteParams {
  params: Promise<{ all: string[] }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const { all } = await params;
  return proxyToApi(request, all);
}

export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const { all } = await params;
  return proxyToApi(request, all);
}
