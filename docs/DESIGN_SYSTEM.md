# CreatorCore — Design System Rules

**Status:** Phase 0 engineering contract. No dashboard, brand aesthetic, or component library exists yet — this document defines _rules and anti-patterns_ the future dashboard must follow, not the visual design itself. Choosing an actual brand aesthetic, color palette, or component library is `[UNRESOLVED]`/deferred until explicitly requested.

## Intent

CreatorCore should read as a product a team designed on purpose — operationally clear, consistent, and boring where boring is correct. It should not read as AI-generated UI. Every rule below exists to prevent a specific failure mode of AI-generated dashboards.

## Rules by category (to be filled in with concrete token values in Phase 1, structure locked now)

- **Typography** — a single documented type scale (a fixed set of sizes/weights), used consistently. No page invents its own font size. Heading levels reflect semantic hierarchy, not desired visual size.
- **Spacing** — a single spacing scale (e.g., a 4px/8px-based system). No arbitrary one-off spacing values.
- **Radius** — a small, fixed set of border-radius values tied to component type (e.g., inputs vs. cards vs. buttons), not chosen per-instance.
- **Borders** — a documented set of border colors/weights tied to semantic roles (default, focus, error), not arbitrary per-component values.
- **Surfaces** — a documented set of background/elevation levels. Nesting bordered/shadowed containers inside each other without a functional reason (a "card inside a card") is disallowed.
- **Color roles** — colors are assigned semantic roles (primary action, destructive, warning, success, muted text, etc.) and referenced by role, not by raw value, in component code. No arbitrary gradients or glow effects as decoration.
- **Buttons** — a fixed, small set of button variants (primary, secondary, destructive, ghost) reused everywhere; no page invents a new button style.
- **Forms** — consistent label placement, validation-error presentation, and required-field indication across every form in the product.
- **Navigation** — one consistent navigation pattern; a user should never have to relearn how to move around the product on a new page.
- **Tables/lists** — consistent row density, sorting/filtering affordances, and pagination pattern across every data table.
- **Dialogs** — a single modal/dialog pattern for confirmations and forms-in-context; destructive actions always confirm the same way everywhere.
- **Empty states** — every list/table/dashboard view defines what it looks like with zero data — never left as an accidental blank screen.
- **Loading states** — every async view defines a loading state — never a flash of empty/incorrect content.
- **Error states** — every async view defines what a failed load looks like, with a safe, non-leaking error message (see `docs/SECURITY.md` on safe error responses).
- **Icons** — icons communicate meaning (status, action affordance) — not decoration. An icon with no functional purpose is a smell.
- **Motion** — used to communicate state change (loading, transition, feedback), not as decoration. No motion by default that a user can't disable if it affects accessibility.
- **Responsive behavior** — every page works down to common breakpoints; no fixed-width layout that breaks on smaller screens.
- **Accessibility** — WCAG-conscious by default: labeled inputs, sufficient contrast within the documented color roles, full keyboard operability, focus visible.

## Explicit anti-patterns (what `ui-reviewer` checks for)

Card-inside-card layouts; arbitrary gradients; random glow effects; badges added for decoration rather than real state; excessive/inconsistent rounded corners; arbitrary one-off Tailwind (or equivalent) values instead of tokens; inconsistent spacing; inconsistent typography; decorative icons with no purpose; fake/placeholder analytics presented as real; unnecessary marketing-style hero sections on operational screens; inconsistent interaction patterns for the same action across screens.

## Component reuse `[LOCKED — principle]`

Future UI work reuses one controlled component system. No feature invents its own visual language, its own button component, or its own modal implementation. Which component library (e.g., a headless primitives library plus a styling approach) is `[UNRESOLVED]` for Phase 1, but the _principle_ of a single shared, controlled component system is locked now.

## What this document deliberately does not do

It does not choose a brand color, logo, font family, or overall aesthetic. Those are product decisions to make explicitly and intentionally when dashboard work actually begins — not defaults an AI assistant should invent.
