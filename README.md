<div align="center">

<!-- TODO: replace with a rendered app logo (assets/logo/spendlens-logo-1024.png) -->
<img src="./assets/logo/spendlens-logo-1024.png" alt="SpendLens logo" width="140" />

# SpendLens

**A camera-first expense diary for Vietnamese users.** Snap a receipt, add the amount and a note, then browse day/week/month summaries and charts.

Inspired by Locket's photo-forward interaction — every expense begins with a photo.

</div>

---

## Screenshots

<!-- TODO: replace these with real screenshots (suggest 1080×2280 or scaled 320px width for GitHub). Store under docs/screenshots/. -->

<table>
  <tr>
    <td align="center"><img src="./docs/screenshots/camera.png" alt="Camera screen" width="220" /><br /><sub>Camera (index) — snap a receipt, tap the lower half of the viewfinder to add a quick note.</sub></td>
    <td align="center"><img src="./docs/screenshots/txn-card.png" alt="Today's transaction card" width="220" /><br /><sub>Swipe up on the camera to see today's transactions as full-screen Locket-style cards.</sub></td>
    <td align="center"><img src="./docs/screenshots/entry.png" alt="Entry screen" width="220" /><br /><sub>Nhập chi tiết — amount, category, note.</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./docs/screenshots/home.png" alt="Home / Tổng quan" width="220" /><br /><sub>Tổng quan — balance card, monthly budget bar, expense bar chart, category donut.</sub></td>
    <td align="center"><img src="./docs/screenshots/history.png" alt="History" width="220" /><br /><sub>Thu chi — day-grouped feed with income/expense/net summary.</sub></td>
    <td align="center"><img src="./docs/screenshots/gallery.png" alt="Gallery" width="220" /><br /><sub>Thư viện — every receipt in a photo grid.</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./docs/screenshots/transaction-detail.png" alt="Transaction detail" width="220" /><br /><sub>Chi tiết giao dịch — full photo, edit, delete.</sub></td>
    <td align="center"><img src="./docs/screenshots/settings.png" alt="Settings" width="220" /><br /><sub>Cài đặt — budget, reminders & budget alerts, language, app lock, theme, subscriptions, currency, data (CSV export, resets), about.</sub></td>
    <td align="center"><img src="./docs/screenshots/dark-mode.png" alt="Dark mode" width="220" /><br /><sub>Manual theme override — Auto / Light / Dark.</sub></td>
  </tr>
</table>

## Features

- **Camera-first capture.** Opens straight into the camera. Tap the lower half of the viewfinder to type a note; the note is carried through to the entry screen.
- **Quick add.** Tap ＋ next to the shutter to log a spend without a photo: amount, category and an optional note, with one-tap suggestions from your frequent entries and 20k/50k/100k/200k presets (VND). Every new save vibrates and shows a 5-second Undo toast.
- **Pick from library.** Tap the image button left of the shutter to attach an existing screenshot or receipt photo.
- **Locket-style paging.** Swipe up on the camera to reveal today's transactions as full-screen cards; tap any card for full details.
- **Vietnamese-first localization + VND formatting.** UI copy defaults to Vietnamese, with English available via Settings → Ngôn ngữ (Auto / Tiếng Việt / English); amounts formatted as `45.000₫`, income/expense signed with `+` / `−` (U+2212).
- **Monthly budget with progress bar.** Set a budget in Settings; Home shows spent-to-date with color thresholds (coral < 80%, orange 80–100%, red > 100%).
- **Daily reminder notifications.** Local notification via `expo-notifications` with a user-picked time, idempotently rescheduled on startup.
- **CSV export.** Share transactions with a UTF-8 BOM and Vietnamese category labels — Excel opens diacritics correctly. Range picker from Settings or History.
- **Two-tier data reset.** "Delete transactions" clears only txns + photos; "Factory reset" also clears settings and cancels the reminder.
- **Theme override.** Auto (follow system) / Light / Dark, applied instantly across every screen.
- **SQLite persistence.** All transactions and settings live in `expo-sqlite`; data survives reinstalls until the user resets.
- **Muted shutter.** No click sound when capturing.
- **Multi-currency.** Record in VND, USD, EUR, JPY, GBP or KRW; amounts are normalised to your primary currency with live or manually overridden FX rates.
- **Monthly subscriptions.** Track recurring charges with 7/3/1-day reminders, pause/resume, and automatic transactions on the due date.
- **Budget alerts.** Optional notifications when monthly spend reaches 80% and 100% of the budget.
- **Compare periods.** Month-vs-month or week-vs-week totals, overlay bar chart and per-category deltas.
- **Shareable cards.** Weekly recap and streak cards rendered as 1080×1920 images for stories, with a hide-amounts toggle and a weekly recap notification.
- **App lock.** Biometric unlock with PIN fallback.

