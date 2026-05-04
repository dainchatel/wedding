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
  });

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

  adapter = {
    ...pgFns(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await fn(pgFns(client));
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
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
