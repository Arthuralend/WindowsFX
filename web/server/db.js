/* Monomach: база данных (SQLite, встроенный модуль Node.js 22) */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

function open(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'monomach.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass TEXT NOT NULL,
      created INTEGER NOT NULL,
      last_login INTEGER,
      last_seen INTEGER,
      last_ip TEXT,
      last_ua TEXT,
      logins INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0,
      quota INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      kind TEXT NOT NULL,              -- user | admin
      user_id INTEGER,
      created INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      ip TEXT, ua TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      user_id INTEGER,
      login TEXT,
      ip TEXT, ua TEXT,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS events_user ON events(user_id, ts);
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,              -- webdav | yandex | mailru | gdrive
      label TEXT NOT NULL,
      url TEXT,
      username TEXT,
      secret TEXT,                     -- зашифровано (AES-256-GCM)
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
  `);
  return db;
}

module.exports = { open };
