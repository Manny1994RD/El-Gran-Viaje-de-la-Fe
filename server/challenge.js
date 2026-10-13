// World challenges: same-gender pairs (a new partner each world) who log their own progress,
// or a group goal counted from approved fruit milestones. Visible to everyone so the group can pray.
import { tx, audit, getSettings } from './db.js';
import { AppError, weekOf, today } from './engine.js';

const fail = (code, detail, status = 400) => { throw new AppError(status, code, detail); };

export function challengeOf(world) {
  if (!world?.challenge_type) return null;
  const cfg = JSON.parse(world.challenge_json || '{}');
  return { type: world.challenge_type, items: cfg.items || [], target: cfg.target ?? 0, es: world.challenge_es, en: world.challenge_en };
}

const getWorld = (db, id) => db.prepare('SELECT * FROM worlds WHERE id = ?').get(id);
const membersOfPair = (p) => [p.user_a, p.user_b, p.user_c].filter(Boolean);
const isCoord = (u) => u.role === 'coordinator' || u.role === 'admin';

// Players: active users who made a character.
function players(db) {
  return db.prepare(`SELECT u.id, u.alias, u.gender, u.role FROM users u JOIN characters c ON c.user_id = u.id
      WHERE u.status = 'active' ORDER BY u.alias COLLATE NOCASE`).all();
}
const excusedIds = (db, worldId) => new Set(db.prepare('SELECT user_id FROM excusals WHERE world_id = ?').all(worldId).map((r) => r.user_id));
const pairsIn = (db, worldId, statuses = ['active']) =>
  db.prepare(`SELECT * FROM pairs WHERE world_id = ? AND status IN (${statuses.map(() => '?').join(',')}) ORDER BY id`).all(worldId, ...statuses);

function activePairOf(db, worldId, userId) {
  return pairsIn(db, worldId).find((p) => membersOfPair(p).includes(userId)) || null;
}

// Partners from the previous world (they can't pair again right away).
export function previousPartners(db, worldId, userId) {
  const w = getWorld(db, worldId);
  const prev = db.prepare('SELECT id FROM worlds WHERE ord = ?').get(w.ord - 1);
  if (!prev) return new Set();
  const p = activePairOf(db, prev.id, userId);
  return new Set(p ? membersOfPair(p).filter((id) => id !== userId) : []);
}

export function progressOf(db, pairId) {
  const out = {};
  for (const r of db.prepare('SELECT item_key, SUM(amount) n FROM pair_progress WHERE pair_id = ? AND removed_by IS NULL GROUP BY item_key').all(pairId)) out[r.item_key] = r.n;
  return out;
}
const isComplete = (ch, prog) => ch.items.length > 0 && ch.items.every((it) => (prog[it.key] || 0) >= it.target);

function requirePairWorld(db, worldId) {
  const w = getWorld(db, worldId);
  if (!w) fail('not_found', null, 404);
  const ch = challengeOf(w);
  if (!ch || ch.type !== 'pair') fail('not_pair_world');
  if (w.status !== 'active') fail('world_not_active');
  return { w, ch };
}

function checkCanPair(db, worldId, ids, { allowPrevious = false } = {}) {
  const ex = excusedIds(db, worldId);
  const rows = ids.map((id) => db.prepare(`SELECT u.id, u.gender, u.status FROM users u JOIN characters c ON c.user_id = u.id WHERE u.id = ?`).get(id));
  if (rows.some((r) => !r || r.status !== 'active')) fail('bad_participant');
  if (rows.some((r) => !r.gender)) fail('gender_missing');
  if (new Set(rows.map((r) => r.gender)).size !== 1) fail('gender_mismatch');
  if (ids.some((id) => ex.has(id))) fail('member_excused');
  if (ids.some((id) => activePairOf(db, worldId, id))) fail('already_paired');
  if (!allowPrevious) {
    for (const id of ids) {
      const prev = previousPartners(db, worldId, id);
      if (ids.some((o) => o !== id && prev.has(o))) fail('previous_partner');
    }
  }
}

function cancelPendingFor(db, worldId, ids) {
  for (const p of pairsIn(db, worldId, ['pending'])) {
    if (membersOfPair(p).some((id) => ids.includes(id))) db.prepare("UPDATE pairs SET status = 'cancelled' WHERE id = ?").run(p.id);
  }
}

