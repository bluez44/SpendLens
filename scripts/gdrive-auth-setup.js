require('dotenv').config();
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
