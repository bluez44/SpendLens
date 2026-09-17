# Roadmap — SpendLens App Improvement (post user review)

**Date:** 2026-09-17
**Source:** [`docs/product-review/2026-09-17-gen-z-user-review.md`](../../product-review/2026-09-17-gen-z-user-review.md)
**Status:** Roadmap approved. Sub-project A implemented on `main`; B–F not yet designed.

## Goal

Reduce the friction of logging a spend and give young users more reasons to open the app daily, while keeping the project's conventions: camera is the launch screen, no tab bar, all data access through context providers, `vi` + `en` i18n, Expo SDK 57 pinned.

## Non-goals

- Backup / restore / cloud sync (explicitly excluded by the product owner for this roadmap).
- Sign-in / accounts.
- Anything listed under sub-project G (backlog only).

## Sub-projects

| Order | Sub-project | Depends on | Done when |
|---|---|---|---|
| 1 | **A — Bug fixes & foundation polish** | — | Review bugs B1–B6 fixed with regression tests; no hardcoded money/status hex colours; every icon-only button has an accessibility label. Spec: [`2026-09-17-foundation-polish-design.md`](./2026-09-17-foundation-polish-design.md) |
| 2 | **B — Ultra-fast entry** | A (clean `entry.tsx`) | An expense can be saved with only amount + category (note optional); ≤ 3 taps from launch to saved without a photo; pick photo from library on camera; save toast with Undo + haptics; frequent-entry suggestions |
| 3 | **C — Navigation & onboarding** | B (dock must host the quick-add entry point) | Floating labelled dock on camera replaces the ⌂/☰ pair; one-time 3-step onboarding + coachmarks; consistent custom headers and ✕ (modal) / ← (push) convention; share-card entry moved off the camera |
| 4 | **D — Find & understand data** | C (new entry points) | Search + filters in History; previous/next period navigation with `/history-months` merged into History; donut/legend drill-down to a category's transactions; gallery shows photo txns only, grouped by month, virtualised; full-screen photo + duplicate on detail |
| 5 | **E — Smart budgets** | D (category-filtered list reused for budget drill-down) | Safe-to-spend today on camera pill + Home; per-category budgets; budget cycle starting on payday; income categories |
| 6 | **F — Habits & shareability** | E (card narratives use new budget data) | Streak milestones + weekly challenges; monthly recap card; share-card theme customisation; 7-day swipe-up card feed with position indicator. Home-screen widget is a separable item — split into its own sub-project if the native work is large |
| — | **G — Backlog** | — | Recorded only: saving goals, split bill, wallets, receipt OCR, flexible subscription cycles, travel currencies / trip mode, shake-to-hide amounts |

## Operating rules

- Each sub-project runs the full cycle: spec (`docs/superpowers/specs/`) → TDD plan (`docs/superpowers/plans/`) → implementation → code review.
- Each sub-project lives on its own branch cut from `main` and is merged before the next one is brainstormed.
- Revisit this roadmap before writing each new spec; update order or scope here rather than silently diverging.

## Follow-ups from sub-project A

Noted during A's final review; not fixed there because they're out of A's scope or need design decisions from a later sub-project.

- Sub-project B: note preview on camera should use a distinct label (e.g. `a11y.edit_note` with the note text) instead of reusing `a11y.add_note`.
- Editing recomputes date/time from `createdAt` in the device's current timezone; a txn created in another timezone can shift day when edited (consequence of "create and edit behave identically").
- Flash button exposes on/off only via label; consider `accessibilityState`.
- tsconfig: ~1200 jest-global type errors in test files (likely missing `types: ["jest"]` for tests) + 3 pre-existing non-test tsc errors; 14 pre-existing eslint errors — separate cleanup.