## Screens

Routing follows a camera-first `Stack` in `src/app/`:

| Route | Purpose |
|---|---|
| `/` (`index.tsx`) | **Camera**. Launch screen. Hidden note input on the viewfinder's lower half; swipe up for today's transaction cards; shutter mutes native camera sound. |
| `/entry` | **Nhập chi tiết**. Amount, Chi/Thu toggle, category chips, note, save. Doubles as the edit screen when passed an `id`. |
| `/home` | **Tổng quan**. Ngày/Tuần/Tháng segmented, gradient balance card, monthly-budget progress bar, monthly expense bar chart, category donut. |
| `/history` | **Thu chi**. Ranged summary + day-grouped feed. Share icon in header opens CSV export. |
| `/gallery` | **Thư viện**. Three-column photo grid. |
| `/transaction/[id]` | **Chi tiết giao dịch**. Full photo header, edit + delete actions. |
| `/settings` | **Cài đặt**. Budget, reminders & budget alerts, language, app lock, theme, subscriptions, currency, data (CSV export, resets), About. |
| `/history-months` | **Tháng cũ**. Pick any past month: summary, category donut, day-grouped feed. |
| `/compare` | **So sánh**. Month or week A vs B with presets, overlay bars, category deltas. |
| `/subscriptions` | **Đăng ký hàng tháng**. List, add, edit, pause and delete recurring charges. |
| `/share` | **Chia sẻ card**. Preview a weekly recap or streak card, save to gallery or share. |

## Tech stack

