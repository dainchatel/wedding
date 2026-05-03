const Database = require('better-sqlite3');
const path = require('path');

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

module.exports = db;
