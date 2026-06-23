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
    max: 10,
    // --- Prevent stale/half-dead idle connections (the cause of the 30s H12) ---
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000, // start TCP keepalive probes after 10s idle.
                                        // (Default 0 = OS default ≈ 2h, i.e. useless for detecting dead peers.)
    idleTimeoutMillis: 10000,           // close idle clients quickly so we rarely reuse a stale one
    maxLifetimeSeconds: 300,            // force-rotate any connection older than 5 minutes
    // --- Bound every wait so a stall fails fast instead of hanging to Heroku's 30s router cutoff ---
    connectionTimeoutMillis: 5000,      // acquiring/establishing a connection
    statement_timeout: 7000,            // server-side: cancel a query running >7s
    query_timeout: 7000,                // client-side: abort a query call >7s (fires even on a dead socket)
  });

  // An idle client can error in the background (network partition, backend restart).
  // Without this handler Node would crash the whole dyno; instead we log and let the pool drop it.
  pool.on('error', (err) => console.error('pg pool error:', err.message));

  // Errors meaning "this attempt hit a bad/dead connection" — safe to retry on a fresh client.
  const isTransient = (err) => {
    const code = err && err.code;
    const msg = ((err && err.message) || '').toLowerCase();
    return (
      ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code) ||
      ['08000', '08003', '08006', '08001', '08004', '57P01', '57P02', '57P03'].includes(code) || // pg connection/shutdown classes
      msg.includes('timeout') ||
      msg.includes('connection terminated') ||
      msg.includes('connection ended') ||
      msg.includes('server closed the connection') ||
      msg.includes('terminating connection')
    );
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Acquire a client and run `work`. On a transient connection error, DESTROY that
  // client (release(true)) so the one retry is guaranteed a fresh connection — turning a
  // one-off dead-connection stall into a successful retry instead of a 30s timeout.
  const onFreshClient = async (work) => {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      const client = await pool.connect();
      let poisoned = false;
      try {
        return await work(client);
      } catch (err) {
        lastErr = err;
        poisoned = isTransient(err);
        if (!poisoned || attempt === 1) throw err;
      } finally {
        client.release(poisoned);
      }
      await sleep(150);
    }
    throw lastErr;
  };

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

  // Every operation goes through onFreshClient, so a transient connection failure is
  // retried once on a healthy connection. All app queries are idempotent on retry
  // (reads; single-value setting/RSVP UPDATEs; guarded INSERTs), so this is safe.
  adapter = {
    get: (sql, params) => onFreshClient((c) => pgFns(c).get(sql, params)),
    all: (sql, params) => onFreshClient((c) => pgFns(c).all(sql, params)),
    run: (sql, params) => onFreshClient((c) => pgFns(c).run(sql, params)),
    exec: (sql) => onFreshClient((c) => pgFns(c).exec(sql)),
    transaction: (fn) => onFreshClient(async (client) => {
      try {
        await client.query('BEGIN');
        await fn(pgFns(client));
        await client.query('COMMIT');
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* connection may be dead; ignore */ }
        throw e;
      }
    }),
  };

  ready = (async () => {
    await pool.query(`DROP TABLE IF EXISTS rsvps`);
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
  })();
} else {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, 'wedding.db'));

  db.exec(`DROP TABLE IF EXISTS rsvps`);
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
