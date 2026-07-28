# GDrive APK Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau khi build `./gradlew assembleRelease` hoặc `assembleDebug` (qua `npm run build:release`/`build:debug`), tự động upload APK lên folder Drive `SpendLens/release` hoặc `SpendLens/debug` với tên `SpendLens-v<version>-<variant>-<YYYY-MM-DD-HHmm>.apk`.

**Architecture:** OAuth2 loopback flow (localhost redirect) lấy refresh_token 1 lần, lưu `.gdrive-token.json`. Script upload load token + config `.env`, tìm/tạo subfolder trong parent SpendLens folder, upload APK. Wrap trong npm script chain `gradle && upload`.

**Tech Stack:** Node.js (>= v18), `googleapis` (Google Drive v3 client), `dotenv`, `open` (browser launch). Windows-only (npm scripts dùng `cmd.exe`).

## Global Constraints

- Target platform: Windows only (npm scripts dùng `cmd.exe`, không cần cross-platform Mac/Linux)
- APK path convention: `android/app/build/outputs/apk/<variant>/app-<variant>.apk`
- Filename format: `SpendLens-v<version>-<variant>-<YYYY-MM-DD-HHmm>.apk` (timestamp local time UTC+7)
- OAuth scope: `https://www.googleapis.com/auth/drive` (full Drive access)
- Version source: `expo.version` trong `app.json` (fallback `"unknown"` nếu thiếu)
- Variants hợp lệ: chỉ `release` và `debug` — reject mọi giá trị khác
- File nhạy cảm KHÔNG được commit: `.env`, `.gdrive-token.json`
- Test files colocated (`foo.test.js` cạnh `foo.js`), theo pattern hiện có của repo
- Non-zero exit code mọi lỗi để user thấy failure trong terminal

## File Structure

**New files:**
- `scripts/lib/build-filename.js` — pure function build tên APK (testable đơn giản)
- `scripts/lib/build-filename.test.js` — unit test cho filename builder
- `scripts/lib/gdrive-client.js` — module wrapper googleapis: init OAuth2, findOrCreateSubfolder, uploadFile
- `scripts/gdrive-auth-setup.js` — 1-time OAuth setup, mở browser, lưu refresh token
- `scripts/upload-apk.js` — orchestrator: load config → validate APK exists → upload
- `.env.example` — template config, an toàn commit

**Modified files:**
- `package.json` — thêm devdependencies + 2 npm scripts (`build:release`, `build:debug`)
- `.gitignore` — thêm `.env` và `.gdrive-token.json`

---

### Task 1: Dependencies + gitignore + config template

Thiết lập môi trường: cài deps, chặn commit file nhạy cảm, tạo template `.env.example` để user điền.

**Files:**
- Modify: `D:/SpendLens/package.json` (devDependencies)
- Modify: `D:/SpendLens/.gitignore`
- Create: `D:/SpendLens/.env.example`

**Interfaces:**
- Consumes: (none — first task)
- Produces:
  - Environment variables (loaded via `dotenv.config()` in later tasks): `GOOGLE_CLIENT_ID: string`, `GOOGLE_CLIENT_SECRET: string`, `GDRIVE_PARENT_FOLDER_ID: string`
  - Devdependencies available: `googleapis` (^144.0.0 hoặc mới nhất tương thích Node 18), `dotenv` (^16.4.5), `open` (^10.1.0)

- [ ] **Step 1: Install runtime dependencies as devDependencies**

Run trong root `D:/SpendLens`:
```
npm install --save-dev googleapis dotenv open
```

Expected: `package.json` `devDependencies` có thêm 3 entries, `package-lock.json` cập nhật.

Lưu ý: dùng `--save-dev` vì đây là dev tooling (chỉ chạy trên máy dev, không đóng gói vào app).

- [ ] **Step 2: Add ignore rules for secrets**

Append vào cuối file `D:/SpendLens/.gitignore`:

