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
    let tokenData;
    try {
      tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    } catch (e) {
      throw new Error(
        `Invalid token file ${TOKEN_PATH}. Re-run: node scripts/gdrive-auth-setup.js`
      );
    }
    const { refresh_token } = tokenData;
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
