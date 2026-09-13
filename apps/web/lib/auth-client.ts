import { createAuthClient } from "better-auth/client";

/**
 * Better Auth client for apps/web browser components (ADR-0003, Amendment 2).
 *
 * Uses the pinned `better-auth@1.7.4` client API. Requests to `/api/auth/*`
 * are proxied by Next.js route handler (`app/api/auth/[...all]/route.ts`)
 * directly to `apps/api` with zero modification of headers or cookies.
 */
export const authClient = createAuthClient();