- **[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)** — `expo-router`, `expo-camera`, `expo-sqlite`, `expo-notifications`, `expo-file-system`, `expo-sharing`, `expo-image`, `expo-linear-gradient`, `expo-splash-screen`, `expo-status-bar`, `expo-constants`.
- **React Native + TypeScript strict.**
- **[NativeWind v5 / Tailwind CSS v4](https://www.nativewind.dev/)** available (utility classes) alongside the custom `sl/*` primitives.
- **[Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)** via `@expo-google-fonts/plus-jakarta-sans`.
- **[react-native-svg](https://github.com/software-mansion/react-native-svg)** — icons, donut, bar chart, gradient fills.
- **[Jest](https://jestjs.io/) + [`jest-expo`](https://docs.expo.dev/develop/unit-testing/) + [@testing-library/react-native](https://callstack.github.io/react-native-testing-library/) v14.**
- **[EAS Build](https://docs.expo.dev/build/introduction/)** — `preview` profile produces `.apk`, `production` profile produces `.aab`.

## Project structure

```
src/
├── app/                          # expo-router file-based routes
│   ├── _layout.tsx               # SafeAreaProvider → SettingsProvider → TransactionsProvider → ThemedShell
│   ├── index.tsx                 # Camera + Locket-style paging FlatList
│   ├── entry.tsx                 # Add/edit a transaction
│   ├── home.tsx                  # Dashboard with budget bar, bar chart, donut
│   ├── history.tsx               # Day-grouped feed
│   ├── gallery.tsx               # Photo grid
│   ├── settings.tsx              # Settings screen
│   └── transaction/[id].tsx      # Detail + delete
│
├── components/
│   ├── sl/                       # SpendLens design primitives (Text, BudgetBar, DateRangeModal, DonutChart, BarChart, TxnCard, TodayBadge, Icons, ...)
│   └── expense/                  # Category icons, toast
│
├── lib/
│   ├── db.ts                     # expo-sqlite schema + createDb()
│   ├── transactions.ts           # Typed Txn + sync CRUD + aggregations
│   ├── transactions-context.tsx  # TransactionsProvider + useTransactions()
│   ├── settings.ts               # Typed settings CRUD over key/value table
│   ├── settings-context.tsx      # SettingsProvider + useSettings()
│   ├── notifications.ts          # Daily reminder schedule/cancel
│   ├── export.ts                 # CSV builder + share
│   ├── seed.ts                   # First-launch sample data
│   ├── categories.ts             # Vietnamese category labels
│   └── format.ts                 # formatVND, signedVND, compactK/Tr, dayLabel
│
└── constants/
    └── tokens.ts                 # Design tokens (AccentGradient, Money, SLColors, W, Radius, useColors)

assets/
├── logo/                         # SpendLens logo (SVG + 512 + 1024 PNG)
└── images/                       # Splash + template assets

docs/
├── superpowers/
│   ├── specs/                    # Design specs (dated)
│   └── plans/                    # TDD implementation plans (dated)
└── screenshots/                  # README screenshots (TODO)
```

## Getting started

**Requirements:** Node 20+, npm, and a local Android toolchain (or macOS + Xcode for iOS). The app depends on native modules (`expo-camera`, `expo-sqlite`, `expo-local-authentication`, `expo-notifications`), so it needs a custom **development build** (`expo-dev-client`) — **Expo Go cannot run it**. The web target is not supported either.

```bash
# 1. Install dependencies
npm install

# 2. Build and install the dev client (does a full native build the first time)
npm run android   # expo run:android
npm run ios       # expo run:ios (macOS only)

# 3. Start Metro for subsequent runs
npm start
```

The app starts with an empty database. For development, `seedIfEmpty()` in `src/lib/seed.ts` can be called manually to insert sample transactions; it is never run automatically.

### Reset the local database

Two options in-app under **Settings → Data**:

- **Xoá giao dịch** — clears transactions + local receipt photos only.
- **Reset về mặc định** — also clears settings (budget, reminder, theme) and cancels the scheduled reminder.

## Testing

```bash
# Unit tests (Jest + jest-expo)
npm test

# Type-check
npx tsc --noEmit
```

Tests are colocated as `*.test.ts(x)` next to the code they cover. Highlights:

- `src/lib/` — formatting, categories, transactions repository (in-memory SQLite), settings, notifications, CSV export, FX conversion, comparison, streaks, share-card data, subscriptions and their scheduler, app lock, draft-transaction hook, locale key parity.
- `src/components/` — budget bar, transaction card, share cards, picker sheets, PIN pad and lock screen.
- `src/app/` — share preview screen.

## Build (EAS)

**Prerequisites:** an Expo account. First-time on a device: `npx eas login`.

```bash
# Android APK (internal distribution — direct-install on device)
npx eas build --platform android --profile preview

# Android AAB for Play Store submission
npx eas build --platform android --profile production

# iOS (requires Apple Developer account)
npx eas build --platform ios --profile production
```

Build profiles live in [`eas.json`](./eas.json). Icons and splash configured in [`app.json`](./app.json) point at `assets/logo/spendlens-logo-1024.png`.

## Architecture highlights

- **Camera-first Stack.** `src/app/_layout.tsx` renders a bare `Stack` (no tab bar). The camera is the launch screen; every other screen is pushed onto it.
- **Sync SQLite.** All DB access uses `execSync` / `getAllSync` / `getFirstSync` / `runSync` — consistent, no context switches, no async plumbing.
- **Provider hierarchy.** `SafeAreaProvider` → `SettingsProvider` → `TransactionsProvider` → `ThemedShell`. `ThemedShell` reads `useSettings()` to resolve the effective theme (`auto | light | dark`) and passes both `getColors(effective)` and `DarkTheme/DefaultTheme` down. This lets Auto follow system while Light/Dark override.
- **Locket-style paging.** The camera screen is a vertical `FlatList` with `pagingEnabled` and `snapToInterval={SCREEN_HEIGHT}`. Page 0 is the camera; pages 1..N are today's transactions rendered as `TxnCard`. Only today shows here — a design choice that keeps the peek-experience narrow; the full history is at `/history`.
- **Hidden note input on camera.** A `Pressable` covers the lower half of the viewfinder. Tap → focus a `TextInput` above the keyboard (`KeyboardAvoidingView`). The FlatList's `scrollEnabled` toggles on `noteFocused` so the two gestures don't fight.
- **`sl/*` design primitives.** All screens compose from `Text`, `GradientButton`, `Shutter`, `Segmented`, `CategoryChip`, `TransactionRow`, `BarChart`, `Donut`, `PhotoTile`, `BudgetBar`, `TxnCard`, `TodayBadge`, `DateRangeModal`. Tokens live in `src/constants/tokens.ts`.

## Roadmap

- [ ] Google Sign-In (`users` table already scaffolded in `db.ts`)
- [ ] Cloud sync
- [ ] Standalone Stats screen with year-over-year comparison
- [ ] iOS build
- [ ] Note field UI on Entry (currently the GHI CHÚ input is shown as one visible field; a separate "camera note" preview may follow)

## Design docs

Every non-trivial change goes through spec → plan → implementation. Docs live in:

- `docs/superpowers/specs/` — approved design docs, dated.
- `docs/superpowers/plans/` — 8–16-task TDD implementation plans matching each spec.

## License

MIT © [bluez44](https://github.com/bluez44)

<!-- TODO: add a LICENSE file at repo root if you want the badge to render on GitHub. -->
