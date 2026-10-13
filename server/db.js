import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SETTINGS, WORLDS, MISSIONS, CLASSES, CHALLENGES, ACTIVE_MISSIONS } from './catalog.js';

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, alias TEXT NOT NULL UNIQUE COLLATE NOCASE, pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('member','coordinator','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  lang TEXT NOT NULL DEFAULT 'es', consent_at TEXT, joined_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY, role TEXT NOT NULL, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  uses_left INTEGER NOT NULL DEFAULT 1, expires_at TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings_versions (
  id INTEGER PRIMARY KEY, actor_id INTEGER, changes_json TEXT NOT NULL, at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY, name_es TEXT, name_en TEXT, style_es TEXT, style_en TEXT, tag TEXT, category TEXT,
  ability_es TEXT, ability_en TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), class_id TEXT NOT NULL REFERENCES classes(id),
  look_json TEXT NOT NULL, motto TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT);
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY, ord INTEGER NOT NULL UNIQUE, name_es TEXT, name_en TEXT, star_target INTEGER NOT NULL,
  tag TEXT NOT NULL, tag_target INTEGER NOT NULL, distinct_min INTEGER NOT NULL,
  obstacle_es TEXT, obstacle_en TEXT, rule_es TEXT, rule_en TEXT, key_es TEXT, key_en TEXT, reward_es TEXT, reward_en TEXT,
  story_es TEXT, story_en TEXT, start TEXT, end TEXT,
  status TEXT NOT NULL CHECK (status IN ('locked','active','unlocked')), activated_at TEXT, unlocked_at TEXT);
CREATE TABLE IF NOT EXISTS mission_defs (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, kind TEXT NOT NULL, name_es TEXT, name_en TEXT, freq_es TEXT, freq_en TEXT,
  points INTEGER NOT NULL, tags TEXT NOT NULL, daily_cap INTEGER, min_participants INTEGER NOT NULL DEFAULT 1,
  contact TEXT NOT NULL DEFAULT 'none', confirm INTEGER NOT NULL DEFAULT 0, exempt_cap INTEGER NOT NULL DEFAULT 0,
  reward_scope TEXT, active INTEGER NOT NULL DEFAULT 1, revealed_at TEXT, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS anonymous_contacts (
  id INTEGER PRIMARY KEY, token TEXT NOT NULL UNIQUE, created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), def_id TEXT NOT NULL REFERENCES mission_defs(id),
  world_id TEXT NOT NULL REFERENCES worlds(id), quantity INTEGER NOT NULL CHECK (quantity >= 1),
  points_per_unit INTEGER NOT NULL, rule_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','needs_changes','voided')),
  performed_at TEXT NOT NULL, note TEXT, contact_id INTEGER REFERENCES anonymous_contacts(id), use_ability INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE, coord_message TEXT, result_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT);
CREATE INDEX IF NOT EXISTS claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS claims_world ON claims(world_id, status);
CREATE TABLE IF NOT EXISTS claim_participants (
  claim_id INTEGER NOT NULL REFERENCES claims(id), user_id INTEGER NOT NULL REFERENCES users(id), UNIQUE (claim_id, user_id));
CREATE TABLE IF NOT EXISTS approval_events (
  id INTEGER PRIMARY KEY, claim_id INTEGER NOT NULL, actor_id INTEGER NOT NULL, action TEXT NOT NULL, reason TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now')));
-- scope: xp (personal) or world (group stars). Append-only; corrections are offset rows.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY, user_id INTEGER, claim_id INTEGER, world_id TEXT, amount INTEGER NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('xp','world')), kind TEXT NOT NULL, week TEXT, rule_version INTEGER, note TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE UNIQUE INDEX IF NOT EXISTS ledger_once ON ledger(claim_id, ifnull(user_id, 0), scope, kind) WHERE claim_id IS NOT NULL AND kind NOT LIKE 'offset%';
CREATE TABLE IF NOT EXISTS world_unlocks (
  world_id TEXT PRIMARY KEY REFERENCES worlds(id), confirmed_by INTEGER NOT NULL, confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
  snapshot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rewards (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 0, world_id TEXT, reward_type TEXT NOT NULL, source_id TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (source_id, reward_type, user_id));
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT, card_id TEXT, actor_id INTEGER, at TEXT NOT NULL DEFAULT (datetime('now')));
-- Pair challenges: one pair per member per world; user_c makes a trio.
CREATE TABLE IF NOT EXISTS pairs (
  id INTEGER PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id), user_a INTEGER NOT NULL REFERENCES users(id),
  user_b INTEGER NOT NULL REFERENCES users(id), user_c INTEGER REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','active','cancelled')), needs_support INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT);
