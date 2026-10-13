import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { openDb, getSettings, tx, audit } from './db.js';
import { LEVELS, SETTING_TYPES } from './catalog.js';
import * as E from './engine.js';
import * as C from './challenge.js';
import { validateLook, withRewards } from './look.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 8080);
const db = openDb(process.env.DB_PATH || join(ROOT, 'data', 'viaje.db'));
const { AppError } = E;
const fail = (code, status = 400, detail) => { throw new AppError(status, code, detail); };

// ---------- auth helpers ----------

function hashPin(pin) {
  const salt = randomBytes(16);
  return salt.toString('hex') + ':' + scryptSync(pin, salt, 32).toString('hex');
}
function checkPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const a = scryptSync(pin, Buffer.from(salt, 'hex'), 32);
  return timingSafeEqual(a, Buffer.from(hash, 'hex'));
}
const validPin = (pin) => typeof pin === 'string' && /^\d{4,8}$/.test(pin);
const validAlias = (a) => typeof a === 'string' && /^[\p{L}\p{N} ._-]{2,20}$/u.test(a.trim());

function newSession(res, req, userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 86400e3);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires.toISOString());
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${expires.toUTCString()}${secure}`);
}

function currentUser(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ? AND u.status = 'active'`).get(m[1], new Date().toISOString());
  return row ? { ...row, token: m[1] } : null;
}

const RANK = { member: 1, coordinator: 2, admin: 3 };
function need(user, role = 'member') {
  if (!user) fail('unauthorized', 401);
  if (RANK[user.role] < RANK[role]) fail('forbidden', 403);
  return user;
}

// Behind Cloudflare Tunnel / a reverse proxy every request comes from the proxy, so use the forwarded client IP.
const clientIp = (req) => String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress).trim();

const attempts = new Map();
function rateLimit(key, max = 8) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 10 * 60e3);
  if (list.length >= max) fail('too_many_attempts', 429);
  list.push(now);
  attempts.set(key, list);
}

function newCode(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(len)].map((b) => alphabet[b % alphabet.length]).join('');
}

function ensureSetupInvite() {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin' AND status = 'active'").get();
  if (hasAdmin) return;
  let invite = db.prepare("SELECT * FROM invites WHERE role = 'admin' AND uses_left > 0 AND note = 'setup'").get();
  const wanted = (process.env.SETUP_CODE || '').trim().toUpperCase();
  if (wanted && (!invite || invite.code !== wanted)) {
    db.prepare("DELETE FROM invites WHERE note = 'setup'").run();
    db.prepare("INSERT INTO invites (code, role, uses_left, note) VALUES (?, 'admin', 1, 'setup')").run(wanted);
    invite = { code: wanted };
  } else if (!invite) {
    invite = { code: newCode(10) };
    db.prepare("INSERT INTO invites (code, role, uses_left, note) VALUES (?, 'admin', 1, 'setup')").run(invite.code);
  }
  console.log('\n==================================================');
  console.log(' El Gran Viaje de la Fe: first-time setup');
  console.log(` Open the site, choose "Tengo un código" and use: ${invite.code}`);
  console.log(' That account becomes the administrator.');
  console.log('==================================================\n');
}

// ---------- view helpers ----------

const pubUser = (u) => u && { id: u.id, alias: u.alias, role: u.role, lang: u.lang, gender: u.gender ?? null };
const GENDERS = ['brother', 'sister'];

const xpOf = (userId) => db.prepare("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE scope = 'xp' AND user_id = ?").get(userId).n;

function characterOf(userId) {
  const c = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(userId);
  return c && { class_id: c.class_id, look: withRewards(JSON.parse(c.look_json), xpOf(userId)), motto: c.motto };
}

