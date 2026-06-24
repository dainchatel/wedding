require('dotenv').config();
const path = require('path');

// Convert SQLite-style ? placeholders to Postgres $1, $2, ... style
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let adapter;
let ready;

if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5,
    min: 1,                             // ask the pool to keep one client established at all times
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    idleTimeoutMillis: 60000,           // hold idle clients open between sparse visits so we reuse them
    connectionTimeoutMillis: 6000,      // bound a cold connect; retries (boot + requests) still fit 30s
    query_timeout: 10000,
    statement_timeout: 10000,
  });

  // The actual cause of the intermittent 500s: on a low-traffic site the pool drains to zero
  // between visitors, so the next request pays full Postgres connection-setup latency — which on
  // Heroku intermittently exceeds connectionTimeoutMillis and throws "Connection terminated".
  // A cheap periodic ping keeps one connection live and warm, so requests reuse it (~80ms) instead
  // of cold-connecting (~5s, or a 10s timeout). unref() so it never holds the process open.
  const keepalive = setInterval(() => {
    pool.query('SELECT 1').catch((err) => console.error('keepalive ping failed:', err.message));
  }, 50000);
  keepalive.unref();

  // An idle client can error in the background (network blip, backend restart). Without a
  // handler on the pool, Node would crash the dyno; log it and let the pool drop the client.
  pool.on('error', (err) => console.error('pg pool error:', err.message));

  const pgFns = (client) => ({
    async get(sql, params = []) {
      const { rows } = await client.query(toPositional(sql), params);
      return rows[0] ?? null;
    },
    async all(sql, params = []) {
      const { rows } = await client.query(toPositional(sql), params);
      return rows;
    },
    async run(sql, params = []) {
      await client.query(toPositional(sql), params);
    },
    async exec(sql) {
      await client.query(sql);
    },
  });

  // Heroku recycles idle Postgres connections and cold connects can briefly exceed
  // connectionTimeoutMillis. These failures are transient and safe to retry, because no
  // statement has been sent yet — so a second attempt usually lands on a warm/fresh client.
  const isTransient = (err) => {
    const m = (err && err.message) || '';
    return /Connection terminated|connection timeout|timeout exceeded|ECONNRESET|ETIMEDOUT|terminating connection|Client has encountered a connection error/i.test(m);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function withRetry(fn, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!isTransient(err) || i === attempts - 1) throw err;
        await sleep(150 * (i + 1));
      }
    }
    throw lastErr;
  }

  // Reads/writes go through pool.query, which acquires AND releases a connection
  // automatically — no manual checkout to leak. Each is wrapped in withRetry so a single
  // dropped/cold connection becomes a quick retry instead of a 500. Transactions get one
  // dedicated client; we retry only the checkout, never the in-flight statements.
  const poolQuery = (sql, params) => withRetry(() => pool.query(toPositional(sql), params));
  adapter = {
    async get(sql, params = []) {
      const { rows } = await poolQuery(sql, params);
      return rows[0] ?? null;
    },
    async all(sql, params = []) {
      const { rows } = await poolQuery(sql, params);
      return rows;
    },
    async run(sql, params = []) {
      await poolQuery(sql, params);
    },
    async exec(sql) {
      await withRetry(() => pool.query(sql));
    },
    async transaction(fn) {
      const client = await withRetry(() => pool.connect());
      try {
        await client.query('BEGIN');
        await fn(pgFns(client));
        await client.query('COMMIT');
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* connection may be dead */ }
        throw e;
      } finally {
        client.release();
      }
    },
  };

  // Schema setup is retried and NON-FATAL. A transient DB blip at boot must never crash the
  // dyno — that turns a brief Postgres hiccup into a whole-site crash-loop (H10). The guest page
  // needs no DB, so the server boots regardless (see server.js); this only ensures the schema
  // exists for RSVP writes once Postgres is reachable. Every statement is idempotent, so retrying
  // — and re-running on the next boot if it fails — is safe.
  ready = withRetry(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rsvp (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT,
        dietary_restrictions TEXT,
        can_also_rsvp_for INTEGER REFERENCES rsvp(id) ON DELETE SET NULL,
        attending INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        friday_invite INTEGER NOT NULL DEFAULT 0,
        friday_attending INTEGER
      )
    `);
    await pool.query(`ALTER TABLE rsvp ADD COLUMN IF NOT EXISTS friday_invite INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE rsvp ADD COLUMN IF NOT EXISTS friday_attending INTEGER`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await pool.query(`INSERT INTO settings (key, value) VALUES ('rsvp_enabled', '0') ON CONFLICT DO NOTHING`);
    await pool.query(`INSERT INTO settings (key, value) VALUES ('gifts_enabled', '0') ON CONFLICT DO NOTHING`);
    await pool.query(`INSERT INTO settings (key, value) VALUES ('hotel_enabled', '0') ON CONFLICT DO NOTHING`);
  }).catch((err) => {
    console.error('DB schema init failed (continuing; site does not depend on it):', err.message);
  });
} else {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, 'wedding.db'));

  db.exec(`
    CREATE TABLE IF NOT EXISTS rsvp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT,
      dietary_restrictions TEXT,
      can_also_rsvp_for INTEGER REFERENCES rsvp(id) ON DELETE SET NULL,
      attending INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try { db.exec(`ALTER TABLE rsvp ADD COLUMN friday_invite INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE rsvp ADD COLUMN friday_attending INTEGER`); } catch {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('rsvp_enabled', '0')`).run();
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('gifts_enabled', '0')`).run();
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('hotel_enabled', '0')`).run();

  const sqliteFns = () => ({
    async get(sql, params = []) {
      return db.prepare(sql).get(params) ?? null;
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(params);
    },
    async run(sql, params = []) {
      return db.prepare(sql).run(params);
    },
    async exec(sql) {
      db.exec(sql);
    },
  });

  adapter = {
    ...sqliteFns(),
    async transaction(fn) {
      db.exec('BEGIN');
      try {
        await fn(sqliteFns());
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };

  ready = Promise.resolve();
}

module.exports = { ...adapter, ready };
