require('dotenv').config({ quiet: true });
const fs = require('fs');
const http = require('http');
const { URL } = require('url');
const open = require('open');
const {
  createOAuth2Client,
  TOKEN_PATH,
  SCOPES,
} = require('./lib/gdrive-client');

async function main() {
  if (!process.env.GDRIVE_PARENT_FOLDER_ID || process.env.GDRIVE_PARENT_FOLDER_ID.trim().length === 0) {
    throw new Error(
      'Missing GDRIVE_PARENT_FOLDER_ID in .env. Copy .env.example to .env and fill in values.'
    );
  }

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
    let handled = false;

    server.on('request', (req, res) => {
      try {
        const url = new URL(req.url, redirectUri);
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error');

        // If already handled (first request won), ignore subsequent requests
        if (handled) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Already processed. You can close this tab.</h1>');
          return;
        }

        if (err) {
          handled = true;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Auth failed: ${err}</h1>`);
          reject(new Error(`OAuth error: ${err}`));
          return;
        }

        if (!code) {
          handled = true;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Missing code parameter</h1>');
          reject(new Error("Missing 'code' parameter in redirect. This can happen if you visited the URL directly instead of following Google's redirect."));
          return;
        }

        handled = true;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Success! You can close this tab and return to the terminal.</h1>');
        resolve(code);
      } catch (e) {
        if (!handled) {
          handled = true;
          reject(e);
        }
      }
    });
  });

  await open(authUrl);

  let code;
  try {
    code = await codePromise;
  } finally {
    server.close();
  }

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
