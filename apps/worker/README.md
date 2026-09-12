# @creatorcore/worker

Long-running Discord worker process foundation (`docs/adr/0005-discord-runtime.md`).

## What exists in Phase 2

- A lifecycle state machine (`starting -> running -> stopping -> stopped`), logged on every transition.
- `SIGTERM`/`SIGINT` handling that runs cleanup exactly once and exits cleanly, even if cleanup throws.
- Validated, typed worker configuration (`@creatorcore/config`) — no database credentials (apps/worker never touches MySQL directly, `docs/adr/0002`).
- A heartbeat log every 30s so the process is visibly alive without faking a Discord connection.

## What does not exist yet — deliberately

- **No discord.js `Client`.** `docs/adr/0005` is locked architecture, not implemented. `discord.js` is installed (the Phase 2 brief explicitly permits this as a locked runtime dependency) but nothing imports it yet.
- **No worker identity/auth contracts (`WorkerId`, `WorkerIdentity`, `WorkerAccessScope`).** `docs/adr/0011-worker-service-identity.md` locks the _direction_ (bootstrap secret → short-lived scoped credential), but Phase 2's `apps/api` exposes only `/health` and `/ready` — there is no real worker-facing endpoint yet for these types to describe a contract _between_. Per the Phase 2 brief's own conditional ("only if genuinely needed by current worker/API boundaries"), creating them now would be speculative. They belong in a shared package (not duplicated in both apps) once `apps/api` actually implements a worker-facing endpoint — tracked as Phase 3+ work.
- **`WorkerLifecycleState` (`src/lifecycle.ts`) is local, not shared**, for the same reason — nothing outside this process consumes it yet.
- **No bootstrap secret, no JWT/token signing.** Building authentication logic now, with nothing on the other end to authenticate against, would be exactly the "fake implementation to look complete" the brief warns against.
