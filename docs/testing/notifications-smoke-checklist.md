# Notifications Smoke Checklist

Manual verification, on a physical Android or iOS device running the dev build.

## Setup

- Build with `npx expo run:android` (or `run:ios`) after ensuring the dev client is installed.
- Grant notification permission when first prompted.

## Tests

### Test 1 — Daily reminder in foreground
1. Open Settings → NHẮC NHỞ → enable "Nhắc chụp bill cuối ngày"
2. Pick a time 1 minute ahead of the current clock
3. Lock the phone; wait
4. **Expected:** banner appears with title "SpendLens" and body "Ghi lại chi tiêu hôm nay?" (VI) or English equivalents if EN is active

Result: ☐ pass ☐ fail — notes: ___________

### Test 2 — Daily reminder survives kill
1. Repeat Test 1 setup
2. Kill the app process from recent apps
3. Wait for the scheduled time
4. **Expected:** banner appears

Result: ☐ pass ☐ fail — notes: ___________

### Test 3 — Reminder off cancels
1. Enable + pick a time 1 minute ahead
2. Immediately disable the reminder toggle
3. Wait past the scheduled time
4. **Expected:** no notification

Result: ☐ pass ☐ fail — notes: ___________

### Test 4 — Budget alert 80%
1. Settings → Ngân sách tháng → set to 100000
2. Ensure "Cảnh báo vượt ngân sách" is on
3. Create a transaction with amount 80000 (expense)
4. **Expected:** banner "Sắp vượt ngân sách" / "Bạn đã chi hơn 80% ngân sách tháng này."

Result: ☐ pass ☐ fail — notes: ___________

### Test 5 — Budget alert 100%
1. Continuing from Test 4, add another 20000 expense (total 100000)
2. **Expected:** banner "Vượt ngân sách!" / "Bạn đã chi vượt 100% ngân sách tháng này."

Result: ☐ pass ☐ fail — notes: ___________

### Test 6 — Dedup within month
1. Continuing from Test 5, add another 10000 expense
2. **Expected:** no banner (already alerted at 100 this month)

Result: ☐ pass ☐ fail — notes: ___________

### Test 7 — Cross-month reset
1. Change device date to the 1st of next month
2. Add a 90000 expense
3. **Expected:** banner "Sắp vượt ngân sách" (80% reached in a new month, alert flag reset)

Result: ☐ pass ☐ fail — notes: ___________

### Test 8 — Alerts disabled
1. Reset device date. Toggle "Cảnh báo vượt ngân sách" off
2. Add another over-budget expense
3. **Expected:** no banner

Result: ☐ pass ☐ fail — notes: ___________

### Test 9 — Permission denied path
1. Fresh install (or revoke notification permission in system settings)
2. Open Settings → toggle reminder on
3. **Expected:** alert "Cần quyền thông báo" — toggle stays off, no crash

Result: ☐ pass ☐ fail — notes: ___________

## Sign-off

Tester: ______________  Date: ______________
