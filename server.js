require('dotenv').config();
const express = require('express');
const session = require('express-session');
const db = require('./db');
const app = express();

// Trust proxy for Heroku (required to detect HTTPS)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.WEDDING_PASSWORD || 'changeme';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Redirect HTTP to HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.get('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.get('host')}${req.url}`);
    }
    next();
  });
}

// Disable caching in development for hot reloading
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });
}

app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'wedding-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    // No maxAge means it's a session cookie - expires when browser closes
  }
}));

// Wrap async route handlers so unhandled rejections propagate to Express error handler
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const requireAuth = (req, res, next) => {
  if (req.session.authenticated) return next();
  res.redirect('/');
};

const requireAdmin = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.redirect('/');
};

// Login page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Wedding</title>
      <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='goldGrad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23d4af37;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23f4e4bc;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='45' fill='url(%23goldGrad)'/%3E%3C/svg%3E">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: white;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        .container {
          text-align: center;
        }
        form {
          display: flex;
          flex-direction: column;
          gap: 15px;
          align-items: center;
        }
        input[type="password"] {
          padding: 12px 20px;
          font-size: 16px;
          border: 2px solid #ddd;
          border-radius: 8px;
          width: 250px;
          outline: none;
          transition: border-color 0.3s;
        }
        input[type="password"]:focus {
          border-color: #999;
        }
        button {
          padding: 12px 30px;
          font-size: 16px;
          background: #333;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.3s;
        }
        button:hover {
          background: #555;
        }
        .error {
          color: #d32f2f;
          font-size: 14px;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <form method="POST" action="/login">
          <input type="password" name="password" placeholder="Enter password" required autofocus>
          <button type="submit">Enter</button>
          ${req.query.error ? '<div class="error">Incorrect password. Please try again.</div>' : ''}
        </form>
      </div>
    </body>
    </html>
  `);
});

// Handle login
app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    req.session.isAdmin = true;
  } else if (password === PASSWORD) {
    req.session.authenticated = true;
    req.session.isAdmin = false;
  } else {
    return res.redirect('/?error=1');
  }
  req.session.save((err) => {
    if (err) return res.redirect('/?error=1');
    res.redirect(req.session.isAdmin ? '/admin' : '/wedding');
  });
});

// Protected wedding page
app.get('/wedding', requireAuth, ah(async (req, res) => {
  const setting = await db.get(`SELECT value FROM settings WHERE key = 'rsvp_enabled'`);
  const rsvpEnabled = setting?.value === '1';
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Wedding</title>
      <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='goldGrad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23d4af37;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23f4e4bc;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='45' fill='url(%23goldGrad)'/%3E%3C/svg%3E">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Lato:wght@300;400&display=swap" rel="stylesheet">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Playfair Display', serif;
          background: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 40px 20px;
        }
        h1 {
          font-size: clamp(40px, 10vw, 72px);
          font-weight: 700;
          letter-spacing: clamp(2px, 1vw, 4px);
          color: #333;
          margin-bottom: 20px;
        }
        .date-location {
          font-size: clamp(16px, 4vw, 24px);
          font-weight: 400;
          color: #666;
          letter-spacing: 1px;
        }
        .date-location:first-of-type {
          margin-bottom: 4px;
        }
        .address-link {
          display: inline-block;
          max-width: 280px;
          margin-top: 44px;
          margin-bottom: 50px;
          padding: 14px 44px;
          font-family: 'Lato', sans-serif;
          font-size: 18px;
          font-weight: 400;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: white;
          text-decoration: none;
          text-align: center;
          background: #333;
          border: 1px solid #333;
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s, background 0.2s;
        }
        .address-link:hover {
          color: white;
          background: #555;
          border-color: #555;
        }
        img {
          max-width: min(80%, 600px);
          max-height: 70vh;
          width: auto;
          height: auto;
          object-fit: contain;
          border-radius: 8px;
          margin-bottom: 40px;
        }
        .details {
          font-size: 18px;
          font-weight: 400;
          color: #888;
          font-style: italic;
          letter-spacing: 0.5px;
        }
        .rsvp {
          width: 100%;
          max-width: 480px;
          margin-bottom: 50px;
          font-family: 'Lato', sans-serif;
          color: #333;
        }
        .rsvp form { display: flex; flex-direction: column; gap: 12px; }
        .rsvp label { font-size: 14px; letter-spacing: 0.5px; color: #555; display: flex; flex-direction: column; gap: 6px; }
        .rsvp input, .rsvp select {
          padding: 10px 12px; font-size: 15px; font-family: 'Lato', sans-serif; border: 1px solid #ddd; border-radius: 6px; outline: none; background: white;
        }
        .rsvp input:focus, .rsvp select:focus { border-color: #888; }
        .rsvp button {
          padding: 10px 18px; font-size: 14px; font-family: 'Lato', sans-serif; letter-spacing: 1px; text-transform: uppercase;
          background: #333; color: white; border: 1px solid #333; border-radius: 6px; cursor: pointer;
        }
        .rsvp button:hover { background: #555; border-color: #555; }
        .rsvp button.secondary { background: white; color: #333; }
        .rsvp button.secondary:hover { background: #f5f5f5; }
        .rsvp .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .rsvp p { font-size: 16px; margin-bottom: 12px; line-height: 1.5; text-align: center; }
        .rsvp fieldset {
          border: 1px solid #eee; border-radius: 6px; padding: 16px; display: flex; flex-direction: column; gap: 12px;
        }
        .rsvp legend { padding: 0 8px; font-size: 14px; color: #666; }
        .rsvp .event-block { display: flex; flex-direction: column; gap: 12px; }
        .rsvp .friday-block { border-top: 1px solid #e0e0e0; padding-top: 16px; margin-top: 4px; }
        .rsvp .event-header { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #999; }
        .rsvp .success { font-size: 22px; text-align: center; color: #333; font-family: 'Playfair Display', serif; }
        @media (max-width: 480px) {
          body { padding: 32px 16px; }
          img { max-width: 100%; }
          .rsvp { max-width: 100%; }
        }
      </style>
    </head>
    <body>
      <h1>WEDDING</h1>
      <img src="/IMG_8784.JPG" alt="Wedding">
      <div class="date-location">OCTOBER 10, 2026</div>
      <div class="date-location">BROOKLYN, NY</div>
      ${rsvpEnabled ? '<button class="address-link" id="rsvp-trigger" onclick="startRsvp()">RSVP</button>' : ''}

      <div class="rsvp" id="rsvp-section" hidden>
        <div class="stage" id="stage-search">
          <form onsubmit="searchRsvp(event)">
            <label>Enter your full name or email</label>
            <input id="rsvp-query" name="query" required autocomplete="off">
            <button type="submit">Look up</button>
          </form>
        </div>
        <div class="stage" id="stage-results" hidden></div>
        <div class="stage" id="stage-form" hidden></div>
        <div class="stage" id="stage-success" hidden>
          <p class="success">Thanks for RSVPing!</p>
        </div>
      </div>

      <script>
        const stages = ['search', 'results', 'form', 'success'];
        function showStage(s) {
          for (const stage of stages) {
            document.getElementById('stage-' + stage).hidden = stage !== s;
          }
        }
        function startRsvp() {
          document.getElementById('rsvp-trigger').hidden = true;
          document.getElementById('rsvp-section').hidden = false;
          showStage('search');
          document.getElementById('rsvp-query').focus();
        }
        function escapeHtml(s) {
          return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        }
        async function searchRsvp(e) {
          e.preventDefault();
          const query = document.getElementById('rsvp-query').value;
          const r = await fetch('/api/rsvp/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
          });
          const { matches } = await r.json();
          renderResults(matches);
          showStage('results');
        }
        function renderResults(matches) {
          const c = document.getElementById('stage-results');
          if (!matches.length) {
            c.innerHTML = '<p>We couldn\\'t find you. Please check the spelling.</p><button onclick="showStage(\\'search\\')">Try again</button>';
            return;
          }
          if (matches.length === 1) {
            const m = matches[0];
            c.innerHTML = '<p>We found: <strong>' + escapeHtml(m.full_name) + '</strong>. Is this you?</p>'
              + '<div class="actions"><button onclick="loadRsvp(' + m.id + ')">Yes, continue</button>'
              + '<button class="secondary" onclick="showStage(\\'search\\')">No, search again</button></div>';
            return;
          }
          c.innerHTML = '<p>Multiple matches found. Please pick:</p><div class="actions">'
            + matches.map(m => '<button onclick="loadRsvp(' + m.id + ')">' + escapeHtml(m.full_name) + '</button>').join('')
            + '</div><button class="secondary" onclick="showStage(\\'search\\')">Search again</button>';
        }
        async function loadRsvp(id) {
          const r = await fetch('/api/rsvp/' + id);
          const data = await r.json();
          renderForm(data);
          showStage('form');
        }
        function personHtml(p, prefix) {
          const firstName = escapeHtml(p.full_name.split(' ')[0]);
          let html = '<fieldset><legend>' + escapeHtml(p.full_name) + '</legend>'
            + '<div class="event-block">'
            + '<div class="event-header">Saturday, October 10 \u2014 The Wedding</div>'
            + '<label>Will ' + firstName + ' attend?'
            + '<select name="' + prefix + '-attending" required>'
            + '<option value="">--</option>'
            + '<option value="1"' + (p.attending === 1 ? ' selected' : '') + '>Yes</option>'
            + '<option value="0"' + (p.attending === 0 ? ' selected' : '') + '>No</option>'
            + '</select></label>'
            + '<label>Dietary restrictions<input name="' + prefix + '-dietary" value="' + escapeHtml(p.dietary_restrictions) + '"></label>'
            + '</div>';
          if (p.friday_invite) {
            html += '<div class="event-block friday-block">'
              + '<div class="event-header">Friday, October 9 \u2014 Welcome Party</div>'
              + '<label>Will ' + firstName + ' attend?'
              + '<select name="' + prefix + '-friday-attending">'
              + '<option value="">--</option>'
              + '<option value="1"' + (p.friday_attending === 1 ? ' selected' : '') + '>Yes</option>'
              + '<option value="0"' + (p.friday_attending === 0 ? ' selected' : '') + '>No</option>'
              + '</select></label>'
              + '</div>';
          }
          html += '<input type="hidden" name="' + prefix + '-id" value="' + p.id + '"></fieldset>';
          return html;
        }
        function renderForm({ primary, linked }) {
          const c = document.getElementById('stage-form');
          c.innerHTML = '<form onsubmit="submitRsvp(event)">'
            + personHtml(primary, 'p')
            + (linked ? personHtml(linked, 'l') : '')
            + '<button type="submit">Submit RSVP</button></form>';
        }
        async function submitRsvp(e) {
          e.preventDefault();
          const fd = new FormData(e.target);
          const entries = [{
            id: Number(fd.get('p-id')),
            attending: fd.get('p-attending'),
            dietary_restrictions: fd.get('p-dietary'),
            friday_attending: fd.get('p-friday-attending')
          }];
          if (fd.get('l-id')) {
            entries.push({
              id: Number(fd.get('l-id')),
              attending: fd.get('l-attending'),
              dietary_restrictions: fd.get('l-dietary'),
              friday_attending: fd.get('l-friday-attending')
            });
          }
          await fetch('/api/rsvp/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries })
          });
          showStage('success');
        }
      </script>
    </body>
    </html>
  `);
}));

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);

