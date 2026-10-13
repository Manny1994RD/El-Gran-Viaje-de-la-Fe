// Game rules: claims, approvals, points ledger, world counters and unlocks.
// Everything that changes points runs inside one IMMEDIATE transaction, so
// double submits and simultaneous approvals cannot count twice.
import { getSettings, tx, audit } from './db.js';
import { levelFor, LEVELS, pathsOf } from './catalog.js';
import { challengeStatus } from './challenge.js';

export class AppError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}
const fail = (code, detail, status = 400) => { throw new AppError(status, code, detail); };

export const today = () => new Date().toISOString().slice(0, 10);

// Monday of the week (YYYY-MM-DD) for a YYYY-MM-DD date.
export function weekOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function parseDef(row) {
  return row && { ...row, tags: row.tags ? row.tags.split(',') : [] };
}
export const getDef = (db, id) => parseDef(db.prepare('SELECT * FROM mission_defs WHERE id = ?').get(id));

const PII_PATTERNS = [/[^\s@]+@[^\s@]+\.[^\s@]+/, /(?:\+?\d[\d\s().-]{6,}\d)/];
export function containsPII(text) {
  return !!text && PII_PATTERNS.some((re) => re.test(text));
}

export function activeWorld(db) {
  return db.prepare("SELECT * FROM worlds WHERE status = 'active' ORDER BY ord LIMIT 1").get();
}

// ---------- claims ----------
// Daily activities count right away. Missions marked needs_approval (fruit, signatures,
// EduLMS) wait for a coordinator. Points = stars: each participant gets them, and the
// world receives them once per report.

function validateClaimInput(db, user, def, input, claimId = 0) {
  if (!def || !def.active) fail('mission_inactive');
  const settings = getSettings(db);
  if (settings.season_frozen) fail('season_frozen');

  const quantity = Number.parseInt(input.quantity ?? 1, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) fail('bad_quantity');
  if (def.daily_cap != null && quantity > def.daily_cap) fail('daily_cap', { cap: def.daily_cap });

  const performed = String(input.performed_at || today()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performed) || performed > today()) fail('bad_date');

  const note = (input.note ?? '').toString().trim().slice(0, 300);
  if (containsPII(note)) fail('pii');

  if (def.confirm && !input.confirmed) fail('confirm_required');

  const ids = [...new Set((input.participant_ids || []).map(Number).filter((n) => Number.isInteger(n) && n !== user.id))].slice(0, 30);
  for (const pid of ids) {
    const ok = db.prepare(`SELECT 1 FROM users u JOIN characters c ON c.user_id = u.id WHERE u.id = ? AND u.status = 'active'`).get(pid);
    if (!ok) fail('bad_participant');
  }
  if (ids.length + 1 < def.min_participants) fail('min_participants', { min: def.min_participants });

  if (def.daily_cap != null) {
    const used = db.prepare(`SELECT COALESCE(SUM(quantity),0) n FROM claims WHERE user_id = ? AND def_id = ? AND performed_at = ? AND id != ?
        AND status IN ('pending','approved','needs_changes')`).get(user.id, def.id, performed, claimId).n;
    if (used + quantity > def.daily_cap) fail('daily_cap', { cap: def.daily_cap });
  }
  return { quantity, performed, note, ids, settings };
}

