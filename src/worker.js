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

const SIZES = {
  square: '1024x1024',
  tall: '1024x1536',
  wide: '1536x1024',
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;
const SESSION_MS = 365 * 24 * 3600 * 1000; // stay signed in for a year
const RENEW_AFTER_MS = 24 * 3600 * 1000; // push the expiry forward at most once a day
const renewals = new WeakMap();
const METHODS = ['baridimob', 'ccp'];
const STATUSES = ['pending', 'approved', 'rejected'];
const KEY_PATTERN = /^(inputs|outputs|receipts|logos)\/[A-Za-z0-9-]+(\.[a-z]+)?$/;

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

function withRenewedCookie(request, response) {
  const token = renewals.get(request);
  if (!token || response.headers.has('Set-Cookie')) return response;
  const out = new Response(response.body, response);
  out.headers.append('Set-Cookie', sessionCookie(token, SESSION_MS / 1000));
  return out;
}

const sessionCookie = (token, maxAgeSeconds) =>
  `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;

async function currentUser(request, env) {
  const token = getCookie(request, 'sid');
  if (!token) return null;
  const now = Date.now();
  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.credits, u.is_admin, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ?`
  )
    .bind(token, now)
    .first();
  // Sliding sign-in: while the customer keeps coming back, they never get logged out.
  if (user && user.expires_at < now + SESSION_MS - RENEW_AFTER_MS) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').bind(now + SESSION_MS, token).run();
    renewals.set(request, token);
  }
  return user;
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
    free_retries_left: await freeRetriesLeft(env, user.id),
  });
}

// ---------- Generation ----------

const PROMPT_MODES = ['template', 'custom'];
const MAX_VERSIONS = 4;
const FREE_RETRIES = 5;
const FREE_RETRY_WINDOW_MS = 12 * 3600 * 1000;

const KEEP_PRODUCT =
  'Turn this phone photo into a professional product photo. Keep the product itself identical: ' +
  'same shape, colors, labels and details. ';

const CUTOUT_PROMPT =
  'Remove the background completely. Keep only the product, exactly as it is (same shape, colors, ' +
  'labels, text and details), centered on a plain pure white background. Do not change the product.';

function buildPrompt(style, text, userPrompt) {
  if (PROMPT_MODES.includes(style)) {
    return (
      KEEP_PRODUCT +
      'Create the scene the customer describes below. If it asks for text on the image, write that text ' +
      'exactly as given, with the same characters and numbers. Customer description: ' +
      userPrompt
    );
  }
  let prompt = KEEP_PRODUCT + `Style: ${STYLES[style]}.`;
  if (text) {
    prompt += ` Write this text on the image exactly as given, with the same characters and numbers: "${text}".`;
  }
  return prompt;
}

function brandPrompt(kit, hasLogo) {
  if (!kit) return '';
  let out = ' Branding:';
  if (hasLogo) out += " The second image is the shop's logo. Place it small and clean in one corner, without changing it.";
  if (kit.colors) out += ` Use these brand colors where they fit the design: ${kit.colors}.`;
  if (kit.shop_name) out += ` If the design has text, you may add the shop name "${kit.shop_name}".`;
  return out === ' Branding:' ? '' : out;
}

// Sends one or more images and a prompt to the image service. Returns a list of PNG byte arrays.
async function callImageApi(env, images, prompt, sizeValue, n) {
  const body = new FormData();
  body.append('model', env.IMAGE_MODEL);
  const field = images.length > 1 ? 'image[]' : 'image';
  for (const img of images) {
    body.append(field, new Blob([img.bytes], { type: img.type }), img.name);
  }
  body.append('prompt', prompt);
  body.append('size', sizeValue);
  body.append('n', String(n));

  let res;
  try {
    res = await fetch(`${env.IMAGE_API_BASE}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.IMAGE_API_KEY}` },
      body,
    });
  } catch {
    fail(502, 'The image service could not be reached. You were not charged.');
  }
  if (!res.ok) {
    console.error('Image API error', res.status, (await res.text()).slice(0, 300));
    fail(502, `The image service returned an error (${res.status}). You were not charged. Please try again.`);
  }

  return readImages(res);
}

