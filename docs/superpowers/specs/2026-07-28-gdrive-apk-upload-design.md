# Auto-upload APK to Google Drive after Gradle build

**Date:** 2026-07-28
**Status:** Approved — ready for implementation planning

## Goal

Sau khi build APK bằng `./gradlew assembleRelease` hoặc `./gradlew assembleDebug`, tự động upload file APK lên Google Drive (folder `SpendLens/release` hoặc `SpendLens/debug` tương ứng), đặt tên có version + timestamp để giữ lịch sử build.

Target: Windows (dev machine chính của user). Không cần cross-platform.

## User-facing behavior

Thay vì gõ `./gradlew assembleRelease` trực tiếp, user chạy:

```
npm run build:release   # build release + upload
npm run build:debug     # build debug + upload
```

Nếu Gradle build fail → không upload. Nếu build OK → in tiến trình upload và link Drive khi xong.

Nếu user chạy `./gradlew assembleRelease` trực tiếp (không qua npm) → không upload. Đây là ý muốn — user có full control khi nào upload.

## Architecture

Ba file mới trong `scripts/`:

1. **`scripts/gdrive-auth-setup.js`** — chạy 1 lần lúc setup. Mở browser để user đăng nhập Google, nhận authorization code, đổi lấy refresh token, lưu vào `.gdrive-token.json`.

2. **`scripts/upload-apk.js`** — chạy mỗi lần sau build. Nhận argv `release` hoặc `debug`, load token, upload APK.

3. **`scripts/lib/gdrive-client.js`** — module dùng chung: khởi tạo OAuth2 client từ `.env` + `.gdrive-token.json`, wrap `google.drive` API calls (findOrCreateFolder, uploadFile).

Tách `lib/gdrive-client.js` ra vì cả `gdrive-auth-setup.js` và `upload-apk.js` đều cần khởi tạo OAuth2 client với cùng logic (cùng client_id/secret, cùng scope).

## Configuration

**File `.env`** (thêm vào `.gitignore`):
```
GOOGLE_CLIENT_ID=<từ Google Cloud Console>
GOOGLE_CLIENT_SECRET=<từ Google Cloud Console>
GDRIVE_PARENT_FOLDER_ID=<ID folder "SpendLens" trên Drive>
```

**File `.gdrive-token.json`** (thêm vào `.gitignore`) — sinh ra bởi `gdrive-auth-setup.js`, chứa refresh token duy nhất:
```json
{ "refresh_token": "1//0g..." }
```

**OAuth scope:** `https://www.googleapis.com/auth/drive` (full Drive access).

Lý do không dùng scope hẹp `drive.file`: `drive.file` chỉ cho phép app thấy file/folder mà chính nó tạo, nghĩa là folder "SpendLens" user tạo thủ công trên web UI sẽ không truy cập được qua API. Vì user đã yêu cầu tự tạo folder "SpendLens" và cung cấp ID, phải dùng scope rộng. Chấp nhận rủi ro vì đây là script cá nhân, credentials không share.

## Auth setup flow (`gdrive-auth-setup.js`)

Dùng **OAuth2 loopback flow** (localhost redirect) thay vì `urn:ietf:wg:oauth:2.0:oob` vì Google đã deprecate OOB flow.

Steps:
1. Đọc `.env`, verify có `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Nếu thiếu → in hướng dẫn setup Google Cloud Console (link + steps), exit 1.
2. Khởi tạo local HTTP server trên port ngẫu nhiên (dùng port 0 để OS tự chọn).
3. Build authorization URL với `redirect_uri=http://127.0.0.1:<port>`, `access_type=offline`, `prompt=consent` (đảm bảo trả về refresh_token).
4. Mở browser tới URL đó (dùng module `open` hoặc `child_process.exec('start <url>')` trên Windows).
5. User đăng nhập → Google redirect về `http://127.0.0.1:<port>/?code=...` → server nhận code.
6. Exchange code lấy tokens, ghi `{ refresh_token }` vào `.gdrive-token.json`.
7. Trả HTML "Success, you can close this tab" cho browser, shutdown server.
8. In "Auth complete" ra terminal.

Nếu user chạy lại script này → ghi đè token cũ (fine — cần refresh khi expired hoặc muốn đổi account).

## Upload flow (`upload-apk.js`)