export function createClaim(db, user, input) {
  const key = String(input.idempotency_key || '').slice(0, 80);
  if (key.length < 8) fail('bad_idempotency_key');
  return tx(db, () => {
    const existing = db.prepare('SELECT * FROM claims WHERE idempotency_key = ?').get(key);
    if (existing) {
      if (existing.user_id !== user.id) fail('bad_idempotency_key');
      return { claim: existing, duplicate: true };
    }
    const world = activeWorld(db);
    if (!world) fail('no_active_world');
    const def = getDef(db, input.mission_def_id);
    const v = validateClaimInput(db, user, def, input);
    const ruleVersion = Number(v.settings.rule_version || 1);
    const r = db.prepare(`INSERT INTO claims (user_id, def_id, world_id, quantity, points_per_unit, rule_version, status, performed_at,
        note, idempotency_key) VALUES (?,?,?,?,?,?, 'pending', ?,?,?)`)
      .run(user.id, def.id, world.id, v.quantity, def.points, ruleVersion, v.performed, v.note || null, key);
    const claimId = Number(r.lastInsertRowid);
    const ins = db.prepare('INSERT INTO claim_participants (claim_id, user_id) VALUES (?, ?)');
    for (const pid of v.ids) ins.run(claimId, pid);
    db.prepare("INSERT INTO approval_events (claim_id, actor_id, action) VALUES (?, ?, 'submitted')").run(claimId, user.id);
    if (!def.needs_approval) approveInside(db, { id: 0 }, claimId, 'auto');
    return { claim: db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId), duplicate: false };
  });
}

export function resubmitClaim(db, user, claimId, input) {
  return tx(db, () => {
    const c = db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);
    if (!c || c.user_id !== user.id) fail('not_found', null, 404);
    if (c.status !== 'needs_changes') fail('bad_state');
    const def = getDef(db, c.def_id);
    const v = validateClaimInput(db, user, { ...def, active: 1 }, input, claimId);
    const before = { ...c };
    db.prepare(`UPDATE claims SET quantity = ?, performed_at = ?, note = ?, status = 'pending', updated_at = datetime('now') WHERE id = ?`)
      .run(v.quantity, v.performed, v.note || null, claimId);
    db.prepare('DELETE FROM claim_participants WHERE claim_id = ?').run(claimId);
    const ins = db.prepare('INSERT INTO claim_participants (claim_id, user_id) VALUES (?, ?)');
    for (const pid of v.ids) ins.run(claimId, pid);
    db.prepare("INSERT INTO approval_events (claim_id, actor_id, action) VALUES (?, ?, 'resubmitted')").run(claimId, user.id);
    audit(db, user.id, 'claim', claimId, 'resubmit', before, { quantity: v.quantity, performed_at: v.performed });
    return db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);
  });
}

export function participantsOf(db, claim) {
  const others = db.prepare('SELECT user_id FROM claim_participants WHERE claim_id = ?').all(claim.id).map((r) => r.user_id);
  return [claim.user_id, ...others.filter((id) => id !== claim.user_id)];
}

