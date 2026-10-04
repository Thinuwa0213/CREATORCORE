import { cookies, headers } from "next/headers";
import { loadWebServerConfig } from "@creatorcore/config/web-server";

export interface SessionData {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: string;
  };
}

/**
 * Server-side helper to get the authenticated session from Better Auth via apps/api.
 *
 * Runs only on the server (Server Components / Server Actions).
 * Forwards the browser's incoming cookies verbatim.
 */
export async function getServerSession(): Promise<SessionData | null> {
  const { API_INTERNAL_URL } = loadWebServerConfig();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  if (!cookieHeader) {
    return null;
  }

  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/auth/get-session`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as SessionData | null;
    return data && data.user ? data : null;
  } catch {
    return null;
  }
}

/**
 * Server-side helper to make authenticated, origin-checked calls to apps/api.
 *
 * Forwards the browser's real Origin header verbatim (docs/SECURITY.md,
 * apps/api/src/middleware/origin-check.ts) for state-changing requests, and
 * forwards the session cookie.
 */
export async function callApiServer<T = unknown>(
  subPath: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    body?: unknown;
  } = {},
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const { API_INTERNAL_URL } = loadWebServerConfig();
  const cookieStore = await cookies();
  const reqHeaders = await headers();

  const method = options.method ?? "GET";
  const forwardHeaders = new Headers();

  const cookieStr = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const rawCookie = cookieStr || reqHeaders.get("cookie");
  if (rawCookie) {
    forwardHeaders.set("cookie", rawCookie);
  }

  // Forward Origin header verbatim for CSRF check
  const incomingOrigin = reqHeaders.get("origin");
  if (incomingOrigin) {
    forwardHeaders.set("origin", incomingOrigin);
  } else {
    // If invoked from Server Component or internal navigation without Origin,
    // construct from Host/Proto to satisfy the origin check on the internal hop.
    const host = reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host");
    const proto = reqHeaders.get("x-forwarded-proto") ?? "http";
    if (host) {
      forwardHeaders.set("origin", `${proto}://${host}`);
    }
  }

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (options.body !== undefined && !isFormData) {
    forwardHeaders.set("content-type", "application/json");
  }

  try {
    const init: RequestInit = {
      method,
      headers: forwardHeaders,
      cache: "no-store",
    };
    if (options.body !== undefined) {
      init.body = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
    }

    const res = await fetch(`${API_INTERNAL_URL}${subPath}`, init);

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await res.json() : undefined;

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (payload as { error?: string })?.error ?? `Request failed with status ${res.status}`,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: payload as T,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "Internal network error",
    };
  }
}