```
# Google Drive upload script (secrets)
.env
.gdrive-token.json
```

- [ ] **Step 3: Create .env.example**

Tạo file mới `D:/SpendLens/.env.example` với nội dung:

```
# Google OAuth2 credentials — tạo trên https://console.cloud.google.com/apis/credentials
# 1. Tạo project (hoặc dùng project có sẵn)
# 2. Enable "Google Drive API"
# 3. Configure OAuth consent screen (External, chỉ cần thêm email của bạn vào Test users)
# 4. Create Credentials > OAuth Client ID > Application type: Desktop app
# 5. Copy Client ID và Client Secret vào đây
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ID folder "SpendLens" trên Google Drive
# Lấy bằng cách: mở folder trên web → copy phần cuối URL (drive.google.com/drive/folders/<ID>)
GDRIVE_PARENT_FOLDER_ID=
```

- [ ] **Step 4: Verify install worked**

Run:
```
node -e "require('googleapis'); require('dotenv'); require('open'); console.log('OK')"
```

Expected output: `OK`

- [ ] **Step 5: Commit**

```
git add package.json package-lock.json .gitignore .env.example
git commit -m "chore(deps): add googleapis/dotenv/open for APK upload script"
```

---

### Task 2: Filename builder pure function (TDD)

Trước khi động vào Google API, build và test pure function tạo filename. Đây là logic duy nhất có branch (version thiếu → "unknown", pad số) đáng test.

**Files:**
- Create: `D:/SpendLens/scripts/lib/build-filename.js`
- Create: `D:/SpendLens/scripts/lib/build-filename.test.js`

**Interfaces:**
- Consumes: (none — pure function)
- Produces:
  - `buildApkFilename({ version: string | null | undefined, variant: 'release' | 'debug', date: Date }) => string`
  - Return format: `SpendLens-v<version>-<variant>-<YYYY-MM-DD-HHmm>.apk` (giờ local của Date object)
  - Nếu version null/undefined/empty → dùng `"unknown"`

- [ ] **Step 1: Write failing tests**

Create `D:/SpendLens/scripts/lib/build-filename.test.js`:

```js
const { buildApkFilename } = require('./build-filename');

describe('buildApkFilename', () => {
  const fixedDate = new Date(2026, 6, 28, 14, 30); // 2026-07-28 14:30 local

  test('builds release filename with semver version', () => {
    expect(buildApkFilename({ version: '1.2.3', variant: 'release', date: fixedDate }))
      .toBe('SpendLens-v1.2.3-release-2026-07-28-1430.apk');
  });

  test('builds debug filename', () => {
    expect(buildApkFilename({ version: '1.0.0', variant: 'debug', date: fixedDate }))
      .toBe('SpendLens-v1.0.0-debug-2026-07-28-1430.apk');
  });

  test('pads single-digit month/day/hour/minute', () => {
    const d = new Date(2026, 0, 5, 9, 7); // Jan 5, 09:07
    expect(buildApkFilename({ version: '1.0.0', variant: 'release', date: d }))
      .toBe('SpendLens-v1.0.0-release-2026-01-05-0907.apk');
  });

  test('falls back to "unknown" when version missing', () => {
    expect(buildApkFilename({ version: null, variant: 'release', date: fixedDate }))
      .toBe('SpendLens-vunknown-release-2026-07-28-1430.apk');
    expect(buildApkFilename({ version: undefined, variant: 'release', date: fixedDate }))
      .toBe('SpendLens-vunknown-release-2026-07-28-1430.apk');
    expect(buildApkFilename({ version: '', variant: 'release', date: fixedDate }))
      .toBe('SpendLens-vunknown-release-2026-07-28-1430.apk');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest scripts/lib/build-filename.test.js`
Expected: FAIL với "Cannot find module './build-filename'"

- [ ] **Step 3: Implement**