export function requestPartner(db, user, worldId, partnerId) {
  partnerId = Number(partnerId);
  if (partnerId === user.id) fail('bad_participant');
  return tx(db, () => {
    requirePairWorld(db, worldId);
    checkCanPair(db, worldId, [user.id, partnerId]);
    // One open invitation at a time: a new one replaces the previous.
    db.prepare("UPDATE pairs SET status = 'cancelled' WHERE world_id = ? AND status = 'pending' AND user_a = ?").run(worldId, user.id);
    // If they already invited me, accept instead of creating a second invitation.
    const theirs = db.prepare("SELECT * FROM pairs WHERE world_id = ? AND status = 'pending' AND user_a = ? AND user_b = ?").get(worldId, partnerId, user.id);
    if (theirs) return activate(db, theirs, user);
    const r = db.prepare("INSERT INTO pairs (world_id, user_a, user_b, status, created_by) VALUES (?, ?, ?, 'pending', ?)").run(worldId, user.id, partnerId, user.id);
    return db.prepare('SELECT * FROM pairs WHERE id = ?').get(Number(r.lastInsertRowid));
  });
}

function activate(db, pair, actor) {
  checkCanPair(db, pair.world_id, [pair.user_a, pair.user_b]);
  db.prepare("UPDATE pairs SET status = 'active' WHERE id = ?").run(pair.id);
  cancelPendingFor(db, pair.world_id, [pair.user_a, pair.user_b]);
  audit(db, actor.id, 'pair', pair.id, 'formed', null, { world: pair.world_id, members: [pair.user_a, pair.user_b] });
  return db.prepare('SELECT * FROM pairs WHERE id = ?').get(pair.id);
}

export function respondPartner(db, user, pairId, accept) {
  return tx(db, () => {
    const p = db.prepare('SELECT * FROM pairs WHERE id = ?').get(pairId);
    if (!p || p.status !== 'pending') fail('bad_state');
    if (p.user_b === user.id) {
      if (!accept) { db.prepare("UPDATE pairs SET status = 'cancelled' WHERE id = ?").run(p.id); return { declined: true }; }
      requirePairWorld(db, p.world_id);
      return activate(db, p, user);
    }
    if (p.user_a === user.id && !accept) { db.prepare("UPDATE pairs SET status = 'cancelled' WHERE id = ?").run(p.id); return { cancelled: true }; }
    fail('forbidden', null, 403);
  });
}

// Coordinator tools ---------------------------------------------------------

export function coordCreatePair(db, actor, worldId, ids) {
  ids = [...new Set((ids || []).map(Number))];
  if (ids.length < 2 || ids.length > 3) fail('pair_size');
  return tx(db, () => {
    requirePairWorld(db, worldId);
    checkCanPair(db, worldId, ids, { allowPrevious: true });
    const r = db.prepare("INSERT INTO pairs (world_id, user_a, user_b, user_c, status, created_by) VALUES (?, ?, ?, ?, 'active', ?)")
      .run(worldId, ids[0], ids[1], ids[2] ?? null, actor.id);
    cancelPendingFor(db, worldId, ids);
    audit(db, actor.id, 'pair', Number(r.lastInsertRowid), 'formed_by_coordinator', null, { world: worldId, members: ids });
    return db.prepare('SELECT * FROM pairs WHERE id = ?').get(Number(r.lastInsertRowid));
  });
}

export function coordAddToPair(db, actor, pairId, userId) {
  userId = Number(userId);
  return tx(db, () => {
    const p = db.prepare("SELECT * FROM pairs WHERE id = ? AND status = 'active'").get(pairId);
    if (!p) fail('not_found', null, 404);
    if (p.user_c) fail('pair_size');
    requirePairWorld(db, p.world_id);
    checkCanPair(db, p.world_id, [userId]);
    const g = db.prepare('SELECT gender FROM users WHERE id IN (?, ?)').all(userId, p.user_a).map((r) => r.gender);
    if (new Set(g).size !== 1) fail('gender_mismatch');
    db.prepare('UPDATE pairs SET user_c = ? WHERE id = ?').run(userId, p.id);
    cancelPendingFor(db, p.world_id, [userId]);
    audit(db, actor.id, 'pair', p.id, 'trio', null, { added: userId });
    awardIfComplete(db, p.id);
    return db.prepare('SELECT * FROM pairs WHERE id = ?').get(p.id);
  });
}

export function coordDissolvePair(db, actor, pairId) {
  return tx(db, () => {
    const p = db.prepare('SELECT * FROM pairs WHERE id = ?').get(pairId);
    if (!p || p.status === 'cancelled') fail('bad_state');
    db.prepare("UPDATE pairs SET status = 'cancelled' WHERE id = ?").run(p.id);
    audit(db, actor.id, 'pair', p.id, 'dissolved', { members: membersOfPair(p) }, null);
    return { ok: true };
  });
}

