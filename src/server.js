import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import express from 'express';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback',
  SESSION_SECRET,
  PORT = 3000,
  DASHBOARD_REDIRECT = '/dashboard',
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables.');
}

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set for secure cookies.');
}

function createOAuthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
  );
}

async function ensureAuthorizedClient(session) {
  if (!session.tokens) {
    return null;
  }

  const client = createOAuthClient();
  client.on('tokens', (tokens) => {
    session.tokens = {
      ...session.tokens,
      ...tokens,
    };
  });
  client.setCredentials(session.tokens);

  const shouldRefresh =
    !session.tokens.expiry_date || session.tokens.expiry_date - Date.now() < 60_000;

  if (shouldRefresh && session.tokens.refresh_token) {
    try {
      const { credentials } = await client.refreshAccessToken();
      session.tokens = {
        ...session.tokens,
        ...credentials,
      };
      client.setCredentials(session.tokens);
    } catch (error) {
      console.error('Failed to refresh access token', error);
      throw error;
    }
  }

  return client;
}

async function fetchUserProfile(client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    picture: data.picture,
  };
}

const app = express();

app.use(
  cookieSession({
    name: 'n8n-session',
    keys: [SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  }),
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/auth/google', (req, res) => {
  const client = createOAuthClient();
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  });

  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res, next) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).send('Missing required parameters.');
  }

  if (!req.session.oauthState || state !== req.session.oauthState) {
    return res.status(400).send('Invalid state parameter.');
  }

  const client = createOAuthClient();

  try {
    const { tokens } = await client.getToken(code);
    req.session.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
      id_token: tokens.id_token,
    };
    delete req.session.oauthState;
    res.redirect(DASHBOARD_REDIRECT);
  } catch (error) {
    next(error);
  }
});

app.get('/api/session', async (req, res) => {
  try {
    const client = await ensureAuthorizedClient(req.session);
    if (!client) {
      return res.json({ authenticated: false });
    }

    if (!req.session.user) {
      req.session.user = await fetchUserProfile(client);
    }

    res.json({ authenticated: true, user: req.session.user });
  } catch (error) {
    console.error(error);
    req.session = null;
    res.status(401).json({ authenticated: false });
  }
});

app.get('/api/google/profile', async (req, res) => {
  try {
    const client = await ensureAuthorizedClient(req.session);
    if (!client) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const profile = await fetchUserProfile(client);
    req.session.user = profile;
    res.json(profile);
  } catch (error) {
    console.error(error);
    req.session = null;
    res.status(401).json({ error: 'Unable to fetch profile' });
  }
});

app.post('/auth/logout', (req, res) => {
  req.session = null;
  res.status(204).end();
});

app.get('/dashboard', async (req, res, next) => {
  try {
    const client = await ensureAuthorizedClient(req.session);
    if (!client) {
      return res.redirect('/');
    }

    if (!req.session.user) {
      req.session.user = await fetchUserProfile(client);
    }

    return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } catch (error) {
    return next(error);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Auth server listening on port ${PORT}`);
});