Create `D:/SpendLens/scripts/lib/build-filename.js`:

```js
function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildApkFilename({ version, variant, date }) {
  const v = version && String(version).length > 0 ? version : 'unknown';
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `SpendLens-v${v}-${variant}-${y}-${mo}-${d}-${h}${mi}.apk`;
}

module.exports = { buildApkFilename };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest scripts/lib/build-filename.test.js`
Expected: 4 tests passed.

- [ ] **Step 5: Verify jest picks up the new test file via `npm test`**

Run: `npm test -- --testPathPattern=build-filename`
Expected: 4 tests passed. (Kiểm tra jest config transformIgnorePatterns không loại trừ folder scripts/.)

Nếu FAIL vì `scripts/` bị ignore: skip step này, chỉ dùng `npx jest scripts/lib/build-filename.test.js` cho các lần chạy sau. Không cần sửa jest config vì script này không dùng transform (pure CommonJS Node).

- [ ] **Step 6: Commit**

```
git add scripts/lib/build-filename.js scripts/lib/build-filename.test.js
git commit -m "feat(scripts): add buildApkFilename util with tests"
```

---

### Task 3: Google Drive client wrapper module

Wrap `googleapis` với 3 hàm: init OAuth2 (nạp credentials + refresh token), findOrCreateSubfolder, uploadFile. Không có unit test tự động (mock Google API nặng, giá trị thấp) — test manual ở Task 5.

**Files:**
- Create: `D:/SpendLens/scripts/lib/gdrive-client.js`

**Interfaces:**
- Consumes:
  - `dotenv` để đọc `.env` (được caller gọi `require('dotenv').config()` trước)
  - Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - Optional token file: `.gdrive-token.json` (chỉ dành cho `createOAuth2Client({ withToken: true })`)
- Produces:
  - `createOAuth2Client({ withToken: boolean }) => OAuth2Client` — throws Error nếu thiếu env vars, hoặc thiếu token file khi `withToken: true`
  - `findOrCreateSubfolder({ drive, parentId, name }) => Promise<string>` — trả về folder ID (tìm hoặc tạo mới)
  - `uploadApk({ drive, folderId, filePath, filename }) => Promise<{ id: string, webViewLink: string, size: string }>`
  - Constant: `TOKEN_PATH = <absolute path tới .gdrive-token.json ở root repo>`
  - Constant: `SCOPES = ['https://www.googleapis.com/auth/drive']`

- [ ] **Step 1: Create the module**

Create `D:/SpendLens/scripts/lib/gdrive-client.js`:

```js
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TOKEN_PATH = path.join(REPO_ROOT, '.gdrive-token.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

function requireEnv(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(
      `Missing ${name} in .env. Copy .env.example to .env and fill in values.`
    );
  }
  return v;
}

function createOAuth2Client({ withToken }) {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
  // redirect_uri set by caller (auth-setup uses loopback, upload-apk doesn't need it)
  const client = new google.auth.OAuth2(clientId, clientSecret);
  if (withToken) {
    if (!fs.existsSync(TOKEN_PATH)) {
      throw new Error(
        `Missing ${TOKEN_PATH}. Run: node scripts/gdrive-auth-setup.js`
      );
    }
    const { refresh_token } = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    if (!refresh_token) {
      throw new Error(
        `Invalid token file ${TOKEN_PATH}. Re-run: node scripts/gdrive-auth-setup.js`
      );
    }
    client.setCredentials({ refresh_token });
  }
  return client;
}

async function findOrCreateSubfolder({ drive, parentId, name }) {
  // Escape single quotes in name for the query
  const safeName = name.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const listRes = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  if (listRes.data.files && listRes.data.files.length > 0) {
    return listRes.data.files[0].id;
  }
  const createRes = await drive.files.create({
    resource: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return createRes.data.id;
}

async function uploadApk({ drive, folderId, filePath, filename }) {
  const res = await drive.files.create({
    resource: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/vnd.android.package-archive',
      body: fs.createReadStream(filePath),
    },
    fields: 'id,webViewLink,size',
  });
  return res.data;
}

module.exports = {
  TOKEN_PATH,
  SCOPES,
  createOAuth2Client,
  findOrCreateSubfolder,
  uploadApk,
};
```