function claimView(c, lang) {
  const def = E.getDef(db, c.def_id);
  const parts = db.prepare('SELECT u.id, u.alias FROM claim_participants p JOIN users u ON u.id = p.user_id WHERE p.claim_id = ?').all(c.id);
  const owner = db.prepare('SELECT alias FROM users WHERE id = ?').get(c.user_id);
  const contact = c.contact_id ? db.prepare('SELECT token FROM anonymous_contacts WHERE id = ?').get(c.contact_id) : null;
  return {
    id: c.id, def_id: c.def_id, mission: def[`name_${lang}`] || def.name_es, category: def.category, kind: def.kind,
    world_id: c.world_id, quantity: c.quantity, points_per_unit: c.points_per_unit, status: c.status,
    performed_at: c.performed_at, note: c.note, use_ability: !!c.use_ability, coord_message: c.coord_message,
    result: c.result_json ? JSON.parse(c.result_json) : null, created_at: c.created_at,
    user: { id: c.user_id, alias: owner?.alias }, participants: parts, contact: contact?.token ?? null, contact_id: c.contact_id,
  };
}

function worldsWithProgress() {
  return db.prepare('SELECT id FROM worlds ORDER BY ord').all().map((w) => E.worldProgress(db, w.id));
}

function csv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

function parseSetting(key, value) {
  const type = SETTING_TYPES[key];
  if (!type) fail('bad_setting');
  if (type === 'integer') {
    const n = Number.parseInt(value, 10);
    if (!Number.isInteger(n) || n < 0 || n > 100000) fail('bad_setting');
    return n;
  }
  if (type === 'bool') return value === true || value === 'true';
  if (type === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('bad_setting'); return value; }
  if (type.startsWith('enum:')) { if (!type.slice(5).split(',').includes(value)) fail('bad_setting'); return value; }
  return String(value).slice(0, 80);
}

// ---------- routes ----------

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/health', () => ({ ok: true }));

route('GET', '/api/bootstrap', ({ user }) => {
  const s = getSettings(db);
  return {
    me: pubUser(user), character: user ? characterOf(user.id) : null,
    settings: { season_name: s.season_name, season_start: s.season_start, season_end: s.season_end, season_frozen: s.season_frozen },
    caps: { base: s.max_personal_base_weekly, bonus: s.max_personal_bonus_weekly },
    classes: db.prepare('SELECT * FROM classes WHERE active = 1').all(),
    levels: LEVELS,
  };
});

route('POST', '/api/auth/redeem', ({ body, req, res }) => {
  rateLimit('redeem:' + clientIp(req), 30);
  const code = String(body.code || '').trim().toUpperCase();
  if (!body.consent) fail('consent_required');
  if (!validAlias(body.alias)) fail('bad_alias');
  if (!validPin(body.pin)) fail('bad_pin');
  if (!GENDERS.includes(body.gender)) fail('gender_missing');
  const lang = body.lang === 'en' ? 'en' : 'es';
  const user = tx(db, () => {
    const inv = db.prepare('SELECT * FROM invites WHERE code = ?').get(code);
    if (!inv || inv.uses_left < 1 || (inv.expires_at && inv.expires_at < new Date().toISOString())) fail('bad_code');
    if (db.prepare('SELECT 1 FROM users WHERE alias = ?').get(body.alias.trim())) fail('alias_taken');
    const r = db.prepare("INSERT INTO users (alias, pin_hash, role, lang, gender, consent_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
      .run(body.alias.trim(), hashPin(body.pin), inv.role, lang, body.gender);
    db.prepare('UPDATE invites SET uses_left = uses_left - 1 WHERE code = ?').run(code);
    audit(db, Number(r.lastInsertRowid), 'user', Number(r.lastInsertRowid), 'join', null, { role: inv.role, invite: code });
    return db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  });
  newSession(res, req, user.id);
  return { me: pubUser(user) };
});

route('POST', '/api/auth/login', ({ body, req, res }) => {
  const alias = String(body.alias || '').trim();
  rateLimit('login:' + alias.toLowerCase() + ':' + clientIp(req));
  const u = db.prepare("SELECT * FROM users WHERE alias = ? AND status = 'active'").get(alias);
  if (!u || !validPin(body.pin) || !checkPin(body.pin, u.pin_hash)) fail('bad_login', 401);
  newSession(res, req, u.id);
  return { me: pubUser(u) };
});

route('POST', '/api/auth/logout', ({ user, res }) => {
  if (user) db.prepare('DELETE FROM sessions WHERE token = ?').run(user.token);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  return { ok: true };
});

route('POST', '/api/me/lang', ({ user, body }) => {
  need(user);
  db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(body.lang === 'en' ? 'en' : 'es', user.id);
  return { ok: true };
});

route('POST', '/api/me/pin', ({ user, body }) => {
  need(user);
  if (!checkPin(String(body.old || ''), user.pin_hash)) fail('bad_login', 401);
  if (!validPin(body.pin)) fail('bad_pin');
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(body.pin), user.id);
  return { ok: true };
});