const cleanEmail = (e) => {
  if (!e) return e;
  const m = e.match(/^\[([^\]]+)\]\(mailto:[^)]+\)$/);
  return (m ? m[1] : e).trim();
};

const parseCsv = (text) => {
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(',').map(p => p.trim());
      const fridayRaw = (parts[2] || '').toLowerCase();
      const friday_invite = ['yes', '1', 'true', 'y'].includes(fridayRaw) ? 1 : 0;
      return { full_name: parts[0] || '', email: cleanEmail(parts[1] || ''), friday_invite };
    })
    .filter(row => row.full_name);
};

// Admin routes
app.post('/admin/settings/rsvp-toggle', requireAdmin, ah(async (req, res) => {
  const current = await db.get(`SELECT value FROM settings WHERE key = 'rsvp_enabled'`);
  const next = current?.value === '1' ? '0' : '1';
  await db.run(`UPDATE settings SET value = ? WHERE key = 'rsvp_enabled'`, [next]);
  res.redirect('/admin');
}));

app.get('/admin', requireAdmin, ah(async (req, res) => {
  const setting = await db.get(`SELECT value FROM settings WHERE key = 'rsvp_enabled'`);
  const rsvpEnabled = setting?.value === '1';
  const guests = (await db.all('SELECT * FROM rsvp')).sort((a, b) =>
    a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
  );

  const sortedGuests = guests;
  const guestOptions = (currentId, selectedId) => sortedGuests
    .filter(g => g.id !== currentId)
    .map(g =>
      `<option value="${g.id}"${g.id === selectedId ? ' selected' : ''}>${escapeHtml(g.full_name)}</option>`
    ).join('');

  const attendingOptions = (v) => `
    <option value=""${v === null ? ' selected' : ''}>—</option>
    <option value="1"${v === 1 ? ' selected' : ''}>Yes</option>
    <option value="0"${v === 0 ? ' selected' : ''}>No</option>
  `;

  const fridayInviteOptions = (v) => `
    <option value="0"${!v ? ' selected' : ''}>No</option>
    <option value="1"${v ? ' selected' : ''}>Yes</option>
  `;

  const saveForm = `<form id="save-all" method="POST" action="/admin/guests/save"></form>`;
  const deleteForms = guests.map(g =>
    `<form id="del-${g.id}" method="POST" action="/admin/guests/${g.id}/delete"></form>`
  ).join('');

  const trash = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;

  const rows = guests.map(g => `
    <tr>
      <td>${g.id}</td>
      <td><input form="save-all" name="g[r${g.id}][full_name]" value="${escapeHtml(g.full_name)}" required></td>
      <td><input form="save-all" name="g[r${g.id}][email]" type="email" value="${escapeHtml(g.email)}"></td>
      <td><input form="save-all" name="g[r${g.id}][dietary_restrictions]" value="${escapeHtml(g.dietary_restrictions)}"></td>
      <td>
        <select form="save-all" name="g[r${g.id}][can_also_rsvp_for]">
          <option value=""${g.can_also_rsvp_for ? '' : ' selected'}>— none —</option>
          ${guestOptions(g.id, g.can_also_rsvp_for)}
        </select>
      </td>
      <td>
        <select form="save-all" name="g[r${g.id}][attending]">${attendingOptions(g.attending)}</select>
      </td>
      <td>
        <select form="save-all" name="g[r${g.id}][friday_invite]">${fridayInviteOptions(g.friday_invite)}</select>
      </td>
      <td>
        <select form="save-all" name="g[r${g.id}][friday_attending]">${attendingOptions(g.friday_attending)}</select>
      </td>
      <td class="actions">
        <button form="del-${g.id}" type="submit" class="icon-btn delete" title="Delete ${escapeHtml(g.full_name)}"
          onclick="return confirm('Delete ${escapeHtml(g.full_name)}?')">${trash}</button>
      </td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Guest Admin</title>
      <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='goldGrad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23d4af37;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23f4e4bc;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='45' fill='url(%23goldGrad)'/%3E%3Ctext x='50' y='50' text-anchor='middle' dominant-baseline='central' font-family='serif' font-size='52' font-weight='bold' fill='%234a2c00'%3EA%3C/text%3E%3C/svg%3E">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; background: #f9f9f9; color: #333; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        h2 { font-size: 18px; margin-bottom: 12px; margin-top: 32px; }
        .count { font-size: 14px; color: #888; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        th { background: #333; color: white; text-align: left; padding: 12px 16px; font-size: 13px; font-weight: 500; }
        td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; color: #444; vertical-align: middle; }
        tr:last-child td { border-bottom: none; }
        td input, td select { padding: 6px 8px; font-size: 13px; border: 1px solid #ddd; border-radius: 4px; outline: none; width: 100%; background: white; }
        td input:focus, td select:focus { border-color: #999; }
        td.actions { white-space: nowrap; display: flex; gap: 6px; }
        .empty { text-align: center; padding: 40px; color: #aaa; font-size: 14px; }
        form.bulk { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); display: flex; flex-direction: column; gap: 12px; }
        form.bulk label { font-size: 12px; color: #666; }
        form.bulk textarea { padding: 10px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; border: 1px solid #ddd; border-radius: 4px; outline: none; min-height: 140px; resize: vertical; }
        form.bulk textarea:focus { border-color: #999; }
        button { padding: 6px 12px; font-size: 13px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; align-self: flex-start; }
        button:hover { background: #555; }
        button.icon-btn { background: transparent; color: #888; padding: 4px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; }
        button.icon-btn:hover { background: #fbe9e7; color: #c62828; }
        .save-bar { position: sticky; bottom: 0; background: #f9f9f9; padding: 16px 0; margin-top: 16px; display: flex; justify-content: flex-end; }
        .save-bar button { padding: 10px 20px; font-size: 14px; }
        .top-bar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
        .top-actions { display: flex; gap: 8px; align-self: center; }
        .export-btn { padding: 8px 14px; font-size: 13px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; white-space: nowrap; }
        .export-btn:hover { background: #555; }
        .rsvp-toggle { padding: 8px 14px; font-size: 13px; border-radius: 4px; cursor: pointer; white-space: nowrap; border: 1px solid #ccc; background: white; color: #666; }
        .rsvp-toggle.on { background: #e6f4ea; color: #2e7d32; border-color: #a5d6a7; }
        .rsvp-toggle:hover { opacity: 0.85; }
      </style>
    </head>
    <body>
      ${saveForm}
      ${deleteForms}
      <div class="top-bar">
        <div>
          <h1>Guest Admin</h1>
          <div class="count">${guests.length} guest${guests.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="top-actions">
          <form method="POST" action="/admin/settings/rsvp-toggle">
            <button type="submit" class="rsvp-toggle${rsvpEnabled ? ' on' : ''}">
              RSVP ${rsvpEnabled ? 'Visible' : 'Hidden'}
            </button>
          </form>
          <a href="/admin/export.csv" class="export-btn">Export CSV</a>
        </div>
      </div>

      <h2>Bulk Add (CSV)</h2>
      <form class="bulk" method="POST" action="/admin/guests/bulk">
        <label>One guest per line: <code>Full Name, email, friday</code> — email and friday optional; use <code>yes</code> to invite to the welcome party</label>
        <textarea name="csv" placeholder="Jane Doe, jane@example.com, yes&#10;John Smith, john@example.com&#10;Mary Anne Smith,"></textarea>
        <button type="submit">Add Guests</button>
      </form>

      <h2>Guests</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Full Name</th>
            <th>Email</th>
            <th>Dietary</th>
            <th>Can Also RSVP For</th>
            <th>Attending</th>
            <th>Fri Invite</th>
            <th>Fri RSVP</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" class="empty">No guests yet</td></tr>'}
        </tbody>
      </table>

      ${guests.length ? '<div class="save-bar"><button form="save-all" type="submit">Save All Changes</button></div>' : ''}

      <script>
        const linkSelects = document.querySelectorAll('select[name$="[can_also_rsvp_for]"]');
        const prev = new Map();
        const findSel = (rowId) => document.querySelector('select[name="g[r' + rowId + '][can_also_rsvp_for]"]');
        const rowIdOf = (sel) => sel.name.match(/g\\[r(\\d+)\\]/)[1];

        linkSelects.forEach(sel => {
          prev.set(sel, sel.value);
          sel.addEventListener('change', () => {
            const rowId = rowIdOf(sel);
            const oldVal = prev.get(sel);
            const newVal = sel.value;

            if (oldVal) {
              const oldPartner = findSel(oldVal);
              if (oldPartner && oldPartner.value === rowId) {
                oldPartner.value = '';
                prev.set(oldPartner, '');
              }
            }
            if (newVal) {
              const newPartner = findSel(newVal);
              if (newPartner) {
                const displaced = newPartner.value;
                if (displaced && displaced !== rowId) {
                  const displacedSel = findSel(displaced);
                  if (displacedSel) {
                    displacedSel.value = '';
                    prev.set(displacedSel, '');
                  }
                }
                newPartner.value = rowId;
                prev.set(newPartner, rowId);
              }
            }
            prev.set(sel, newVal);
          });
        });
      </script>
    </body>
    </html>
  `);
}));