- [ ] **Step 2: Sanity check the module loads without errors**

Run:
```
node -e "const m = require('./scripts/lib/gdrive-client'); console.log(Object.keys(m).sort().join(','));"
```

Expected output (exact string): `SCOPES,TOKEN_PATH,createOAuth2Client,findOrCreateSubfolder,uploadApk`

- [ ] **Step 3: Commit**

```
git add scripts/lib/gdrive-client.js
git commit -m "feat(scripts): add Google Drive client wrapper (auth + folder + upload)"
```

---

### Task 4: OAuth2 setup script (loopback flow)

Script chạy 1 lần để user login Google, exchange auth code lấy refresh_token, lưu `.gdrive-token.json`.

**Files:**
- Create: `D:/SpendLens/scripts/gdrive-auth-setup.js`

**Interfaces:**
- Consumes:
  - `scripts/lib/gdrive-client.js` — `createOAuth2Client`, `TOKEN_PATH`, `SCOPES`
  - Env vars từ `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Produces:
  - File output: `.gdrive-token.json` chứa `{ refresh_token: string }` ở repo root
  - Exit code 0 khi thành công, 1 khi lỗi

- [ ] **Step 1: Implement the script**

Create `D:/SpendLens/scripts/gdrive-auth-setup.js`:

```js
require('dotenv').config();
const fs = require('fs');
const http = require('http');
const { URL } = require('url');
const open = require('open').default ?? require('open');
const {
  createOAuth2Client,
  TOKEN_PATH,
  SCOPES,
} = require('./lib/gdrive-client');

async function main() {
  const oauth2Client = createOAuth2Client({ withToken: false });

  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}`;
  oauth2Client.redirectUri = redirectUri;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    redirect_uri: redirectUri,
  });

  console.log('Opening browser for Google authentication...');
  console.log(`If browser does not open, visit: ${authUrl}`);

  const codePromise = new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      try {
        const url = new URL(req.url, redirectUri);
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error');
        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Auth failed: ${err}</h1>`);
          reject(new Error(`OAuth error: ${err}`));
          return;
        }
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Missing code parameter</h1>');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Success! You can close this tab and return to the terminal.</h1>');
        resolve(code);
      } catch (e) {
        reject(e);
      }
    });
  });

  await open(authUrl);
  const code = await codePromise;
  server.close();

  const { tokens } = await oauth2Client.getToken({
    code,
    redirect_uri: redirectUri,
  });
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh_token. Try revoking access at https://myaccount.google.com/permissions and re-run this script.'
    );
  }
  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2)
  );
  console.log(`Auth complete. Token saved to ${TOKEN_PATH}`);
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the script loads (syntax check)**

Run:
```
node --check scripts/gdrive-auth-setup.js
```

Expected: no output (means syntax valid).

- [ ] **Step 3: Verify error path when .env missing values**

Ensure there is NO `.env` file at repo root (or backup any existing `.env`). Run:
```
node scripts/gdrive-auth-setup.js
```

Expected: exit code 1, stderr contains `Missing GOOGLE_CLIENT_ID`. Restore any backed-up `.env` after.

- [ ] **Step 4: Commit**

```
git add scripts/gdrive-auth-setup.js
git commit -m "feat(scripts): add one-time Google OAuth setup for Drive uploads"
```

---

### Task 5: APK upload orchestrator + npm scripts + end-to-end manual test

Script chính chạy sau gradle, và wiring npm scripts. Kết thúc bằng test manual end-to-end.