async function readImages(res) {
  const data = await res.json().catch(() => null);
  const out = [];
  for (const item of (data && data.data) || []) {
    if (item.b64_json) {
      out.push(Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0)));
    } else if (item.url) {
      const img = await fetch(item.url);
      if (img.ok) out.push(new Uint8Array(await img.arrayBuffer()));
    }
  }
  if (out.length === 0) fail(502, 'The image service returned no picture. You were not charged.');
  return out;
}

// Creates pictures from words only (no photo).
async function callTextImageApi(env, prompt, sizeValue, n) {
  let res;
  try {
    res = await fetch(`${env.IMAGE_API_BASE}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.IMAGE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.IMAGE_MODEL, prompt, size: sizeValue, n }),
    });
  } catch {
    fail(502, 'The image service could not be reached. You were not charged.');
  }
  if (!res.ok) {
    console.error('Image API error', res.status, (await res.text()).slice(0, 300));
    fail(502, `The image service returned an error (${res.status}). You were not charged. Please try again.`);
  }
  return readImages(res);
}

function buildTextPrompt(userPrompt) {
  return (
    'Create a high-quality, professional, realistic image for an online shop, exactly as described below. ' +
    'If it asks for text on the image, write that text exactly as given, with the same characters and numbers. ' +
    'Description: ' + userPrompt
  );
}

// Text-only picture. With a logo, the logo is sent as the only image and the scene is drawn from scratch.
async function runTextGeneration(env, prompt, logo, sizeValue, n) {
  if (logo) {
    const withLogo =
      prompt + ' The attached image is only the shop logo, not the product: create the whole scene from scratch ' +
      'and place this logo small and clean in one corner, without changing it.';
    return callImageApi(env, [logo], withLogo, sizeValue, n);
  }
  return callTextImageApi(env, prompt, sizeValue, n);
}

async function readObject(env, key) {
  const obj = await env.BUCKET.get(key);
  if (!obj) fail(404, 'The original photo is no longer available.');
  return {
    bytes: new Uint8Array(await obj.arrayBuffer()),
    type: (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/png',
    name: key.split('/').pop() + '.png',
  };
}

// Charges `amount` credits. Returns the new balance, or fails without charging.
async function charge(env, userId, amount) {
  const row = await env.DB.prepare(
    'UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ? RETURNING credits'
  )
    .bind(amount, userId, amount)
    .first();
  if (!row) fail(402, 'You do not have enough credits. Buy a pack to continue.');
  return row.credits;
}

async function freeRetriesLeft(env, userId) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND free_retry = 1 AND created_at > ?'
  )
    .bind(userId, Date.now() - FREE_RETRY_WINDOW_MS)
    .first();
  return Math.max(0, FREE_RETRIES - ((row && row.n) || 0));
}

async function getBrandKit(env, userId) {
  return env.DB.prepare('SELECT shop_name, colors, logo_key FROM brand_kits WHERE user_id = ?')
    .bind(userId)
    .first();
}

function itemFromRow(r) {
  return {
    id: r.id,
    batch_id: r.batch_id || r.id,
    kind: r.kind || 'new',
    style: r.style,
    size: r.size || 'square',
    status: r.status,
    created_at: r.created_at,
    input_key: r.input_key || null,
    input_url: r.input_key ? `/files/${r.input_key}` : null,
    output_url: `/files/${r.output_key}`,
  };
}

async function saveOutputs(env, user, outputs, meta) {
  const now = Date.now();
  const items = [];
  for (let i = 0; i < outputs.length; i++) {
    const id = crypto.randomUUID();
    const outputKey = `outputs/${id}.png`;
    await env.BUCKET.put(outputKey, outputs[i], { httpMetadata: { contentType: 'image/png' } });
    const row = {
      id,
      user_id: user.id,
      batch_id: meta.batchId,
      parent_id: meta.parentId || null,
      kind: meta.kind,
      free_retry: meta.freeRetry ? 1 : 0,
      style: meta.style,
      size: meta.size,
      input_key: meta.inputKey,
      source_key: meta.sourceKey,
      logo_key: meta.logoKey || null,
      output_key: outputKey,
      prompt: meta.prompt,
      status: 'done',
      created_at: now + i,
    };
    await env.DB.prepare(
      `INSERT INTO generations (id, user_id, batch_id, parent_id, kind, free_retry, style, size,
         input_key, source_key, logo_key, output_key, prompt, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        row.id, row.user_id, row.batch_id, row.parent_id, row.kind, row.free_retry, row.style, row.size,
        row.input_key, row.source_key, row.logo_key, row.output_key, row.prompt, row.status, row.created_at
      )
      .run();
    items.push(itemFromRow(row));
  }
  return items;
}

async function generate(request, env) {
  const user = await requireUser(request, env);

  const form = await request.formData();
  const file = form.get('image');
  const style = String(form.get('style') || '');
  const text = style === 'ad' ? String(form.get('text') || '').trim().slice(0, 300) : '';
  const sizeName = String(form.get('size') || 'square');
  const userPrompt = PROMPT_MODES.includes(style) ? String(form.get('prompt') || '').trim().slice(0, 1000) : '';
  const count = Math.min(MAX_VERSIONS, Math.max(1, parseInt(form.get('count') || '1', 10) || 1));
  const useCutout = form.get('cutout') === '1';
  const useBrand = form.get('brand') === '1';

  const hasPhoto = file instanceof File && file.size > 0;
  if (!hasPhoto) return generateFromText(env, user, form, sizeName, count, useBrand);
  if (!IMAGE_TYPES.includes(file.type)) fail(400, 'Use a JPG, PNG or WebP image.');
  if (file.size > MAX_BYTES) fail(413, 'The image must be 8 MB or smaller.');
  if (!Object.prototype.hasOwnProperty.call(STYLES, style) && !PROMPT_MODES.includes(style)) {
    fail(400, 'Please choose a valid style.');
  }
  if (PROMPT_MODES.includes(style) && userPrompt.length < 5) fail(400, 'Please describe the picture you want.');
  if (!Object.prototype.hasOwnProperty.call(SIZES, sizeName)) fail(400, 'Please choose a valid size.');
  if (user.credits < count) fail(402, 'You do not have enough credits. Buy a pack to continue.');

  const batchId = crypto.randomUUID();
  const inputKey = `inputs/${batchId}`;
  const original = { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type, name: file.name || 'product.png' };
  await env.BUCKET.put(inputKey, original.bytes, { httpMetadata: { contentType: file.type } });

  // Optional clean cutout first. If it fails, quietly use the original photo.
  let source = original;
  let sourceKey = inputKey;
  if (useCutout) {
    try {
      const [cut] = await callImageApi(env, [original], CUTOUT_PROMPT, '1024x1024', 1);
      sourceKey = `inputs/${batchId}-cut`;
      await env.BUCKET.put(sourceKey, cut, { httpMetadata: { contentType: 'image/png' } });
      source = { bytes: cut, type: 'image/png', name: 'product.png' };
    } catch (err) {
      console.error('Cutout failed, using original', err && err.message);
    }
  }

  const images = [source];
  let prompt = buildPrompt(style, text, userPrompt);
  let logoKey = null;
  if (useBrand) {
    const kit = await getBrandKit(env, user.id);
    if (kit && kit.logo_key) {
      const logo = await env.BUCKET.get(kit.logo_key);
      if (logo) {
        images.push({
          bytes: new Uint8Array(await logo.arrayBuffer()),
          type: (logo.httpMetadata && logo.httpMetadata.contentType) || 'image/png',
          name: 'logo.png',
        });
        logoKey = kit.logo_key;
      }
    }
    prompt += brandPrompt(kit, !!logoKey);
  }

  let outputs;
  try {
    outputs = await callImageApi(env, images, prompt, SIZES[sizeName], count);
  } catch (err) {
    await env.BUCKET.delete(inputKey);
    if (sourceKey !== inputKey) await env.BUCKET.delete(sourceKey);
    throw err;
  }
  outputs = outputs.slice(0, count);

  const credits = await charge(env, user.id, outputs.length);
  const items = await saveOutputs(env, user, outputs, {
    batchId, kind: 'new', style, size: sizeName, inputKey, sourceKey, logoKey, prompt,
  });

  return json({ items, credits, free_retries_left: await freeRetriesLeft(env, user.id) }, 201);
}

async function loadLogo(env, key) {
  if (!key) return null;
  const obj = await env.BUCKET.get(key);
  if (!obj) return null;
  return {
    bytes: new Uint8Array(await obj.arrayBuffer()),
    type: (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/png',
    name: 'logo.png',
  };
}

async function generateFromText(env, user, form, sizeName, count, useBrand) {
  const userPrompt = String(form.get('prompt') || '').trim().slice(0, 1000);
  if (userPrompt.length < 5) fail(400, 'Upload a product photo, or describe the picture you want.');
  if (!Object.prototype.hasOwnProperty.call(SIZES, sizeName)) fail(400, 'Please choose a valid size.');
  if (user.credits < count) fail(402, 'You do not have enough credits. Buy a pack to continue.');

  let prompt = buildTextPrompt(userPrompt);
  let logo = null;
  let logoKey = null;
  if (useBrand) {
    const kit = await getBrandKit(env, user.id);
    logo = await loadLogo(env, kit && kit.logo_key);
    if (logo) logoKey = kit.logo_key;
    prompt += brandPrompt(kit, false);
  }

  const outputs = (await runTextGeneration(env, prompt, logo, SIZES[sizeName], count)).slice(0, count);
  const credits = await charge(env, user.id, outputs.length);
  const items = await saveOutputs(env, user, outputs, {
    batchId: crypto.randomUUID(), kind: 'new', style: 'text', size: sizeName,
    inputKey: null, sourceKey: null, logoKey, prompt,
  });
  return json({ items, credits, free_retries_left: await freeRetriesLeft(env, user.id) }, 201);
}

async function loadOwnGeneration(env, userId, id) {
  const row = await env.DB.prepare('SELECT * FROM generations WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!row) fail(404, 'Picture not found.');
  return row;
}

// Same photo, same settings, new attempt. Free up to FREE_RETRIES times every 12 hours.
async function retryGeneration(request, env, id) {
  const user = await requireUser(request, env);
  const gen = await loadOwnGeneration(env, user.id, id);
  const freeLeft = await freeRetriesLeft(env, user.id);
  const isFree = freeLeft > 0;
  if (!isFree && user.credits < 1) fail(402, 'No free retries left and no credits. Buy a pack to continue.');

  let outputs;
  const sizeValue = SIZES[gen.size] || SIZES.square;
  if (!gen.source_key && !gen.input_key) {
    outputs = await runTextGeneration(env, gen.prompt, await loadLogo(env, gen.logo_key), sizeValue, 1);
  } else {
    const images = [await readObject(env, gen.source_key || gen.input_key)];
    const logo = await loadLogo(env, gen.logo_key);
    if (logo) images.push(logo);
    outputs = await callImageApi(env, images, gen.prompt, sizeValue, 1);
  }

  const credits = isFree ? user.credits : await charge(env, user.id, 1);
  const items = await saveOutputs(env, user, outputs.slice(0, 1), {
    batchId: gen.batch_id || gen.id,
    parentId: gen.id,
    kind: 'retry',
    freeRetry: isFree,
    style: gen.style,
    size: gen.size,
    inputKey: gen.input_key,
    sourceKey: gen.source_key || gen.input_key,
    logoKey: gen.logo_key,
    prompt: gen.prompt,
  });
  return json({ items, credits, free_retries_left: await freeRetriesLeft(env, user.id), free: isFree }, 201);
}

// "Change this": edit a finished picture with a short instruction. Costs 1 credit.
async function editGeneration(request, env, id) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const instruction = String(body.instruction || '').trim().slice(0, 500);
  if (instruction.length < 3) fail(400, 'Please write what you want to change.');
  if (user.credits < 1) fail(402, 'You do not have enough credits. Buy a pack to continue.');

  const gen = await loadOwnGeneration(env, user.id, id);
  const prompt =
    'Edit this product photo. Change only this: ' + instruction +
    '. Keep the product itself identical (same shape, colors, labels and details) and keep everything else ' +
    'as it is unless the change asks otherwise. If the change asks for text, write it exactly as given.';

  const outputs = await callImageApi(env, [await readObject(env, gen.output_key)], prompt, SIZES[gen.size] || SIZES.square, 1);
  const credits = await charge(env, user.id, 1);
  const items = await saveOutputs(env, user, outputs.slice(0, 1), {
    batchId: gen.batch_id || gen.id,
    parentId: gen.id,
    kind: 'edit',
    style: gen.style,
    size: gen.size,
    inputKey: gen.output_key,
    sourceKey: gen.output_key,
    logoKey: null,
    prompt,
  });
  return json({ items, credits, free_retries_left: await freeRetriesLeft(env, user.id) }, 201);
}

async function listGenerations(request, env) {
  const user = await requireUser(request, env);
  const rows = await env.DB.prepare(
    `SELECT id, batch_id, kind, style, size, input_key, output_key, status, created_at
       FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 60`
  )
    .bind(user.id)
    .all();
  return json(rows.results.map(itemFromRow));
}

// ---------- Improve my description (Cloudflare Workers AI) ----------

async function improvePrompt(request, env) {
  await requireUser(request, env);
  const body = await readJson(request);
  const input = String(body.prompt || '').trim().slice(0, 600);
  if (input.length < 2) fail(400, 'Write a few words first.');
  if (!env.AI) fail(503, 'This feature is not available right now.');

  let result;
  try {
    result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content:
            'You improve short descriptions for an AI product-photo generator. Rewrite the user text as one ' +
            'rich, concrete scene description (40 to 80 words): where the product is, background, surface, ' +
            'props, light, mood and camera angle. Keep any text the user wants written on the image exactly ' +
            'as given, in quotes. Never describe changes to the product itself. Answer in the same language ' +
            'as the user text. Reply with the description only, no title, no quotes around it, no notes.',
        },
        { role: 'user', content: input },
      ],
      max_tokens: 220,
    });
  } catch (err) {
    console.error('Improve prompt failed', err && err.message);
    fail(502, 'Could not improve the description right now. Please try again.');
  }
  const text = String((result && result.response) || '').trim().replace(/^["'«“]+|["'»”]+$/g, '');
  if (!text) fail(502, 'Could not improve the description right now. Please try again.');
  return json({ prompt: text.slice(0, 1000) });
}

// ---------- Saved settings (presets) ----------

async function listPresets(request, env) {
  const user = await requireUser(request, env);
  const rows = await env.DB.prepare('SELECT id, name, data FROM presets WHERE user_id = ? ORDER BY created_at DESC')
    .bind(user.id)
    .all();
  return json(rows.results.map((r) => ({ id: r.id, name: r.name, data: JSON.parse(r.data) })));
}

async function createPreset(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const name = String(body.name || '').trim().slice(0, 40);
  if (!name) fail(400, 'Please give these settings a name.');
  const data = JSON.stringify(body.data || {});
  if (data.length > 4000) fail(400, 'These settings are too long to save.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM presets WHERE user_id = ?').bind(user.id).first();
  if (count && count.n >= 20) fail(400, 'You can save up to 20 settings. Delete one first.');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO presets (id, user_id, name, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, user.id, name, data, Date.now())
    .run();
  return json({ id, name, data: JSON.parse(data) }, 201);
}

async function deletePreset(request, env, id) {
  const user = await requireUser(request, env);
  await env.DB.prepare('DELETE FROM presets WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return json({ ok: true });
}

// ---------- Brand kit ----------

async function getBrand(request, env) {
  const user = await requireUser(request, env);
  const kit = await getBrandKit(env, user.id);
  return json({
    shop_name: (kit && kit.shop_name) || '',
    colors: (kit && kit.colors) || '',
    logo_url: kit && kit.logo_key ? `/files/${kit.logo_key}` : null,
  });
}

async function saveBrand(request, env) {
  const user = await requireUser(request, env);
  const form = await request.formData();
  const shopName = String(form.get('shop_name') || '').trim().slice(0, 60);
  const colors = String(form.get('colors') || '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
    .slice(0, 3)
    .join(', ');
  const logo = form.get('logo');
  const removeLogo = form.get('remove_logo') === '1';

  const current = await getBrandKit(env, user.id);
  let logoKey = (current && current.logo_key) || null;

  if (logo instanceof File && logo.size > 0) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(logo.type)) fail(400, 'Logo must be PNG, JPG or WebP.');
    if (logo.size > 2 * 1024 * 1024) fail(413, 'Logo must be 2 MB or smaller.');
    const newKey = `logos/${crypto.randomUUID()}`;
    await env.BUCKET.put(newKey, await logo.arrayBuffer(), { httpMetadata: { contentType: logo.type } });
    logoKey = newKey;
  } else if (removeLogo) {
    logoKey = null;
  }

  await env.DB.prepare(
    `INSERT INTO brand_kits (user_id, shop_name, colors, logo_key, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET shop_name = excluded.shop_name, colors = excluded.colors,
       logo_key = excluded.logo_key, updated_at = excluded.updated_at`
  )
    .bind(user.id, shopName, colors, logoKey, Date.now())
    .run();

  return json({ shop_name: shopName, colors, logo_url: logoKey ? `/files/${logoKey}` : null });
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
    const logo = await env.DB.prepare('SELECT 1 FROM brand_kits WHERE user_id = ? AND logo_key = ?')
      .bind(user.id, key)
      .first();
    allowed = !!(generation || receipt || logo);
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
  {
    method: 'POST',
    path: /^\/api\/generations\/([A-Za-z0-9-]+)\/retry$/,
    handler: (req, env, url, match) => retryGeneration(req, env, match[1]),
  },
  {
    method: 'POST',
    path: /^\/api\/generations\/([A-Za-z0-9-]+)\/edit$/,
    handler: (req, env, url, match) => editGeneration(req, env, match[1]),
  },
  { method: 'POST', path: /^\/api\/improve-prompt$/, handler: (req, env) => improvePrompt(req, env) },
  { method: 'GET', path: /^\/api\/presets$/, handler: (req, env) => listPresets(req, env) },
  { method: 'POST', path: /^\/api\/presets$/, handler: (req, env) => createPreset(req, env) },
  {
    method: 'DELETE',
    path: /^\/api\/presets\/([A-Za-z0-9-]+)$/,
    handler: (req, env, url, match) => deletePreset(req, env, match[1]),
  },
  { method: 'GET', path: /^\/api\/brand$/, handler: (req, env) => getBrand(req, env) },
  { method: 'POST', path: /^\/api\/brand$/, handler: (req, env) => saveBrand(req, env) },
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
        return withRenewedCookie(request, await serveFile(request, env, key));
      }

      if (!pathname.startsWith('/api/')) fail(404, 'Not found.');

      const pathMatches = routes.filter((r) => r.path.test(pathname));
      if (pathMatches.length === 0) fail(404, 'Not found.');

      const route = pathMatches.find((r) => r.method === request.method);
      if (!route) fail(405, 'Method not allowed.');

      const match = pathname.match(route.path);
      const response = await route.handler(request, env, url, match);
      return withRenewedCookie(request, response);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  },
};
