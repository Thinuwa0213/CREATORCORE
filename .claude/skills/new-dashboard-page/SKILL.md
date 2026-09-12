---
name: new-dashboard-page
description: Use when adding a new page/screen to the CreatorCore web dashboard. Enforces docs/DESIGN_SYSTEM.md conventions, authorization checks, and required UI states instead of freestyling layout and styling.
---

# New dashboard page

Not usable yet in the literal sense — the dashboard application doesn't exist in this repository as of Phase 0. This skill documents the conventions that will apply the moment dashboard work begins, so the first page is built correctly rather than establishing bad patterns that later pages copy.

## Steps (apply once the dashboard app exists)

1. **Read `docs/DESIGN_SYSTEM.md` first.** Reuse existing layout primitives, spacing scale, and component patterns — do not invent new visual language for this page. If the design system doesn't yet cover a case you need, that's a gap to raise, not license to freestyle.
2. **Determine tenant/guild scope before writing any UI.** Every dashboard page operates within some authorization scope (a specific tenant, a specific guild, or platform-admin). Identify which, and confirm the underlying API enforces it server-side — the page must never rely on hiding a button as its only access control (see `docs/SECURITY.md`).
3. **Cover every required state**, not just the happy path: loading, empty, error, and success. A page with only a success state is incomplete per `docs/DESIGN_SYSTEM.md`.
4. **No fabricated data.** If a metric or list isn't backed by a real data source yet, the page must show an explicit "not available" state — never placeholder numbers that look real (`docs/DESIGN_SYSTEM.md`'s anti-pattern list, `ui-reviewer` checks for this).
5. **Reuse the existing navigation and interaction patterns** for destructive actions, save flows, and confirmations — don't introduce a one-off pattern for this page alone.
6. **Accessibility is not optional**: labeled form fields, sufficient contrast against documented color roles, full keyboard operability.
7. **Add tests matching the app's declared test gates** (`creatorcore.testGates` in the app's `package.json`) — component/unit tests for logic, and a Playwright E2E spec under `apps/<app>/e2e/` if the app declares `e2e: true`.

## Before finishing

Run the app's lint/typecheck/test scripts and invoke the `ui-reviewer` subagent against the new page before calling it done. Report actual results, not intentions.