route('GET', '/api/me', ({ user }) => {
  need(user);
  const keys = db.prepare("SELECT world_id FROM rewards WHERE reward_type = 'key' AND user_id = 0").all().map((r) => r.world_id);
  return { me: pubUser(user), character: characterOf(user.id), stats: E.userStats(db, user.id), keys };
});

function saveCharacter(user, body, create) {
  const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND active = 1').get(body.class_id);
  if (!cls) fail('bad_class');
  const look = validateLook(body.look);
  const motto = String(body.motto || '').trim().slice(0, 60);
  if (E.containsPII(motto)) fail('pii');
  return tx(db, () => {
    const existing = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(user.id);
    if (create && existing) fail('character_exists');
    if (!create && !existing) fail('not_found', 404);
    if (create) {
      db.prepare('INSERT INTO characters (user_id, class_id, look_json, motto) VALUES (?, ?, ?, ?)').run(user.id, cls.id, JSON.stringify(look), motto);
    } else {
      db.prepare("UPDATE characters SET class_id = ?, look_json = ?, motto = ?, updated_at = datetime('now') WHERE user_id = ?")
        .run(cls.id, JSON.stringify(look), motto, user.id);
      if (existing.class_id !== cls.id) audit(db, user.id, 'character', user.id, 'class_change', { class_id: existing.class_id }, { class_id: cls.id });
    }
    return characterOf(user.id);
  });
}
route('POST', '/api/characters', ({ user, body }) => saveCharacter(need(user), body, true));
route('PUT', '/api/characters', ({ user, body }) => saveCharacter(need(user), body, false));

route('GET', '/api/members', ({ user }) => {
  need(user);
  return db.prepare(`SELECT u.id, u.alias, c.class_id, c.look_json FROM users u JOIN characters c ON c.user_id = u.id
      WHERE u.status = 'active' ORDER BY u.alias COLLATE NOCASE`).all()
    .map((r) => ({ id: r.id, alias: r.alias, class_id: r.class_id, look: withRewards(JSON.parse(r.look_json), xpOf(r.id)) }));
});

route('GET', '/api/worlds', ({ user }) => { need(user); return worldsWithProgress(); });
route('GET', '/api/worlds/:id', ({ user, params }) => { need(user); return E.worldProgress(db, params.id); });

route('GET', '/api/missions', ({ user }) => {
  need(user);
  const rows = db.prepare("SELECT * FROM mission_defs WHERE active = 1 AND (kind != 'card' OR revealed_at IS NOT NULL) ORDER BY rowid").all();
  const doneCards = new Set(db.prepare(`SELECT def_id FROM claims WHERE status IN ('pending','approved','needs_changes')
      AND (user_id = ? OR id IN (SELECT claim_id FROM claim_participants WHERE user_id = ?))`).all(user.id, user.id).map((r) => r.def_id));
  const today = E.today();
  const usedToday = Object.fromEntries(db.prepare(`SELECT def_id, SUM(quantity) q FROM claims WHERE user_id = ? AND performed_at = ?
      AND status IN ('pending','approved','needs_changes') GROUP BY def_id`).all(user.id, today).map((r) => [r.def_id, r.q]));
  return rows.map((r) => ({ ...E.parseDef(r), done: r.kind === 'card' && doneCards.has(r.id), used_today: usedToday[r.id] || 0 }));
});

