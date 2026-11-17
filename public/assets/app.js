// Lamsa Studio shared helpers: API wrapper, auth redirect, small utilities.

async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
  if (opts.form) {
    init.body = opts.form;
  } else if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(path, init);
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Returns the logged-in user, or sends the visitor to the login page.
async function requireUser() {
  try {
    return await api('/api/me');
  } catch (e) {
    const next = location.pathname.split('/').pop() || 'app.html';
    location.replace('login.html?next=' + encodeURIComponent(next));
    return null;
  }
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  location.href = 'index.html';
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function showAlert(el, text, ok = false) {
  el.textContent = text;
  el.className = 'alert' + (ok ? ' ok' : '');
  el.hidden = false;
}

function hideAlert(el) {
  el.hidden = true;
  el.textContent = '';
}

function fmtDate(ts) {
  return ts ? new Date(ts).toLocaleString() : '';
}

function fmtDzd(n) {
  return Number(n || 0).toLocaleString('en-US') + ' DZD';
}

function statusLabel(status) {
  return window.i18n.t('status_' + status);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.preventDefault(); logout(); });
  });
});