function approveInside(db, actor, claimId, reason) {
  const c = db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);
  if (!c) fail('not_found', null, 404);
  if (c.status === 'approved') return { claim: c, already: true };
  if (c.status !== 'pending') fail('bad_state');
  const people = participantsOf(db, c);
  const week = weekOf(c.performed_at);
  const full = c.points_per_unit * c.quantity;
  const ins = db.prepare(`INSERT INTO ledger (user_id, claim_id, world_id, amount, scope, kind, week, rule_version, note)
      VALUES (?,?,?,?,?,?,?,?,?)`);
  const result = { stars: full, members: {} };
  for (const uid of people) {
    result.members[uid] = { xp: full, notes: [] };
    if (full > 0) ins.run(uid, c.id, c.world_id, full, 'xp', 'base', week, c.rule_version, null);
  }
  // The world receives the stars once per report, however many took part.
  ins.run(null, c.id, c.world_id, full, 'world', 'stars', week, c.rule_version, null);
  db.prepare(`UPDATE claims SET status = 'approved', coord_message = NULL, result_json = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(result), c.id);
  db.prepare("INSERT INTO approval_events (claim_id, actor_id, action, reason) VALUES (?, ?, 'approved', ?)").run(c.id, actor.id, reason || null);
  return { claim: db.prepare('SELECT * FROM claims WHERE id = ?').get(c.id), result };
}

export function approveClaim(db, actor, claimId, reason) {
  return tx(db, () => approveInside(db, actor, claimId, reason));
}

export function rejectClaim(db, actor, claimId, reason) {
  if (!reason || !String(reason).trim()) fail('reason_required');
  return tx(db, () => {
    const c = db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);
    if (!c) fail('not_found', null, 404);
    if (c.status !== 'pending') fail('bad_state');
    db.prepare(`UPDATE claims SET status = 'rejected', coord_message = ?, updated_at = datetime('now') WHERE id = ?`).run(String(reason).slice(0, 300), claimId);
    db.prepare("INSERT INTO approval_events (claim_id, actor_id, action, reason) VALUES (?, ?, 'rejected', ?)").run(claimId, actor.id, reason);
    return db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);
  });
}

export function requestChange(db, actor, claimId, message) {
  if (!message || !String(message).trim()) fail('reason_required');
  return tx(db, () => {
    const c = db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);
    if (!c) fail('not_found', null, 404);
    if (c.status !== 'pending') fail('bad_state');
    db.prepare(`UPDATE claims SET status = 'needs_changes', coord_message = ?, updated_at = datetime('now') WHERE id = ?`).run(String(message).slice(0, 300), claimId);
    db.prepare("INSERT INTO approval_events (claim_id, actor_id, action, reason) VALUES (?, ?, 'needs_changes', ?)").run(claimId, actor.id, message);
    return db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);
  });
}

// Admin correction of an approved claim: append opposite entries, never edit or delete.
export function voidClaim(db, actor, claimId, reason) {
  if (!reason || !String(reason).trim()) fail('reason_required');
  return tx(db, () => {
    const c = db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);
    if (!c) fail('not_found', null, 404);
    if (c.status !== 'approved') fail('bad_state');
    const rows = db.prepare("SELECT * FROM ledger WHERE claim_id = ? AND kind NOT LIKE 'offset%'").all(claimId);
    const ins = db.prepare(`INSERT INTO ledger (user_id, claim_id, world_id, amount, scope, kind, week, rule_version, note)
        VALUES (?,?,?,?,?,?,?,?,?)`);
    for (const r of rows) ins.run(r.user_id, r.claim_id, r.world_id, -r.amount, r.scope, 'offset_' + r.kind, r.week, r.rule_version, String(reason).slice(0, 300));
    db.prepare(`UPDATE claims SET status = 'voided', coord_message = ?, updated_at = datetime('now') WHERE id = ?`).run(String(reason).slice(0, 300), claimId);
    db.prepare("INSERT INTO approval_events (claim_id, actor_id, action, reason) VALUES (?, ?, 'voided', ?)").run(claimId, actor.id, reason);
    audit(db, actor.id, 'claim', claimId, 'void', { status: 'approved' }, { status: 'voided', reason });
    const w = db.prepare('SELECT status FROM worlds WHERE id = ?').get(c.world_id);
    return { claim: db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId), unlocked_world_affected: w.status === 'unlocked' };
  });
}

export function adjustPoints(db, actor, { user_id, world_id, amount, reason }) {
  amount = Number.parseInt(amount, 10);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000) fail('bad_quantity');
  if (!reason || !String(reason).trim()) fail('reason_required');
  if (!user_id && !world_id) fail('bad_target');
  return tx(db, () => {
    const week = weekOf(today());
    const scope = user_id ? 'xp' : 'world';
    if (world_id && !db.prepare('SELECT 1 FROM worlds WHERE id = ?').get(world_id)) fail('not_found', null, 404);
    if (user_id && !db.prepare('SELECT 1 FROM users WHERE id = ?').get(user_id)) fail('not_found', null, 404);
    const r = db.prepare(`INSERT INTO ledger (user_id, claim_id, world_id, amount, scope, kind, week, note) VALUES (?, NULL, ?, ?, ?, 'adjustment', ?, ?)`)
      .run(user_id || null, world_id || null, amount, scope, week, String(reason).slice(0, 300));
    audit(db, actor.id, 'ledger', Number(r.lastInsertRowid), 'adjust', null, { user_id, world_id, amount, reason });
    return { id: Number(r.lastInsertRowid) };
  });
}

// ---------- worlds ----------

export function worldProgress(db, worldId) {
  const w = db.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
  if (!w) fail('not_found', null, 404);
  const stars = db.prepare("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE scope = 'world' AND world_id = ?").get(worldId).n;
  const claims = db.prepare("SELECT d.*, c.id AS cid, c.user_id AS uid FROM claims c JOIN mission_defs d ON d.id = c.def_id WHERE c.world_id = ? AND c.status = 'approved'")
    .all(worldId).map((r) => ({ ...parseDef(r), claim_id: r.cid, user_id: r.uid }));
  const people = (list) => {
    const s = new Set();
    for (const c of list) {
      s.add(c.user_id);
      for (const p of db.prepare('SELECT user_id FROM claim_participants WHERE claim_id = ?').all(c.claim_id)) s.add(p.user_id);
    }
    return s.size;
  };
  let tagCount;
  let distinct;
  let paths = null;
  if (w.tag === 'five_paths') {
    const covered = new Set(claims.flatMap((c) => pathsOf(c)));
    paths = ['knowledge', 'encouragement', 'service', 'preaching', 'unity'].map((p) => ({ path: p, done: covered.has(p) }));
    tagCount = covered.size;
    distinct = people(claims);
  } else {
    const tagged = claims.filter((c) => c.tags.includes(w.tag));
    tagCount = tagged.length;
    distinct = people(tagged);
  }
  const prev = db.prepare('SELECT status FROM worlds WHERE ord = ?').get(w.ord - 1);
  // Worlds with a challenge open with stars + challenge; the older obstacle rules apply otherwise.
  const challenge = challengeStatus(db, w);
  const checks = challenge
    ? { stars: stars >= w.star_target, challenge: challenge.complete, previous: !prev || prev.status === 'unlocked' }
    : {
      stars: stars >= w.star_target,
      obstacle: tagCount >= w.tag_target,
      distinct: distinct >= w.distinct_min,
      previous: !prev || prev.status === 'unlocked',
    };
  const eligible = w.status === 'active' && Object.values(checks).every(Boolean);
  const pending = db.prepare("SELECT COUNT(*) n FROM claims WHERE world_id = ? AND status = 'pending'").get(worldId).n;
  return { world: w, stars, tag_count: tagCount, distinct, paths, checks, eligible, pending_claims: pending,
    approved_claims: claims.length, challenge };
}

export function unlockWorld(db, actor, worldId) {
  return tx(db, () => {
    const p = worldProgress(db, worldId);
    if (p.world.status === 'unlocked') fail('already_unlocked');
    if (!p.eligible) fail('not_eligible', p.checks);
    const snapshot = JSON.stringify({ stars: p.stars, tag_count: p.tag_count, distinct: p.distinct, paths: p.paths, challenge: p.challenge, at: new Date().toISOString() });
    db.prepare('INSERT INTO world_unlocks (world_id, confirmed_by, snapshot) VALUES (?, ?, ?)').run(worldId, actor.id, snapshot);
    db.prepare("UPDATE worlds SET status = 'unlocked', unlocked_at = datetime('now') WHERE id = ?").run(worldId);
    const next = db.prepare('SELECT * FROM worlds WHERE ord = ?').get(p.world.ord + 1);
    if (next) db.prepare("UPDATE worlds SET status = 'active', activated_at = datetime('now') WHERE id = ?").run(next.id);
    db.prepare("INSERT OR IGNORE INTO rewards (user_id, world_id, reward_type, source_id) VALUES (0, ?, 'key', ?)").run(worldId, 'unlock:' + worldId);
    db.prepare('INSERT INTO news (title, body, actor_id) VALUES (?, ?, ?)').run(
      `🔑 ${p.world.key_es} / ${p.world.key_en}`,
      next ? `${p.world.name_es} ✔ → ${next.name_es}` : '🎉 ¡Victoria compartida! / Shared victory!', actor.id);
    audit(db, actor.id, 'world', worldId, 'unlock', { status: 'active' }, { status: 'unlocked', next: next?.id ?? null });
    return { unlocked: worldId, next: next?.id ?? null };
  });
}

// ---------- people ----------

export function userStats(db, userId) {
  const xp = db.prepare("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE scope = 'xp' AND user_id = ?").get(userId).n;
  const pendingRows = db.prepare(`SELECT c.points_per_unit * c.quantity n FROM claims c
      WHERE c.status = 'pending' AND (c.user_id = ? OR c.id IN (SELECT claim_id FROM claim_participants WHERE user_id = ?))`).all(userId, userId);
  const lvl = levelFor(xp);
  const next = LEVELS.find((l) => l.level === lvl.level + 1) || null;
  const todayStars = db.prepare(`SELECT COALESCE(SUM(l.amount),0) n FROM ledger l JOIN claims c ON c.id = l.claim_id
      WHERE l.scope = 'xp' AND l.user_id = ? AND c.performed_at = ?`).get(userId, today()).n;
  const byCat = db.prepare(`SELECT d.category, COUNT(*) n FROM claims c JOIN mission_defs d ON d.id = c.def_id
      WHERE c.status = 'approved' AND (c.user_id = ? OR c.id IN (SELECT claim_id FROM claim_participants WHERE user_id = ?)) GROUP BY d.category`).all(userId, userId);
  return {
    xp, pending_xp: pendingRows.reduce((a, r) => a + r.n, 0), level: lvl.level, next_level_xp: next?.min_xp ?? null, level_min_xp: lvl.min_xp,
    today_stars: todayStars,
    unlocked_cosmetics: LEVELS.filter((l) => xp >= l.min_xp).map((l) => l.cosmetic),
    contributions: Object.fromEntries(byCat.map((r) => [r.category, r.n])),
  };
}

// Recent group activity for the home screen (aliases and missions only).
export function groupFeed(db, limit = 12) {
  return db.prepare(`SELECT c.id, c.user_id, u.alias, c.def_id, d.name_es, d.name_en, d.category, c.quantity, c.points_per_unit, c.performed_at, c.updated_at,
      (SELECT COUNT(*) FROM claim_participants p WHERE p.claim_id = c.id) others
      FROM claims c JOIN users u ON u.id = c.user_id JOIN mission_defs d ON d.id = c.def_id
      WHERE c.status = 'approved' ORDER BY c.updated_at DESC, c.id DESC LIMIT ?`).all(limit);
}

export function groupStats(db) {
  const members = db.prepare("SELECT COUNT(*) n FROM users u JOIN characters c ON c.user_id = u.id WHERE u.status = 'active'").get().n;
  const stars = db.prepare("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE scope = 'world'").get().n;
  const byCat = db.prepare(`SELECT d.category, COUNT(*) n, SUM(c.quantity) q FROM claims c JOIN mission_defs d ON d.id = c.def_id
      WHERE c.status = 'approved' GROUP BY d.category`).all();
  const missions = byCat.reduce((a, r) => a + r.n, 0);
  const contributors = db.prepare(`SELECT COUNT(DISTINCT uid) n FROM (SELECT user_id uid FROM claims WHERE status = 'approved'
      UNION SELECT p.user_id FROM claim_participants p JOIN claims c ON c.id = p.claim_id WHERE c.status = 'approved')`).get().n;
  const keys = db.prepare("SELECT COUNT(*) n FROM rewards WHERE reward_type = 'key'").get().n;
  return { members, stars, missions, contributors, keys, by_category: Object.fromEntries(byCat.map((r) => [r.category, r.n])) };
}
