// Lamsa Studio - Cloudflare Worker (API and private file access). No dependencies.

const PACKS = [
  { id: 'starter', credits: 10, dzd: 1000 },
  { id: 'shop', credits: 30, dzd: 2500 },
  { id: 'pro', credits: 100, dzd: 6000 },
];

const STYLES = {
  studio: 'clean white seamless studio background, soft shadows',
  luxury: 'dark elegant background, dramatic lighting, premium feel',
  outdoor: 'natural outdoor lifestyle scene, daylight',
  ad: 'Instagram square ad poster with a bold layout',
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const METHODS = ['baridimob', 'ccp'];
const STATUSES = ['pending', 'approved', 'rejected'];
const KEY_PATTERN = /^(inputs|outputs|receipts)\/[A-Za-z0-9-]+(\.[a-z]+)?$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => {
  throw new HttpError(status, message);
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));
const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

const sessionCookie = (token, maxAgeSeconds) =>
  `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;

async function currentUser(request, env) {
  const token = getCookie(request, 'sid');
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.credits, u.is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ?`
  )
    .bind(token, Date.now())
    .first();
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) fail(401, 'Please log in first.');
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!user.is_admin) fail(403, 'Admins only.');
  return user;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    fail(400, 'Invalid request body.');
  }
}

async function createSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, Date.now() + SESSION_MS)
    .run();
  return token;
}

const cleanEmail = (value) => String(value || '').trim().toLowerCase();

// ---------- Auth ----------

async function signup(request, env) {
  const body = await readJson(request);
  const name = String(body.name || '').trim().slice(0, 100);
  const email = cleanEmail(body.email);
  const phone = String(body.phone || '').trim().slice(0, 30);
  const password = String(body.password || '');

  if (!name) fail(400, 'Please enter your name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Please enter a valid email.');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters.');

  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) fail(409, 'An account with this email already exists.');

  const salt = randomHex(16);
  const passHash = await hashPassword(password, salt);
  const isAdmin = email === cleanEmail(env.ADMIN_EMAIL) ? 1 : 0;
  const credits = parseInt(env.FREE_CREDITS || '0', 10);

  const row = await env.DB.prepare(
    `INSERT INTO users (email, name, phone, pass_hash, salt, credits, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  )
    .bind(email, name, phone, passHash, salt, credits, isAdmin, Date.now())
    .first();

  const token = await createSession(env, row.id);
  return json(
    { name, email, credits, is_admin: !!isAdmin },
    201,
    { 'Set-Cookie': sessionCookie(token, SESSION_MS / 1000) }
  );
}

async function login(request, env) {
  const body = await readJson(request);
  const email = cleanEmail(body.email);
  const password = String(body.password || '');

  const user = await env.DB.prepare(
    'SELECT id, email, name, credits, is_admin, pass_hash, salt FROM users WHERE email = ?'
  )
    .bind(email)
    .first();

  const hash = user ? await hashPassword(password, user.salt) : '';
  if (!user || !safeEqual(hash, user.pass_hash)) fail(401, 'Wrong email or password.');

  const token = await createSession(env, user.id);
  return json(
    { name: user.name, email: user.email, credits: user.credits, is_admin: !!user.is_admin },
    200,
    { 'Set-Cookie': sessionCookie(token, SESSION_MS / 1000) }
  );
}

async function logout(request, env) {
  const token = getCookie(request, 'sid');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

async function me(request, env) {
  const user = await requireUser(request, env);
  return json({
    name: user.name,
    email: user.email,
    credits: user.credits,
    is_admin: !!user.is_admin,
  });
}

// ---------- Generation ----------

function buildPrompt(style, text) {
  let prompt =
    'Turn this phone photo into a professional product photo. Keep the product itself identical: ' +
    'same shape, colors, labels and details. ' +
    `Style: ${STYLES[style]}.`;
  if (text) {
    prompt += ` Write this text on the image exactly as given, with the same characters and numbers: "${text}".`;
  }
  return prompt;
}

async function generate(request, env) {
  const user = await requireUser(request, env);
  if (user.credits < 1) fail(402, 'You have no credits left. Buy a pack to continue.');

  const form = await request.formData();
  const file = form.get('image');
  const style = String(form.get('style') || '');
  const text = style === 'ad' ? String(form.get('text') || '').trim().slice(0, 300) : '';

  if (!(file instanceof File)) fail(400, 'Please upload a product photo.');
  if (!IMAGE_TYPES.includes(file.type)) fail(400, 'Use a JPG, PNG or WebP image.');
  if (file.size > MAX_BYTES) fail(413, 'The image must be 8 MB or smaller.');
  if (!Object.prototype.hasOwnProperty.call(STYLES, style)) fail(400, 'Please choose a valid style.');

  const id = crypto.randomUUID();
  const inputKey = `inputs/${id}`;
  const outputKey = `outputs/${id}.png`;
  const prompt = buildPrompt(style, text);

  await env.BUCKET.put(inputKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const upstreamBody = new FormData();
  upstreamBody.append('model', env.IMAGE_MODEL);
  upstreamBody.append('image', file, file.name || 'product.png');
  upstreamBody.append('prompt', prompt);
  upstreamBody.append('size', '1024x1024');
  upstreamBody.append('n', '1');

  let upstream;
  try {
    upstream = await fetch(`${env.IMAGE_API_BASE}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.IMAGE_API_KEY}` },
      body: upstreamBody,
    });
  } catch {
    await env.BUCKET.delete(inputKey);
    fail(502, 'The image service could not be reached. You were not charged.');
  }

  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error('Image API error', upstream.status, detail);
    await env.BUCKET.delete(inputKey);
    fail(502, `The image service returned an error (${upstream.status}). You were not charged. Please try again.`);
  }

  const data = await upstream.json().catch(() => null);
  const item = data && data.data && data.data[0];
  let bytes = null;

  if (item && item.b64_json) {
    bytes = Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0));
  } else if (item && item.url) {
    const img = await fetch(item.url);
    if (img.ok) bytes = new Uint8Array(await img.arrayBuffer());
  }

  if (!bytes) {
    await env.BUCKET.delete(inputKey);
    fail(502, 'The image service returned no picture. You were not charged.');
  }

  await env.BUCKET.put(outputKey, bytes, { httpMetadata: { contentType: 'image/png' } });

  // Charge only after success. The WHERE clause prevents going below zero.
  const charge = await env.DB.prepare('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0')
    .bind(user.id)
    .run();
  if (!charge.meta || charge.meta.changes !== 1) {
    await env.BUCKET.delete(outputKey);
    await env.BUCKET.delete(inputKey);
    fail(402, 'You have no credits left. Buy a pack to continue.');
  }

  await env.DB.prepare(
    `INSERT INTO generations (id, user_id, style, input_key, output_key, prompt, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'done', ?)`
  )
    .bind(id, user.id, style, inputKey, outputKey, prompt, Date.now())
    .run();

  return json(
    {
      id,
      style,
      input_url: `/files/${inputKey}`,
      output_url: `/files/${outputKey}`,
      credits: user.credits - 1,
    },
    201
  );
}

async function listGenerations(request, env) {
  const user = await requireUser(request, env);
  const rows = await env.DB.prepare(
    `SELECT id, style, input_key, output_key, status, created_at
       FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  )
    .bind(user.id)
    .all();

  return json(
    rows.results.map((r) => ({
      id: r.id,
      style: r.style,
      status: r.status,
      created_at: r.created_at,
      input_url: `/files/${r.input_key}`,
      output_url: `/files/${r.output_key}`,
    }))
  );
}