**Files:**
- Create: `D:/SpendLens/scripts/upload-apk.js`
- Modify: `D:/SpendLens/package.json` (thêm 2 scripts)

**Interfaces:**
- Consumes:
  - `scripts/lib/build-filename.js` — `buildApkFilename`
  - `scripts/lib/gdrive-client.js` — `createOAuth2Client`, `findOrCreateSubfolder`, `uploadApk`
  - Env var: `GDRIVE_PARENT_FOLDER_ID` (đọc trong upload-apk.js, không trong gdrive-client)
  - CLI arg: `process.argv[2]` — phải là `'release'` hoặc `'debug'`
  - File: `app.json` ở repo root (đọc `expo.version`)
  - File: `android/app/build/outputs/apk/<variant>/app-<variant>.apk`
- Produces:
  - Stdout: filename, size (MB), Drive webViewLink khi thành công
  - Exit code 0 thành công, 1 mọi lỗi

- [ ] **Step 1: Implement upload-apk.js**

Create `D:/SpendLens/scripts/upload-apk.js`:

```js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const {
  createOAuth2Client,
  findOrCreateSubfolder,
  uploadApk,
} = require('./lib/gdrive-client');
const { buildApkFilename } = require('./lib/build-filename');

const REPO_ROOT = path.resolve(__dirname, '..');
const VALID_VARIANTS = new Set(['release', 'debug']);

function readAppVersion() {
  try {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'app.json'), 'utf8')
    );
    return appJson?.expo?.version || null;
  } catch (_) {
    return null;
  }
}

async function main() {
  const variant = process.argv[2];
  if (!VALID_VARIANTS.has(variant)) {
    console.error('Usage: node scripts/upload-apk.js <release|debug>');
    process.exit(1);
  }

  const parentFolderId = process.env.GDRIVE_PARENT_FOLDER_ID;
  if (!parentFolderId || parentFolderId.trim().length === 0) {
    console.error(
      'Missing GDRIVE_PARENT_FOLDER_ID in .env. Copy .env.example to .env and fill in values.'
    );
    process.exit(1);
  }

  const apkPath = path.join(
    REPO_ROOT,
    'android', 'app', 'build', 'outputs', 'apk', variant, `app-${variant}.apk`
  );
  if (!fs.existsSync(apkPath)) {
    console.error(`APK not found at ${apkPath}`);
    console.error('Did Gradle build succeed? Run the gradle build first.');
    process.exit(1);
  }

  const version = readAppVersion();
  const filename = buildApkFilename({ version, variant, date: new Date() });

  const auth = createOAuth2Client({ withToken: true });
  const drive = google.drive({ version: 'v3', auth });

  console.log(`Ensuring subfolder "${variant}" exists in parent folder...`);
  const subfolderId = await findOrCreateSubfolder({
    drive,
    parentId: parentFolderId,
    name: variant,
  });

  console.log(`Uploading ${filename}...`);
  const result = await uploadApk({
    drive,
    folderId: subfolderId,
    filePath: apkPath,
    filename,
  });

  const sizeMb = (Number(result.size) / (1024 * 1024)).toFixed(2);
  console.log(`\nUploaded: ${filename}`);
  console.log(`Size:     ${sizeMb} MB`);
  console.log(`Link:     ${result.webViewLink}`);
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

Edit `D:/SpendLens/package.json` — trong block `"scripts"`, thêm 2 dòng ngay sau `"test": "jest"`:

Trước:
```json
  "scripts": {
    "start": "expo start",
    "reset-project": "node ./scripts/reset-project.js",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "lint": "expo lint",
    "test": "jest"
  },
```

Sau:
```json
  "scripts": {
    "start": "expo start",
    "reset-project": "node ./scripts/reset-project.js",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "lint": "expo lint",
    "test": "jest",
    "build:release": "cd android && gradlew assembleRelease && cd .. && node scripts/upload-apk.js release",
    "build:debug": "cd android && gradlew assembleDebug && cd .. && node scripts/upload-apk.js debug"
  },