export function setExcused(db, actor, worldId, userId, excused, reason) {
  userId = Number(userId);
  return tx(db, () => {
    if (!getWorld(db, worldId)) fail('not_found', null, 404);
    if (excused) {
      if (activePairOf(db, worldId, userId)) fail('already_paired');
      db.prepare('INSERT OR REPLACE INTO excusals (world_id, user_id, actor_id, reason) VALUES (?, ?, ?, ?)').run(worldId, userId, actor.id, String(reason || '').slice(0, 200) || null);
      cancelPendingFor(db, worldId, [userId]);
    } else {
      db.prepare('DELETE FROM excusals WHERE world_id = ? AND user_id = ?').run(worldId, userId);
    }
    audit(db, actor.id, 'excusal', `${worldId}:${userId}`, excused ? 'excuse' : 'unexcuse', null, { reason: reason || null });
    return { ok: true };
  });
}

// Progress ------------------------------------------------------------------

function pairForActor(db, actor, pairId) {
  const p = db.prepare("SELECT * FROM pairs WHERE id = ? AND status = 'active'").get(pairId);
  if (!p) fail('not_found', null, 404);
  if (!membersOfPair(p).includes(actor.id) && !isCoord(actor)) fail('forbidden', null, 403);
  return p;
}

function awardIfComplete(db, pairId) {
  const p = db.prepare('SELECT * FROM pairs WHERE id = ?').get(pairId);
  const ch = challengeOf(getWorld(db, p.world_id));
  const done = isComplete(ch, progressOf(db, p.id));
  if (!done) { db.prepare('UPDATE pairs SET completed_at = NULL WHERE id = ?').run(p.id); return false; }
  if (!p.completed_at) db.prepare("UPDATE pairs SET completed_at = datetime('now'), needs_support = 0 WHERE id = ?").run(p.id);
  // Challenge XP once per member per world, even if a pair is later re-formed.
  const xp = Number(getSettings(db).challenge_xp || 0);
  for (const uid of membersOfPair(p)) {
    const r = db.prepare("INSERT OR IGNORE INTO rewards (user_id, world_id, reward_type, source_id) VALUES (?, ?, 'challenge', ?)").run(uid, p.world_id, 'challenge:' + p.world_id);
    if (r.changes && xp > 0) {
      db.prepare("INSERT INTO ledger (user_id, world_id, amount, scope, kind, week, note) VALUES (?, ?, ?, 'xp', 'challenge', ?, ?)")
        .run(uid, p.world_id, xp, weekOf(today()), 'pair:' + p.id);
    }
  }
  return true;
}

export function addProgress(db, actor, pairId, input) {
  return tx(db, () => {
    const p = pairForActor(db, actor, pairId);
    const { ch } = requirePairWorld(db, p.world_id);
    const item = ch.items.find((it) => it.key === input.item);
    if (!item) fail('bad_item');
    const amount = Number.parseInt(input.amount ?? 1, 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 200) fail('bad_quantity');
    const doneAt = String(input.done_at || '').slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(doneAt)) fail('bad_date');
    if (doneAt.slice(0, 10) > today()) fail('bad_date');
    const r = db.prepare('INSERT INTO pair_progress (pair_id, item_key, amount, done_at, actor_id) VALUES (?, ?, ?, ?, ?)').run(p.id, item.key, amount, doneAt, actor.id);
    const completed = awardIfComplete(db, p.id);
    return { id: Number(r.lastInsertRowid), completed };
  });
}

export function removeProgress(db, actor, entryId) {
  return tx(db, () => {
    const e = db.prepare('SELECT * FROM pair_progress WHERE id = ? AND removed_by IS NULL').get(entryId);
    if (!e) fail('not_found', null, 404);
    if (e.actor_id !== actor.id && !isCoord(actor)) fail('forbidden', null, 403);
    db.prepare('UPDATE pair_progress SET removed_by = ? WHERE id = ?').run(actor.id, e.id);
    audit(db, actor.id, 'pair_progress', e.id, 'remove', { item: e.item_key, amount: e.amount, done_at: e.done_at }, null);
    awardIfComplete(db, e.pair_id);
    return { ok: true };
  });
}

export function setSupport(db, actor, pairId, on) {
  const p = pairForActor(db, actor, pairId);
  db.prepare('UPDATE pairs SET needs_support = ? WHERE id = ?').run(on ? 1 : 0, p.id);
  return { ok: true };
}

export function togglePrayer(db, user, pairId) {
  const p = db.prepare("SELECT * FROM pairs WHERE id = ? AND status = 'active'").get(pairId);
  if (!p) fail('not_found', null, 404);
  const has = db.prepare('SELECT 1 FROM pair_prayers WHERE pair_id = ? AND user_id = ?').get(p.id, user.id);
  if (has) db.prepare('DELETE FROM pair_prayers WHERE pair_id = ? AND user_id = ?').run(p.id, user.id);
  else db.prepare('INSERT INTO pair_prayers (pair_id, user_id) VALUES (?, ?)').run(p.id, user.id);
  return { praying: !has };
}