CREATE INDEX IF NOT EXISTS pairs_world ON pairs(world_id, status);
CREATE TABLE IF NOT EXISTS pair_progress (
  id INTEGER PRIMARY KEY, pair_id INTEGER NOT NULL REFERENCES pairs(id), item_key TEXT NOT NULL, amount INTEGER NOT NULL,
  done_at TEXT NOT NULL, actor_id INTEGER NOT NULL, removed_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS pair_prayers (
  pair_id INTEGER NOT NULL REFERENCES pairs(id), user_id INTEGER NOT NULL REFERENCES users(id), UNIQUE (pair_id, user_id));
CREATE TABLE IF NOT EXISTS excusals (
  world_id TEXT NOT NULL, user_id INTEGER NOT NULL, actor_id INTEGER, reason TEXT, at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (world_id, user_id));
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, actor_id INTEGER, entity TEXT NOT NULL, entity_id TEXT, action TEXT NOT NULL,
  old_json TEXT, new_json TEXT, at TEXT NOT NULL DEFAULT (datetime('now')));
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  seed(db);
  migrate(db);
  return db;
}

function seed(db) {
  const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(SETTINGS)) insSetting.run(k, JSON.stringify(v));
  insSetting.run('rule_version', '1');

  const insClass = db.prepare(`INSERT OR IGNORE INTO classes (id,name_es,name_en,style_es,style_en,tag,category,ability_es,ability_en)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  for (const c of CLASSES) insClass.run(c.id, c.name_es, c.name_en, c.style_es, c.style_en, c.tag, c.category ?? null, c.ability_es, c.ability_en);

  const insWorld = db.prepare(`INSERT OR IGNORE INTO worlds (id,ord,name_es,name_en,star_target,tag,tag_target,distinct_min,
    obstacle_es,obstacle_en,rule_es,rule_en,key_es,key_en,reward_es,reward_en,story_es,story_en,start,end,status,activated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const w of WORLDS) {
    const first = w.ord === 1;
    insWorld.run(w.id, w.ord, w.name_es, w.name_en, w.star_target, w.tag, w.tag_target, w.distinct_min, w.obstacle_es, w.obstacle_en,
      w.rule_es, w.rule_en, w.key_es, w.key_en, w.reward_es, w.reward_en, w.story_es, w.story_en, w.start, w.end,
      first ? 'active' : 'locked', first ? new Date().toISOString() : null);
  }

  const insDef = db.prepare(`INSERT OR IGNORE INTO mission_defs (id,category,kind,name_es,name_en,freq_es,freq_en,points,tags,daily_cap,
    min_participants,contact,confirm,exempt_cap,reward_scope) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const d of MISSIONS) insDef.run(d.id, d.category, d.kind, d.name_es, d.name_en, d.freq_es, d.freq_en, d.points, d.tags.join(','),
    d.daily_cap, d.min_participants, d.contact, d.confirm, d.exempt_cap, d.reward_scope ?? null);
}

const hasColumn = (db, table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

// Upgrades an existing database in place; runs once per version.
function migrate(db) {
  const version = Number(db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get()?.value || 1);
  if (version < 2) {
    if (!hasColumn(db, 'users', 'gender')) db.exec("ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IN ('brother','sister'))");
    for (const col of ['challenge_type', 'challenge_json', 'challenge_es', 'challenge_en']) {
      if (!hasColumn(db, 'worlds', col)) db.exec(`ALTER TABLE worlds ADD COLUMN ${col} TEXT`);
    }
    const upd = db.prepare(`UPDATE worlds SET challenge_type = ?, challenge_json = ?, challenge_es = ?, challenge_en = ?,
        star_target = CASE WHEN status = 'unlocked' THEN star_target ELSE ? END WHERE id = ?`);
    for (const [id, c] of Object.entries(CHALLENGES)) {
      const cfg = c.type === 'pair' ? { items: c.items } : { target: c.target };
      upd.run(c.type, JSON.stringify(cfg), c.es, c.en, c.stars, id);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', '2')").run();
  }
  if (version < 3) {
    // Revamp: a short mission list; only milestones need a coordinator; no guest codes.
    if (!hasColumn(db, 'mission_defs', 'needs_approval')) db.exec('ALTER TABLE mission_defs ADD COLUMN needs_approval INTEGER NOT NULL DEFAULT 0');
    const keep = Object.keys(ACTIVE_MISSIONS);
    db.prepare(`UPDATE mission_defs SET active = CASE WHEN id IN (${keep.map(() => '?').join(',')}) THEN 1 ELSE 0 END`).run(...keep);
    const upd = db.prepare('UPDATE mission_defs SET needs_approval = ?, freq_es = ?, freq_en = ? WHERE id = ?');
    for (const [id, m] of Object.entries(ACTIVE_MISSIONS)) upd.run(m.approval ? 1 : 0, m.freq_es, m.freq_en, id);
    db.exec("UPDATE mission_defs SET contact = 'none', daily_cap = NULL WHERE id IN ('PRE04','PRE05')");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', '3')").run();
  }
}

export function getSettings(db) {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = JSON.parse(r.value);
  return out;
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function audit(db, actorId, entity, entityId, action, oldV, newV) {
  db.prepare('INSERT INTO audit_log (actor_id, entity, entity_id, action, old_json, new_json) VALUES (?,?,?,?,?,?)')
    .run(actorId ?? null, entity, entityId == null ? null : String(entityId), action,
      oldV == null ? null : JSON.stringify(oldV), newV == null ? null : JSON.stringify(newV));
}