app.get('/admin/export.csv', requireAdmin, ah(async (req, res) => {
  const guests = (await db.all('SELECT * FROM rsvp')).sort((a, b) =>
    a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
  );
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = 'id,full_name,email,dietary_restrictions,can_also_rsvp_for,attending,friday_invite,friday_attending,created_at';
  const rows = guests.map(g =>
    [g.id, g.full_name, g.email, g.dietary_restrictions, g.can_also_rsvp_for, g.attending, g.friday_invite, g.friday_attending, g.created_at]
      .map(escape).join(',')
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="guests.csv"');
  res.send([header, ...rows].join('\n'));
}));

app.post('/admin/guests/bulk', requireAdmin, ah(async (req, res) => {
  const rows = parseCsv(req.body.csv || '');
  const existing = await db.all('SELECT full_name FROM rsvp');
  const seen = new Set(existing.map(g => g.full_name.toLowerCase().trim()));
  await db.transaction(async (tx) => {
    for (const { full_name, email, friday_invite } of rows) {
      const key = full_name.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      await tx.run(
        `INSERT INTO rsvp (full_name, email, friday_invite) VALUES (?, ?, ?)`,
        [full_name, email || null, friday_invite ? 1 : 0]
      );
    }
  });
  res.redirect('/admin');
}));

app.post('/admin/guests/save', requireAdmin, ah(async (req, res) => {
  const g = req.body.g || {};
  const existingRows = await db.all('SELECT id FROM rsvp');
  const existingIds = new Set(existingRows.map(r => r.id));
  const validLink = (v) => {
    if (!v) return null;
    const n = Number(v);
    return existingIds.has(n) ? n : null;
  };
  const stripPrefix = (key) => key.startsWith('r') ? key.slice(1) : key;
  const entries = Object.entries(g).map(([k, v]) => [stripPrefix(k), v]);
  await db.transaction(async (tx) => {
    for (const [id, fields] of entries) {
      if (!fields.full_name) continue;
      if (!existingIds.has(Number(id))) continue;
      await tx.run(
        `UPDATE rsvp SET full_name = ?, email = ?, dietary_restrictions = ?, can_also_rsvp_for = ?, attending = ?, friday_invite = ?, friday_attending = ? WHERE id = ?`,
        [
          fields.full_name.trim(),
          fields.email?.trim() || null,
          fields.dietary_restrictions?.trim() || null,
          validLink(fields.can_also_rsvp_for),
          fields.attending === '' || fields.attending == null ? null : Number(fields.attending),
          fields.friday_invite === '1' ? 1 : 0,
          fields.friday_attending === '' || fields.friday_attending == null ? null : Number(fields.friday_attending),
          Number(id),
        ]
      );
    }
    // Mirror non-null links so pairings are always symmetric
    for (const [id, fields] of entries) {
      const partnerId = validLink(fields.can_also_rsvp_for);
      if (partnerId && existingIds.has(Number(id))) {
        await tx.run('UPDATE rsvp SET can_also_rsvp_for = ? WHERE id = ?', [Number(id), partnerId]);
      }
    }
  });
  res.redirect('/admin');
}));

app.post('/admin/guests/:id/delete', requireAdmin, ah(async (req, res) => {
  await db.run('DELETE FROM rsvp WHERE id = ?', [Number(req.params.id)]);
  res.redirect('/admin');
}));

// RSVP API
const normalize = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j - 1], dp[j]) + 1;
      prev = tmp;
    }
  }
  return dp[b.length];
};