// Views ---------------------------------------------------------------------

const FRUIT_DEF = { fruit: 'PRE04', keeping: 'PRE05' };

export function challengeStatus(db, world) {
  const ch = challengeOf(world);
  if (!ch) return null;
  if (ch.type !== 'pair') {
    const count = db.prepare("SELECT COUNT(*) n FROM claims WHERE def_id = ? AND status = 'approved'").get(FRUIT_DEF[ch.type]).n;
    return { ...ch, count, complete: count >= ch.target };
  }
  const ex = excusedIds(db, world.id);
  const required = players(db).filter((u) => !ex.has(u.id)).map((u) => u.id);
  const pairs = pairsIn(db, world.id);
  const doneIds = new Set(pairs.filter((p) => isComplete(ch, progressOf(db, p.id))).flatMap(membersOfPair));
  const pairedIds = new Set(pairs.flatMap(membersOfPair));
  const done = required.filter((id) => doneIds.has(id)).length;
  return {
    ...ch, members: required.length, done, paired: required.filter((id) => pairedIds.has(id)).length,
    pairs_total: pairs.length, pairs_done: pairs.filter((p) => isComplete(ch, progressOf(db, p.id))).length,
    complete: required.length > 0 && done === required.length,
  };
}

export function board(db, worldId, viewer) {
  const w = getWorld(db, worldId);
  if (!w) fail('not_found', null, 404);
  const ch = challengeOf(w);
  if (!ch) fail('not_pair_world');
  const status = challengeStatus(db, w);
  if (ch.type !== 'pair') {
    const fruits = db.prepare(`SELECT c.id, c.status, c.performed_at, u.alias, a.token FROM claims c JOIN users u ON u.id = c.user_id
        LEFT JOIN anonymous_contacts a ON a.id = c.contact_id WHERE c.def_id = ? AND c.status IN ('approved','pending') ORDER BY c.id`).all(FRUIT_DEF[ch.type]);
    return { world: w, challenge: status, fruits };
  }
  const ex = db.prepare('SELECT e.user_id, e.reason, u.alias FROM excusals e JOIN users u ON u.id = e.user_id WHERE e.world_id = ?').all(worldId);
  const exSet = new Set(ex.map((e) => e.user_id));
  const coord = isCoord(viewer);
  const pairs = pairsIn(db, worldId).map((p) => {
    const prog = progressOf(db, p.id);
    const mine = membersOfPair(p).includes(viewer.id);
    return {
      id: p.id, members: membersOfPair(p), progress: prog, complete: isComplete(ch, prog), needs_support: !!p.needs_support,
      started: Object.keys(prog).length > 0, completed_at: p.completed_at, mine,
      prayers: db.prepare('SELECT COUNT(*) n FROM pair_prayers WHERE pair_id = ?').get(p.id).n,
      i_pray: !!db.prepare('SELECT 1 FROM pair_prayers WHERE pair_id = ? AND user_id = ?').get(p.id, viewer.id),
      entries: mine || coord ? db.prepare(`SELECT g.id, g.item_key, g.amount, g.done_at, g.actor_id, u.alias actor FROM pair_progress g
          JOIN users u ON u.id = g.actor_id WHERE g.pair_id = ? AND g.removed_by IS NULL ORDER BY g.done_at DESC, g.id DESC`).all(p.id) : undefined,
    };
  });
  const paired = new Set(pairs.flatMap((p) => p.members));
  const all = players(db);
  const unpaired = all.filter((u) => !paired.has(u.id) && !exSet.has(u.id)).map((u) => ({ id: u.id, gender: u.gender }));
  const me = all.find((u) => u.id === viewer.id);
  const prev = previousPartners(db, worldId, viewer.id);
  const pending = pairsIn(db, worldId, ['pending']);
  const my = {
    gender: me?.gender || null,
    excused: exSet.has(viewer.id),
    pair_id: pairs.find((p) => p.mine)?.id ?? null,
    incoming: pending.filter((p) => p.user_b === viewer.id).map((p) => ({ id: p.id, from: p.user_a })),
    outgoing: pending.filter((p) => p.user_a === viewer.id).map((p) => ({ id: p.id, to: p.user_b })),
    candidates: me ? unpaired.filter((u) => u.id !== viewer.id && u.gender && u.gender === me.gender && !prev.has(u.id)).map((u) => u.id) : [],
    previous: [...prev],
  };
  return { world: w, challenge: status, pairs, unpaired: unpaired.map((u) => u.id), unpaired_detail: coord ? unpaired : undefined, excused: ex, my };
}