// ---------- Private files ----------

async function serveFile(request, env, key) {
  const user = await requireUser(request, env);

  let allowed = !!user.is_admin;
  if (!allowed) {
    const generation = await env.DB.prepare(
      'SELECT 1 FROM generations WHERE user_id = ? AND (input_key = ? OR output_key = ?)'
    )
      .bind(user.id, key, key)
      .first();
    const receipt = await env.DB.prepare('SELECT 1 FROM payments WHERE user_id = ? AND receipt_key = ?')
      .bind(user.id, key)
      .first();
    allowed = !!(generation || receipt);
  }
  if (!allowed) fail(404, 'Not found.');

  const object = await env.BUCKET.get(key);
  if (!object) fail(404, 'Not found.');

  return new Response(object.body, {
    headers: {
      'Content-Type': (object.httpMetadata && object.httpMetadata.contentType) || 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ---------- Payments ----------

async function createPayment(request, env) {
  const user = await requireUser(request, env);
  const form = await request.formData();
  const pack = PACKS.find((p) => p.id === String(form.get('pack') || ''));
  const method = String(form.get('method') || '');
  const receipt = form.get('receipt');

  if (!pack) fail(400, 'Please choose a credit pack.');
  if (!METHODS.includes(method)) fail(400, 'Please choose BaridiMob or CCP.');
  if (!(receipt instanceof File)) fail(400, 'Please upload your receipt.');
  if (!IMAGE_TYPES.includes(receipt.type)) fail(400, 'The receipt must be a JPG, PNG or WebP image.');
  if (receipt.size > MAX_BYTES) fail(413, 'The receipt must be 8 MB or smaller.');

  const id = crypto.randomUUID();
  const receiptKey = `receipts/${id}`;
  await env.BUCKET.put(receiptKey, await receipt.arrayBuffer(), {
    httpMetadata: { contentType: receipt.type },
  });

  await env.DB.prepare(
    `INSERT INTO payments (id, user_id, pack, amount_dzd, credits, method, receipt_key, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  )
    .bind(id, user.id, pack.id, pack.dzd, pack.credits, method, receiptKey, Date.now())
    .run();

  return json(
    { id, pack: pack.id, amount_dzd: pack.dzd, credits: pack.credits, method, status: 'pending' },
    201
  );
}

async function listPayments(request, env) {
  const user = await requireUser(request, env);
  const rows = await env.DB.prepare(
    `SELECT id, pack, amount_dzd, credits, method, status, receipt_key, created_at, reviewed_at
       FROM payments WHERE user_id = ? ORDER BY created_at DESC`
  )
    .bind(user.id)
    .all();

  return json(
    rows.results.map(({ receipt_key, ...rest }) => ({ ...rest, receipt_url: `/files/${receipt_key}` }))
  );
}

// ---------- Admin ----------

async function adminListPayments(request, env, url) {
  await requireAdmin(request, env);
  const status = url.searchParams.get('status') || 'pending';
  if (!STATUSES.includes(status)) fail(400, 'Unknown status.');

  const rows = await env.DB.prepare(
    `SELECT p.id, p.pack, p.amount_dzd, p.credits, p.method, p.status, p.receipt_key, p.created_at,
            p.reviewed_at, u.name, u.email, u.phone
       FROM payments p JOIN users u ON u.id = p.user_id
      WHERE p.status = ? ORDER BY p.created_at ASC`
  )
    .bind(status)
    .all();

  return json(
    rows.results.map(({ receipt_key, ...rest }) => ({ ...rest, receipt_url: `/files/${receipt_key}` }))
  );
}

async function adminReview(request, env, paymentId, action) {
  await requireAdmin(request, env);
  const now = Date.now();

  if (action === 'approve') {
    // Both statements run in one transaction. The credit step only matches the
    // payment that this request just changed, so credits are never added twice.
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE payments SET status = 'approved', reviewed_at = ? WHERE id = ? AND status = 'pending'"
      ).bind(now, paymentId),
      env.DB.prepare(
        `UPDATE users SET credits = credits + (
             SELECT credits FROM payments WHERE id = ? AND status = 'approved' AND reviewed_at = ?
           )
         WHERE id = (SELECT user_id FROM payments WHERE id = ?)`
      ).bind(paymentId, now, paymentId),
    ]);
    if (!results[0].meta || results[0].meta.changes !== 1) {
      fail(409, 'This payment was already reviewed.');
    }
    return json({ ok: true, status: 'approved' });
  }

  const result = await env.DB.prepare(
    "UPDATE payments SET status = 'rejected', reviewed_at = ? WHERE id = ? AND status = 'pending'"
  )
    .bind(now, paymentId)
    .run();
  if (!result.meta || result.meta.changes !== 1) fail(409, 'This payment was already reviewed.');
  return json({ ok: true, status: 'rejected' });
}

async function adminStats(request, env) {
  await requireAdmin(request, env);
  const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  const generations = await env.DB.prepare('SELECT COUNT(*) AS n FROM generations').first();
  const revenue = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount_dzd), 0) AS total FROM payments WHERE status = 'approved'"
  ).first();
  return json({
    users: users.n,
    generations: generations.n,
    revenue_dzd: revenue.total,
  });
}

// ---------- Router ----------

const routes = [
  { method: 'POST', path: /^\/api\/signup$/, handler: (req, env) => signup(req, env) },
  { method: 'POST', path: /^\/api\/login$/, handler: (req, env) => login(req, env) },
  { method: 'POST', path: /^\/api\/logout$/, handler: (req, env) => logout(req, env) },
  { method: 'GET', path: /^\/api\/me$/, handler: (req, env) => me(req, env) },
  { method: 'GET', path: /^\/api\/packs$/, handler: async () => json(PACKS) },
  { method: 'POST', path: /^\/api\/generate$/, handler: (req, env) => generate(req, env) },
  { method: 'GET', path: /^\/api\/generations$/, handler: (req, env) => listGenerations(req, env) },
  { method: 'POST', path: /^\/api\/payments$/, handler: (req, env) => createPayment(req, env) },
  { method: 'GET', path: /^\/api\/payments$/, handler: (req, env) => listPayments(req, env) },
  {
    method: 'GET',
    path: /^\/api\/admin\/payments$/,
    handler: (req, env, url) => adminListPayments(req, env, url),
  },
  {
    method: 'POST',
    path: /^\/api\/admin\/payments\/([^/]+)\/(approve|reject)$/,
    handler: (req, env, url, match) => adminReview(req, env, match[1], match[2]),
  },
  { method: 'GET', path: /^\/api\/admin\/stats$/, handler: (req, env) => adminStats(req, env) },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname.startsWith('/files/')) {
        if (request.method !== 'GET') fail(405, 'Method not allowed.');
        const key = decodeURIComponent(pathname.slice('/files/'.length));
        if (!KEY_PATTERN.test(key)) fail(404, 'Not found.');
        return await serveFile(request, env, key);
      }

      if (!pathname.startsWith('/api/')) fail(404, 'Not found.');

      const pathMatches = routes.filter((r) => r.path.test(pathname));
      if (pathMatches.length === 0) fail(404, 'Not found.');

      const route = pathMatches.find((r) => r.method === request.method);
      if (!route) fail(405, 'Method not allowed.');

      const match = pathname.match(route.path);
      return await route.handler(request, env, url, match);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  },
};