route('GET', '/api/contacts', ({ user }) => E.listContacts(db, need(user).id));
route('POST', '/api/contacts', ({ user }) => E.createContact(db, need(user).id));

route('POST', '/api/claims', ({ user, body, lang }) => {
  need(user);
  if (!characterOf(user.id)) fail('character_required');
  const r = E.createClaim(db, user, body);
  return { duplicate: r.duplicate, claim: claimView(r.claim, lang) };
});
route('PUT', '/api/claims/:id', ({ user, body, params, lang }) => claimView(E.resubmitClaim(db, need(user), Number(params.id), body), lang));

route('GET', '/api/claims/mine', ({ user, lang }) => {
  need(user);
  return db.prepare(`SELECT * FROM claims WHERE user_id = ? OR id IN (SELECT claim_id FROM claim_participants WHERE user_id = ?)
      ORDER BY id DESC LIMIT 200`).all(user.id, user.id).map((c) => claimView(c, lang));
});

route('GET', '/api/news', ({ user }) => {
  need(user);
  return db.prepare('SELECT id, title, body, card_id, at FROM news ORDER BY id DESC LIMIT 50').all();
});

route('GET', '/api/group', ({ user }) => { need(user); return E.groupStats(db); });

// Members who joined before brothers/sisters existed set it once; after that only an admin changes it.
route('POST', '/api/me/gender', ({ user, body }) => {
  need(user);
  if (!GENDERS.includes(body.gender)) fail('gender_missing');
  if (user.gender) fail('forbidden', 403);
  db.prepare('UPDATE users SET gender = ? WHERE id = ?').run(body.gender, user.id);
  return { ok: true };
});

// ----- world challenges -----

route('GET', '/api/challenge/:world', ({ user, params }) => C.board(db, params.world, need(user)));
route('POST', '/api/challenge/:world/request', ({ user, params, body }) => C.requestPartner(db, need(user), params.world, body.partner_id));
route('POST', '/api/pairs/:id/respond', ({ user, params, body }) => C.respondPartner(db, need(user), Number(params.id), !!body.accept));
route('POST', '/api/pairs/:id/progress', ({ user, params, body }) => C.addProgress(db, need(user), Number(params.id), body));
route('DELETE', '/api/progress/:id', ({ user, params }) => C.removeProgress(db, need(user), Number(params.id)));
route('POST', '/api/pairs/:id/support', ({ user, params, body }) => C.setSupport(db, need(user), Number(params.id), !!body.on));
route('POST', '/api/pairs/:id/pray', ({ user, params }) => C.togglePrayer(db, need(user), Number(params.id)));
route('POST', '/api/challenge/:world/pairs', ({ user, params, body }) => C.coordCreatePair(db, need(user, 'coordinator'), params.world, body.ids));
route('POST', '/api/pairs/:id/add', ({ user, params, body }) => C.coordAddToPair(db, need(user, 'coordinator'), Number(params.id), body.user_id));
route('DELETE', '/api/pairs/:id', ({ user, params }) => C.coordDissolvePair(db, need(user, 'coordinator'), Number(params.id)));
route('POST', '/api/challenge/:world/excuse', ({ user, params, body }) =>
  C.setExcused(db, need(user, 'coordinator'), params.world, body.user_id, !!body.excused, body.reason));

// ----- coordinator -----

