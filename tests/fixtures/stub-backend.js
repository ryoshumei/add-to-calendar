// tests/fixtures/stub-backend.js
// A local stand-in for the shared backend, so an Extraction can be driven end
// to end without spending a real request: it answers the Supabase auth
// endpoint the session-restore path calls and the Edge Function the extension
// posts a Source to, and it records every request it receives so a test can
// assert on what the extension actually sent.
//
// It also serves the page a test drives the Selection from, which keeps the
// whole run on 127.0.0.1 with no traffic leaving the machine.

const http = require('http');

// Shaped like the user Supabase's /auth/v1/user returns.
const STUB_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'stub-user@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'Stub User', email: 'stub-user@example.com' },
};

// Titles say "Stubbed" so a modal assertion cannot pass on anything but the
// canned Events this server returned.
const DEFAULT_EVENTS = [
  {
    title: 'Stubbed Design Review',
    startTime: '2026-03-03T10:00:00',
    endTime: '2026-03-03T11:00:00',
    location: 'Room 4',
    description: 'Returned by the stub backend',
  },
];

const DEFAULT_USAGE = { usageCount: 7, limit: 50, yearMonth: '2026-03' };

// Mirrors the corsHeaders of supabase/functions/process-text/index.ts. The
// extension has no host permission for 127.0.0.1, so its fetch is an ordinary
// cross-origin request and needs a preflight answer.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-extension-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Private-Network': 'true',
};

const SOURCE_PAGE_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Stub source page</title></head>
<body>
  <h1>Team offsite</h1>
  <p id="selection-source">Design review on March 3, 2026 from 10:00 to 11:00 in Room 4</p>
</body>
</html>`;

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// A session shaped the way scripts/supabase-client.js persists one. The access
// token only has to survive supabase-js's local decode (three base64url parts,
// an unexpired `exp`); the stub answers the /auth/v1/user call that follows.
function buildStubSession({ expiresInSeconds = 3600 } = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + expiresInSeconds;
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64url({
    sub: STUB_USER.id,
    email: STUB_USER.email,
    aud: 'authenticated',
    role: 'authenticated',
    iat: issuedAt,
    exp: expiresAt,
  });
  const signature = Buffer.from('stub-signature').toString('base64url');

  return {
    access_token: `${header}.${payload}.${signature}`,
    refresh_token: 'stub-refresh-token',
    token_type: 'bearer',
    expires_in: expiresInSeconds,
    expires_at: expiresAt,
    user: STUB_USER,
  };
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function startStubBackend() {
  const requests = [];

  const stub = {
    // Every request the extension made, in order, headers and body included.
    requests,
    // Canned answers; a test may reassign either before triggering a flow.
    events: DEFAULT_EVENTS.map((event) => ({ ...event })),
    usage: { ...DEFAULT_USAGE },
    user: STUB_USER,
    // Holds the Edge Function answers back, so a test can act while an
    // Extraction is still in flight.
    responseDelayMs: 0,
    requestsTo(pathname, method) {
      return requests.filter(
        (request) =>
          request.pathname === pathname &&
          (method === undefined || request.method === method)
      );
    },
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    readBody(req).then((rawBody) => {
      requests.push({
        method: req.method,
        pathname: url.pathname,
        search: url.search,
        headers: req.headers,
        rawBody,
        body: parseJson(rawBody),
      });

      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }

      const json = (status, payload) => {
        const send = () => {
          res.writeHead(status, {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify(payload));
        };

        // Only the Edge Functions are held back: the auth endpoints are part
        // of start-up, not of the flow a test is timing.
        if (stub.responseDelayMs > 0 && url.pathname.startsWith('/functions/v1/')) {
          setTimeout(send, stub.responseDelayMs);
        } else {
          send();
        }
      };

      if (url.pathname === '/auth/v1/user') {
        json(200, stub.user);
        return;
      }

      if (url.pathname === '/functions/v1/process-text') {
        json(200, { eventDetails: { events: stub.events }, usage: stub.usage });
        return;
      }

      if (url.pathname === '/functions/v1/process-image') {
        json(200, { eventDetails: { events: stub.events }, usage: stub.usage });
        return;
      }

      if (url.pathname === '/source-page') {
        res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
        res.end(SOURCE_PAGE_HTML);
        return;
      }

      json(404, { error: `No stub route for ${req.method} ${url.pathname}` });
    });
  });

  // Chrome holds keep-alive connections open, which would stall server.close()
  // past the test timeout, so sockets are tracked and dropped at teardown.
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address();
  stub.baseUrl = `http://127.0.0.1:${port}`;
  stub.pageUrl = `${stub.baseUrl}/source-page`;
  stub.close = () =>
    new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      server.close(resolve);
    });

  return stub;
}

module.exports = { startStubBackend, buildStubSession, STUB_USER };
