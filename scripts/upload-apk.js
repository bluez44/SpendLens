require('dotenv').config({ quiet: true });
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