route('GET', '/api/approvals/queue', ({ user, lang }) => {
  need(user, 'coordinator');
  return db.prepare("SELECT * FROM claims WHERE status = 'pending' ORDER BY id").all().map((c) => {
    const v = claimView(c, lang);
    v.same_day = db.prepare(`SELECT COUNT(*) n FROM claims WHERE user_id = ? AND def_id = ? AND performed_at = ? AND id != ?
        AND status IN ('pending','approved')`).get(c.user_id, c.def_id, c.performed_at, c.id).n;
    return v;
  });
});
route('POST', '/api/claims/:id/approve', ({ user, params, body, lang }) => {
  need(user, 'coordinator');
  const r = E.approveClaim(db, user, Number(params.id), body.reason);
  return { claim: claimView(r.claim, lang), already: !!r.already };
});
route('POST', '/api/claims/:id/reject', ({ user, params, body, lang }) => claimView(E.rejectClaim(db, need(user, 'coordinator'), Number(params.id), body.reason), lang));
route('POST', '/api/claims/:id/request-change', ({ user, params, body, lang }) => claimView(E.requestChange(db, need(user, 'coordinator'), Number(params.id), body.message), lang));
route('POST', '/api/worlds/:id/unlock', ({ user, params }) => E.unlockWorld(db, need(user, 'coordinator'), params.id));

route('GET', '/api/invites', ({ user }) => {
  need(user, 'coordinator');
  return db.prepare(`SELECT i.code, i.role, i.uses_left, i.expires_at, i.created_at, u.alias created_by FROM invites i
      LEFT JOIN users u ON u.id = i.created_by WHERE i.uses_left > 0 AND (i.note IS NULL OR i.note != 'setup') ORDER BY i.created_at DESC`).all();
});
route('POST', '/api/invites', ({ user, body }) => {
  need(user, 'coordinator');
  const role = ['member', 'coordinator', 'admin'].includes(body.role) ? body.role : 'member';
  if (role !== 'member') need(user, 'admin');
  const uses = Math.min(Math.max(Number.parseInt(body.uses, 10) || 1, 1), 100);
  const days = Math.min(Math.max(Number.parseInt(body.days, 10) || 14, 1), 90);
  const code = newCode(8);
  db.prepare('INSERT INTO invites (code, role, created_by, uses_left, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(code, role, user.id, uses, new Date(Date.now() + days * 86400e3).toISOString());
  audit(db, user.id, 'invite', code, 'create', null, { role, uses, days });
  return { code, role, uses_left: uses };
});
route('DELETE', '/api/invites/:code', ({ user, params }) => {
  need(user, 'coordinator');
  db.prepare('UPDATE invites SET uses_left = 0 WHERE code = ?').run(params.code);
  audit(db, user.id, 'invite', params.code, 'revoke', null, null);
  return { ok: true };
});

route('POST', '/api/news', ({ user, body }) => {
  need(user, 'coordinator');
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) fail('title_required');
  const text = String(body.body || '').trim().slice(0, 1000);
  if (E.containsPII(title + ' ' + text)) fail('pii');
  const r = db.prepare('INSERT INTO news (title, body, actor_id) VALUES (?, ?, ?)').run(title, text, user.id);
  return { id: Number(r.lastInsertRowid) };
});

// ----- admin -----

route('GET', '/api/admin/settings', ({ user }) => {
  need(user, 'admin');
  return {
    settings: getSettings(db), types: SETTING_TYPES,
    versions: db.prepare('SELECT v.id, v.changes_json, v.at, u.alias FROM settings_versions v LEFT JOIN users u ON u.id = v.actor_id ORDER BY v.id DESC LIMIT 30').all(),
    missions: db.prepare('SELECT * FROM mission_defs ORDER BY rowid').all().map(E.parseDef),
    worlds: db.prepare('SELECT * FROM worlds ORDER BY ord').all(),
  };
});