Steps:
1. Parse argv[2] — phải là `release` hoặc `debug`, nếu không → error + usage, exit 1.
2. Load `.env` + `.gdrive-token.json`. Nếu thiếu token → in "Run `node scripts/gdrive-auth-setup.js` first", exit 1.
3. Tính đường dẫn APK: `android/app/build/outputs/apk/<variant>/app-<variant>.apk`. Nếu file không tồn tại → error rõ ràng, exit 1.
4. Đọc version từ `app.json` — path `expo.version`. Nếu không có → dùng `"unknown"`.
5. Build filename: `SpendLens-v<version>-<variant>-<YYYY-MM-DD-HHmm>.apk`. Timestamp dùng giờ local (UTC+7 trên máy user).
6. Khởi tạo OAuth2 client, set refresh_token → googleapis sẽ tự refresh access_token khi cần.
7. Query Drive: tìm subfolder tên `<variant>` (release/debug) có parent là `GDRIVE_PARENT_FOLDER_ID`.
   - Nếu chưa tồn tại → tạo mới (mimeType = `application/vnd.google-apps.folder`, parent = GDRIVE_PARENT_FOLDER_ID).
8. Upload APK với `files.create`:
   - `resource.name` = filename ở step 5
   - `resource.parents` = [subfolder ID]
   - `media.mimeType` = `application/vnd.android.package-archive`
   - `media.body` = `fs.createReadStream(apkPath)`
   - `fields` = `id,webViewLink,size`
9. In:
   ```
   Uploaded: <filename>
   Size: <MB>
   Link: <webViewLink>
   ```

Không có progress bar — googleapis stream upload không expose progress dễ dàng, và APK ~50MB upload chỉ vài giây. Nếu sau này chậm mới thêm.

## package.json changes

Thêm 2 scripts:
```json
"build:release": "cd android && gradlew assembleRelease && cd .. && node scripts/upload-apk.js release",
"build:debug":   "cd android && gradlew assembleDebug && cd .. && node scripts/upload-apk.js debug"
```

Windows npm chạy scripts qua `cmd.exe`; `gradlew` không có `./` sẽ pick `gradlew.bat`. `&&` chuỗi lệnh — nếu gradle exit code khác 0, upload sẽ không chạy.

**Devdependencies mới:**
- `googleapis` — Google Drive API client chính thức
- `dotenv` — load `.env`
- `open` — mở browser cross-platform (dùng cho auth setup)

## .gitignore additions

```
.env
.gdrive-token.json
```

Verify: check `.gitignore` hiện tại — nếu `.env` đã có sẵn thì skip.

## Error handling

Tất cả lỗi đều exit code khác 0 để user thấy được failure trong terminal:

| Tình huống | Message | Exit |
|---|---|---|
| Thiếu `.env` hoặc thiếu key | "Missing X in .env. See setup instructions." | 1 |
| Thiếu `.gdrive-token.json` | "Run: node scripts/gdrive-auth-setup.js" | 1 |
| APK không tồn tại | "APK not found at <path>. Did Gradle build succeed?" | 1 |
| Argv variant không hợp lệ | "Usage: node upload-apk.js <release\|debug>" | 1 |
| Drive API error (network, auth) | In error.message của googleapis | 1 |
| Refresh token expired/revoked | "Token invalid, re-run auth setup" | 1 |

Không retry tự động — user thấy lỗi thì tự chạy lại.

## Testing

**Unit test** cho `scripts/lib/gdrive-client.js`:
- `buildApkFilename(version, variant, date)` — pure function, test các case: version có/không dấu chấm, variant khác nhau, format ngày.

**Không unit test** cho Google API calls — mock nặng, giá trị thấp. Test manual:
1. Chạy `gdrive-auth-setup.js` lần đầu → verify browser mở, verify `.gdrive-token.json` tạo ra.
2. Chạy `npm run build:debug` → verify APK xuất hiện trong `SpendLens/debug/` trên Drive với đúng tên.
3. Xóa APK build, chạy `node scripts/upload-apk.js release` → verify error message rõ ràng.
4. Corrupt `.env`, chạy → verify error message.

Test manual đủ vì đây là script utility 1 chiều, không có business logic phức tạp.

## Out of scope (YAGNI)

- Không upload mapping file / debug symbols
- Không xóa APK cũ trên Drive
- Không notify (Slack, email) sau upload
- Không cross-platform Mac/Linux (nếu cần sau, đổi npm scripts)
- Không upload nhiều variant song song
- Không giới hạn số file trong folder (user tự quản lý)

## Open questions

Không còn — 3 điểm quyết định (Windows-only, auto-tạo subfolder, timestamp local) đã được user xác nhận.
