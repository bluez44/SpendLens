# SpendLens — UI implementation

Locket-style photographic expense diary. Open straight into a camera, snap a
purchase, add the amount and a note, then browse day/week/month summaries and
charts. Implemented from `SpendLens.dc.html` in Vietnamese with VND (₫), light
and dark mode.

## Run it

```bash
npm install        # if you haven't already
npx expo start     # then press i / a, or scan with Expo Go
```

The UI uses packages already in `package.json` (`expo-camera`, `expo-sqlite`,
`expo-image`, `react-native-svg`, `react-native-safe-area-context`); the only
addition is `@expo-google-fonts/plus-jakarta-sans` for the typeface. Run
`npm install` once so it's present. The camera and SQLite are native modules, so
use a real device or simulator rather than the web target.

On first launch the database is seeded with the sample diary from the design so
every screen has realistic data immediately.

## Screens (camera-first Stack)

Routing was changed from the default tab bar to a camera-first `Stack`
(`src/app/_layout.tsx`). Files under `src/app`:

- `index.tsx` — **Camera**. Launch screen. Home button (→ dashboard), today's
  spend pill, menu (→ history), live viewfinder with a "Thêm ghi chú…" bar, a
  flash toggle, a front/back flip, and the shutter. Capturing routes to the
  entry screen with the photo.
- `entry.tsx` — **Nhập chi tiết**. Chi/Thu toggle, big amount field, category
  chips, note, and save. Doubles as the edit screen: with an `id` param it
  prefills from the transaction and updates instead of inserting.
- `home.tsx` — **Tổng quan**. Ngày/Tuần/Tháng segmented control, gradient
  balance card, monthly expense bar chart, and category donut.
- `history.tsx` — **Thu chi**. Ranged Thu/Chi/Chênh lệch summary and a
  day-grouped feed. A floating "Thư viện" button opens the gallery.
- `gallery.tsx` — **Thư viện**. Three-column photo grid with amount overlays.
- `transaction/[id].tsx` — **Chi tiết giao dịch**. Full photo header, amount,
  category, note, date, and type. The pencil opens the entry screen in edit
  mode; a "Xoá giao dịch" action deletes (with a confirm dialog) and returns to
  history.

## Architecture

- `src/constants/tokens.ts` — palette (peach→coral accent, expense `#FB5B4D`,
  income `#34C79A`), radii, font tokens, and a `useColors()` light/dark hook.
- `src/lib/db.ts` — existing SQLite schema (reused unchanged).
- `src/lib/transactions.ts` — typed repository over the `transactions` table
  plus pure aggregations (`summarize`, `filterRange`, `groupByDay`,
  `monthlyExpenseSeries`, `categoryBreakdown`).
- `src/lib/seed.ts` — sample diary matching the design (VND, Unsplash photos).
- `src/lib/transactions-context.tsx` — `TransactionsProvider` / `useTransactions`.
  Reads, adds, and seeds through SQLite, so data **persists** across launches.
- `src/lib/categories.ts`, `src/lib/format.ts` — localized to Vietnamese/VND.
- `src/components/sl/*` — shared primitives: gradient fill/button/shutter,
  segmented control, category chip, transaction row, bar chart, SVG donut, icons.
- `src/components/expense/category-icon.tsx` — existing SVG icons (reused).

Gradients are drawn with `react-native-svg` (a `GradientFill` component), so no
`expo-linear-gradient` dependency is required.

Typography is Plus Jakarta Sans. Because each weight is a separate font family,
`src/components/sl/text.tsx` wraps `Text`/`TextInput` and maps the style's
`fontWeight` to the matching family; the weights are loaded in `_layout.tsx`.

## Tests

Unit tests were updated for the localization and new VND helpers
(`src/lib/format.test.ts`, `src/lib/categories.test.ts`). Run with `npm test`.
The formatting and label logic was verified: `formatVND`, `signedVND`,
`compactK`, `compactTr`, and the Vietnamese `dayLabel` all pass.

## Next steps / known simplifications

- **Auth**: the `users` table in `db.ts` (Google sign-in) is scaffolded but not
  wired to any screen — intentionally left out for now.
- `.expo/types/router.d.ts` was reset to a permissive stub; expo-router
  regenerates the exact typed-route union on the next `expo start`.

## Done in the follow-up passes

- Plus Jakarta Sans wired up (installed, loaded, applied app-wide).
- Full edit + delete flow for transactions.
- Camera flash toggle and front/back flip.