function bumpVersion(actor, changes) {
  const v = Number(getSettings(db).rule_version || 1) + 1;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'rule_version'").run(JSON.stringify(v));
  db.prepare('INSERT INTO settings_versions (actor_id, changes_json) VALUES (?, ?)').run(actor.id, JSON.stringify({ version: v, ...changes }));
  return v;
}

route('PUT', '/api/admin/settings', ({ user, body }) => {
  need(user, 'admin');
  const changes = body.changes || {};
  return tx(db, () => {
    const old = getSettings(db);
    const applied = {};
    for (const [k, v] of Object.entries(changes)) {
      const val = parseSetting(k, v);
      if (JSON.stringify(old[k]) === JSON.stringify(val)) continue;
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(val), k);
      applied[k] = { from: old[k], to: val };
    }
    if (!Object.keys(applied).length) return { version: old.rule_version, applied };
    const version = bumpVersion(user, { settings: applied });
    audit(db, user.id, 'settings', null, 'update', null, applied);
    return { version, applied };
  });
});

route('PUT', '/api/admin/missions/:id', ({ user, body, params }) => {
  need(user, 'admin');
  return tx(db, () => {
    const d = db.prepare('SELECT * FROM mission_defs WHERE id = ?').get(params.id);
    if (!d) fail('not_found', 404);
    const points = body.points == null ? d.points : Number.parseInt(body.points, 10);
    if (!Number.isInteger(points) || points < 0 || points > 1000) fail('bad_setting');
    const active = body.active == null ? d.active : (body.active ? 1 : 0);
    let cap = d.daily_cap;
    if (body.daily_cap !== undefined) {
      cap = body.daily_cap === null || body.daily_cap === '' ? null : Number.parseInt(body.daily_cap, 10);
      if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 100)) fail('bad_setting');
    }
    db.prepare('UPDATE mission_defs SET points = ?, active = ?, daily_cap = ?, version = version + 1 WHERE id = ?').run(points, active, cap, d.id);
    const change = { points: [d.points, points], active: [d.active, active], daily_cap: [d.daily_cap, cap] };
    bumpVersion(user, { mission: d.id, ...change });
    audit(db, user.id, 'mission_def', d.id, 'update', { points: d.points, active: d.active, daily_cap: d.daily_cap }, { points, active, daily_cap: cap });
    return E.getDef(db, d.id);
  });
});

route('POST', '/api/admin/cards/:id/reveal', ({ user, params }) => {
  need(user, 'admin');
  return tx(db, () => {
    const d = db.prepare("SELECT * FROM mission_defs WHERE id = ? AND kind = 'card'").get(params.id);
    if (!d) fail('not_found', 404);
    if (d.revealed_at) return { ok: true };
    db.prepare("UPDATE mission_defs SET revealed_at = datetime('now') WHERE id = ?").run(d.id);
    db.prepare('INSERT INTO news (title, body, card_id, actor_id) VALUES (?, ?, ?, ?)').run(`🃏 ${d.name_es} / ${d.name_en}`, `${d.freq_es} · ${d.freq_en}`, d.id, user.id);
    audit(db, user.id, 'card', d.id, 'reveal', null, null);
    return { ok: true };
  });
});

