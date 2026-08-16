/**
 * One-time login for a personal Gmail bot account.
 * Creates a refresh token so Netlify can upload proof photos as that user.
 *
 * Run: npm run google:auth
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { google } from 'googleapis';

const PORT = 3333;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const ENV_PATH = path.join(process.cwd(), '.env');

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function upsertEnv(updates: Record<string, string>) {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  const keys = new Set(Object.keys(updates));

  const next = lines
    .filter((line) => {
      const eq = line.indexOf('=');
      if (eq === -1) {
        return true;
      }
      return !keys.has(line.slice(0, eq).trim());
    })
    .filter((line, index, arr) => !(line === '' && index === arr.length - 1));

  for (const [key, value] of Object.entries(updates)) {
    next.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_PATH, `${next.join('\n').trimEnd()}\n`, 'utf8');
}

async function main() {
  loadEnvFile();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first (OAuth Desktop client, not a Gmail password).'
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  const tokens = await new Promise<{ refresh_token?: string }>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code');
          reject(new Error('Google did not return an auth code'));
          server.close();
          return;
        }

        const tokenResponse = await oauth2.getToken(code);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Google Drive connected. You can close this tab.');
        server.close();
        resolve(tokenResponse.tokens);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Auth failed. Check the terminal.');
        server.close();
        reject(error);
      }
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log('Sign in as the bot Gmail, then click Allow:');
      console.log(authUrl);
      console.log('');
    });
  });

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token returned. Delete the app access at https://myaccount.google.com/permissions and run this again.'
    );
  }

  upsertEnv({ GOOGLE_REFRESH_TOKEN: tokens.refresh_token });
  console.log('Saved GOOGLE_REFRESH_TOKEN to .env');
  console.log('Copy GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GOOGLE_DRIVE_FOLDER_ID into Netlify.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