app.post('/api/rsvp/search', requireAuth, ah(async (req, res) => {
  const query = normalize(req.body.query);
  if (!query) return res.json({ matches: [] });
  const guests = await db.all('SELECT id, full_name, email FROM rsvp');

  const emailMatch = guests.find(g => g.email && normalize(g.email) === query);
  if (emailMatch) {
    return res.json({ matches: [{ id: emailMatch.id, full_name: emailMatch.full_name }] });
  }

  const exact = guests.filter(g => normalize(g.full_name) === query);
  if (exact.length) {
    return res.json({ matches: exact.map(g => ({ id: g.id, full_name: g.full_name })) });
  }

  const fuzzy = guests
    .map(g => ({ g, d: levenshtein(normalize(g.full_name), query) }))
    .filter(x => x.d <= 2)
    .sort((a, b) => a.d - b.d);

  if (!fuzzy.length) return res.json({ matches: [] });
  const best = fuzzy[0].d;
  return res.json({
    matches: fuzzy.filter(x => x.d === best).map(x => ({ id: x.g.id, full_name: x.g.full_name }))
  });
}));

app.get('/api/rsvp/:id', requireAuth, ah(async (req, res) => {
  const id = Number(req.params.id);
  const primary = await db.get(
    'SELECT id, full_name, dietary_restrictions, attending, can_also_rsvp_for, friday_invite, friday_attending FROM rsvp WHERE id = ?',
    [id]
  );
  if (!primary) return res.status(404).json({ error: 'not found' });
  let linked = null;
  if (primary.can_also_rsvp_for) {
    linked = await db.get(
      'SELECT id, full_name, dietary_restrictions, attending, friday_invite, friday_attending FROM rsvp WHERE id = ?',
      [primary.can_also_rsvp_for]
    );
  }
  res.json({ primary, linked });
}));

app.post('/api/rsvp/submit', requireAuth, ah(async (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries) || !entries.length) {
    return res.status(400).json({ error: 'invalid' });
  }
  await db.transaction(async (tx) => {
    for (const { id, attending, dietary_restrictions, friday_attending } of entries) {
      const a = attending === '' || attending == null ? null : Number(attending);
      const fa = friday_attending === '' || friday_attending == null ? null : Number(friday_attending);
      await tx.run(
        'UPDATE rsvp SET attending = ?, dietary_restrictions = ?, friday_attending = ? WHERE id = ?',
        [a, dietary_restrictions?.trim() || null, fa, Number(id)]
      );
    }
  });
  res.json({ ok: true });
}));

// Logout route (optional, for testing)
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

db.ready
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