route('PUT', '/api/admin/worlds/:id', ({ user, body, params }) => {
  need(user, 'admin');
  return tx(db, () => {
    const w = db.prepare('SELECT * FROM worlds WHERE id = ?').get(params.id);
    if (!w) fail('not_found', 404);
    if (w.status === 'unlocked') fail('world_closed');
    const next = {};
    for (const k of ['star_target', 'tag_target', 'distinct_min']) {
      const n = body[k] == null ? w[k] : Number.parseInt(body[k], 10);
      if (!Number.isInteger(n) || n < 0 || n > 100000) fail('bad_setting');
      next[k] = n;
    }
    db.prepare('UPDATE worlds SET star_target = ?, tag_target = ?, distinct_min = ? WHERE id = ?').run(next.star_target, next.tag_target, next.distinct_min, w.id);
    const ch = C.challengeOf(w);
    if (ch) {
      const cfg = JSON.parse(w.challenge_json || '{}');
      const num = (v) => { const n = Number.parseInt(v, 10); if (!Number.isInteger(n) || n < 1 || n > 10000) fail('bad_setting'); return n; };
      if (cfg.items) for (const it of cfg.items) if (body.items?.[it.key] != null) it.target = num(body.items[it.key]);
      if (cfg.target != null && body.challenge_target != null) cfg.target = num(body.challenge_target);
      const es = body.challenge_es == null ? w.challenge_es : String(body.challenge_es).trim().slice(0, 300);
      const en = body.challenge_en == null ? w.challenge_en : String(body.challenge_en).trim().slice(0, 300);
      db.prepare('UPDATE worlds SET challenge_json = ?, challenge_es = ?, challenge_en = ? WHERE id = ?').run(JSON.stringify(cfg), es, en, w.id);
      next.challenge = { ...cfg, es, en };
    }
    bumpVersion(user, { world: w.id, ...next });
    audit(db, user.id, 'world', w.id, 'targets', { star_target: w.star_target, tag_target: w.tag_target, distinct_min: w.distinct_min }, next);
    return E.worldProgress(db, w.id);
  });
});

route('GET', '/api/admin/users', ({ user }) => {
  need(user, 'admin');
  return db.prepare(`SELECT u.id, u.alias, u.role, u.status, u.gender, u.joined_at, c.class_id,
      (SELECT COALESCE(SUM(amount),0) FROM ledger l WHERE l.user_id = u.id AND l.scope = 'xp') xp
      FROM users u LEFT JOIN characters c ON c.user_id = u.id ORDER BY u.alias COLLATE NOCASE`).all();
});
route('PUT', '/api/admin/users/:id', ({ user, body, params }) => {
  need(user, 'admin');
  const id = Number(params.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) fail('not_found', 404);
  const role = body.role && RANK[body.role] ? body.role : u.role;
  const status = ['active', 'disabled'].includes(body.status) ? body.status : u.status;
  const gender = GENDERS.includes(body.gender) ? body.gender : u.gender;
  if (id === user.id && (role !== 'admin' || status !== 'active')) fail('cannot_demote_self');
  db.prepare('UPDATE users SET role = ?, status = ?, gender = ? WHERE id = ?').run(role, status, gender, id);
  if (status === 'disabled') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  audit(db, user.id, 'user', id, 'update', { role: u.role, status: u.status, gender: u.gender }, { role, status, gender });
  return { ok: true };
});
route('POST', '/api/admin/users/:id/pin', ({ user, body, params }) => {
  need(user, 'admin');
  if (!validPin(body.pin)) fail('bad_pin');
  const id = Number(params.id);
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(body.pin), id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  audit(db, user.id, 'user', id, 'reset_pin', null, null);
  return { ok: true };
});

route('GET', '/api/admin/claims', ({ user, query, lang }) => {
  need(user, 'admin');
  const status = query.get('status');
  const rows = status
    ? db.prepare('SELECT * FROM claims WHERE status = ? ORDER BY id DESC LIMIT 300').all(status)
    : db.prepare('SELECT * FROM claims ORDER BY id DESC LIMIT 300').all();
  return rows.map((c) => claimView(c, lang));
});
route('POST', '/api/admin/claims/:id/void', ({ user, body, params, lang }) => {
  const r = E.voidClaim(db, need(user, 'admin'), Number(params.id), body.reason);
  return { claim: claimView(r.claim, lang), unlocked_world_affected: r.unlocked_world_affected };
});
route('POST', '/api/admin/adjust', ({ user, body }) => E.adjustPoints(db, need(user, 'admin'), body));

route('GET', '/api/admin/audit', ({ user }) => {
  need(user, 'admin');
  return db.prepare(`SELECT a.*, u.alias actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 300`).all();
});