```

- [ ] **Step 3: Verify syntax + error path when variant invalid**

Run:
```
node --check scripts/upload-apk.js
node scripts/upload-apk.js
```

Expected first command: no output. Expected second: exit code 1, stderr `Usage: node scripts/upload-apk.js <release|debug>`.

Then:
```
node scripts/upload-apk.js staging
```
Expected: same usage error, exit 1.

- [ ] **Step 4: Verify error path when APK missing**

If a release APK currently exists at `android/app/build/outputs/apk/release/app-release.apk`, temporarily rename it. Then run:
```
node scripts/upload-apk.js release
```
Expected: exit 1, stderr contains `APK not found at`. Restore the APK after.

Skip this step if you'd rather not risk touching build outputs — the error path is straightforward.

- [ ] **Step 5: END-TO-END MANUAL TEST (requires user action)**

This step requires the user to have completed Google Cloud setup. Ask the user to:

1. Create OAuth Client ID (Desktop app) at https://console.cloud.google.com/apis/credentials — Google Drive API enabled on that project.
2. Create folder "SpendLens" on Google Drive, copy the folder ID from URL.
3. Copy `.env.example` to `.env` and fill in the 3 values.
4. Run: `node scripts/gdrive-auth-setup.js` — browser should open, log in, redirect back. Terminal shows `Auth complete`. Verify `.gdrive-token.json` created at repo root.
5. Ensure a debug APK exists (run `./gradlew assembleDebug` if needed).
6. Run: `node scripts/upload-apk.js debug`
7. Verify in terminal: filename, size, webViewLink printed.
8. Open the link → verify APK visible in `SpendLens/debug/` folder on Drive with correct filename.
9. Run: `npm run build:debug` — verify it runs gradle then uploads (may take longer because full build).

Nếu bất kỳ bước nào fail: đọc error message, fix, và loop lại. Đừng đánh dấu step này done cho tới khi upload thành công end-to-end.

- [ ] **Step 6: Commit**

```
git add package.json scripts/upload-apk.js
git commit -m "feat(scripts): add upload-apk orchestrator + build:release/debug npm scripts"
```

---

## Self-Review Notes

**Spec coverage:**
- OAuth loopback flow → Task 4 ✓
- Filename format với version+timestamp → Task 2 (test) + Task 5 (wire) ✓
- Auto-tạo subfolder release/debug → Task 3 (`findOrCreateSubfolder`) + Task 5 (call site) ✓
- `.env` config + `.env.example` template → Task 1 ✓
- `.gitignore` cho secrets → Task 1 ✓
- Windows npm scripts `cd android && gradlew && cd .. && node ...` → Task 5 ✓
- Full `drive` scope → Task 3 (`SCOPES`) ✓
- Error handling table (missing env, missing token, missing APK, invalid variant) → Task 3 (`requireEnv`, `createOAuth2Client withToken`) + Task 5 (variant check, APK exists check) ✓
- Progress-less upload log (in filename + size + link) → Task 5 ✓
- Unit test cho filename builder → Task 2 ✓
- Manual test end-to-end → Task 5 Step 5 ✓

**Type/name consistency:**
- `buildApkFilename` signature (Task 2 produces, Task 5 consumes) ✓
- `createOAuth2Client({ withToken })` (Task 3 produces, Tasks 4 & 5 consume) ✓
- `findOrCreateSubfolder({ drive, parentId, name })` (Task 3 produces, Task 5 consumes) ✓
- `uploadApk({ drive, folderId, filePath, filename })` (Task 3 produces, Task 5 consumes) ✓
- `TOKEN_PATH`, `SCOPES` exports (Task 3 produces, Task 4 consumes) ✓

**No placeholders:** All code steps show actual code. All test steps show expected output. No "add error handling" hand-waving.