const EXPORTS = {
  claims: `SELECT c.id, u.alias, c.def_id, c.world_id, c.quantity, c.points_per_unit, c.status, c.performed_at, c.use_ability,
      (SELECT group_concat(pu.alias, ' ') FROM claim_participants p JOIN users pu ON pu.id = p.user_id WHERE p.claim_id = c.id) participants,
      (SELECT token FROM anonymous_contacts a WHERE a.id = c.contact_id) contact, c.rule_version, c.created_at
      FROM claims c JOIN users u ON u.id = c.user_id ORDER BY c.id`,
  ledger: `SELECT l.id, u.alias, l.claim_id, l.world_id, l.amount, l.scope, l.kind, l.week, l.rule_version, l.note, l.at
      FROM ledger l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id`,
  members: `SELECT u.alias, u.role, u.status, u.joined_at, c.class_id,
      (SELECT COALESCE(SUM(amount),0) FROM ledger l WHERE l.user_id = u.id AND l.scope = 'xp') xp
      FROM users u LEFT JOIN characters c ON c.user_id = u.id ORDER BY u.alias`,
  worlds: `SELECT w.id, w.name_es, w.status, w.star_target, w.tag_target, w.distinct_min, w.unlocked_at, k.snapshot
      FROM worlds w LEFT JOIN world_unlocks k ON k.world_id = w.id ORDER BY w.ord`,
  audit: `SELECT a.id, u.alias actor, a.entity, a.entity_id, a.action, a.old_json, a.new_json, a.at FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id`,
};
route('GET', '/api/exports/:name', ({ user, params, res }) => {
  need(user, 'admin');
  const name = params.name.replace(/\.csv$/, '');
  if (!EXPORTS[name]) fail('not_found', 404);
  res.setHeader('Content-Disposition', `attachment; filename="viaje-${name}-${E.today()}.csv"`);
  return { __raw: '﻿' + csv(db.prepare(EXPORTS[name]).all()), type: 'text/csv; charset=utf-8' };
});

// Consistent snapshot of the whole database, safe while the game is running.
route('GET', '/api/admin/backup', ({ user }) => {
  need(user, 'admin');
  const tmp = join(tmpdir(), `viaje-backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const data = readFileSync(tmp);
  unlinkSync(tmp);
  audit(db, user.id, 'database', null, 'backup', null, null);
  return { __raw: data, type: 'application/octet-stream', filename: `viaje-backup-${E.today()}.db` };
});

// ---------- http plumbing ----------

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

async function serveStatic(req, res, pathname) {
  let file = normalize(join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(PUBLIC, 'index.html');
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new AppError(413, 'too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  const send = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  try {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) return send(404, { error: 'not_found' });
    let body = {};
    if (req.method !== 'GET') {
      // JSON-only mutations, plus SameSite cookies, block cross-site form posts.
      if (!(req.headers['content-type'] || '').includes('application/json')) fail('json_required', 415);
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    }
    const m = r.re.exec(url.pathname);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const user = currentUser(req);
    const lang = user?.lang === 'en' ? 'en' : 'es';
    const out = await r.handler({ req, res, body, params, query: url.searchParams, user, lang });
    if (out && out.__raw !== undefined) {
      if (out.filename) res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.writeHead(200, { 'Content-Type': out.type, 'Cache-Control': 'no-store' });
      return res.end(out.__raw);
    }
    send(200, out ?? { ok: true });
  } catch (e) {
    if (e instanceof AppError) return send(e.status, { error: e.code, detail: e.detail ?? null });
    if (e instanceof SyntaxError) return send(400, { error: 'bad_json' });
    console.error(e);
    send(500, { error: 'server_error' });
  }
});

ensureSetupInvite();
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString()), 3600e3).unref();
server.listen(PORT, () => console.log(`El Gran Viaje de la Fe listening on http://0.0.0.0:${PORT}`));
