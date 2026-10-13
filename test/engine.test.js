// Scoring rules after the revamp: one kind of point (stars), daily activities count
// instantly, milestones (fruit, signatures, EduLMS) wait for a coordinator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import * as E from '../server/engine.js';

let seq = 0;
function setup(n = 3) {
  const db = openDb(':memory:');
  const users = [];
  for (let i = 0; i < n; i++) {
    const r = db.prepare("INSERT INTO users (alias, pin_hash, role, gender) VALUES (?, 'x', ?, 'brother')").run('U' + i, i === 0 ? 'coordinator' : 'member');
    const id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO characters (user_id, class_id, look_json) VALUES (?, 'CLS01', '{}')").run(id);
    users.push(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }
  return { db, users, coord: users[0] };
}
const key = () => 'key-' + (++seq) + '-' + Math.random();
const day = E.today();
const claim = (db, u, def, extra = {}) => E.createClaim(db, u, { mission_def_id: def, quantity: 1, performed_at: day, idempotency_key: key(), ...extra }).claim;
const stars = (db, u) => E.userStats(db, u.id).xp;
const worldStars = (db) => E.worldProgress(db, 'W01').stars;

test('the mission list is short; only milestones need approval', () => {
  const { db } = setup(0);
  const active = db.prepare('SELECT id, needs_approval FROM mission_defs WHERE active = 1').all();
  assert.equal(active.length, 13);
  assert.deepEqual(active.filter((m) => m.needs_approval).map((m) => m.id).sort(), ['EDU01', 'EDU02', 'EDU03', 'PRE04', 'PRE05']);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mission_defs WHERE kind = 'card' AND active = 1").get().n, 0);
});

test('daily activities count right away for the member and the world', () => {
  const { db, users } = setup();
  const c = claim(db, users[1], 'SER02');
  assert.equal(c.status, 'approved');
  assert.equal(stars(db, users[1]), 5);
  assert.equal(worldStars(db), 5);
});

test('preaching counts one star per person', () => {
  const { db, users } = setup();
  claim(db, users[1], 'PRE01', { quantity: 7 });
  assert.equal(stars(db, users[1]), 7);
});

test('milestones wait for a coordinator', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'EDU02');
  assert.equal(c.status, 'pending');
  assert.equal(stars(db, users[1]), 0);
  assert.equal(E.userStats(db, users[1].id).pending_xp, 5);
  E.approveClaim(db, coord, c.id);
  assert.equal(stars(db, users[1]), 5);
});

test('baptism and keeping service need no guest code', () => {
  const { db, users, coord } = setup();
  E.approveClaim(db, coord, claim(db, users[1], 'PRE04').id);
  E.approveClaim(db, coord, claim(db, users[1], 'PRE05').id);
  assert.equal(stars(db, users[1]), 150);
});

test('team activity: everyone gets the stars, the world counts it once', () => {
  const { db, users } = setup(4);
  claim(db, users[1], 'SER04', { participant_ids: [users[2].id, users[3].id] });
  for (const u of users.slice(1)) assert.equal(stars(db, u), 10);
  assert.equal(worldStars(db), 10);
});

test('no weekly cap any more', () => {
  const { db, users } = setup();
  claim(db, users[1], 'PRE01', { quantity: 120 });
  assert.equal(stars(db, users[1]), 120);
});

test('once-a-day activities stay once a day', () => {
  const { db, users } = setup();
  claim(db, users[1], 'AP03');
  assert.throws(() => claim(db, users[1], 'AP03'), { code: 'daily_cap' });
});

test('switched-off missions cannot be reported', () => {
  const { db, users } = setup();
  assert.throws(() => claim(db, users[1], 'SP01'), { code: 'mission_inactive' });
  assert.throws(() => claim(db, users[1], 'CARD01'), { code: 'mission_inactive' });
});

test('EduLMS needs the whole-course confirmation', () => {
  const { db, users } = setup();
  assert.throws(() => claim(db, users[1], 'EDU01'), { code: 'confirm_required' });
  assert.equal(claim(db, users[1], 'EDU01', { confirmed: true }).status, 'pending');
});

test('same idempotency key twice = one report', () => {
  const { db, users } = setup();
  const k = key();
  const a = E.createClaim(db, users[1], { mission_def_id: 'PRE01', quantity: 2, idempotency_key: k });
  const b = E.createClaim(db, users[1], { mission_def_id: 'PRE01', quantity: 2, idempotency_key: k });
  assert.equal(a.claim.id, b.claim.id);
  assert.equal(b.duplicate, true);
  assert.equal(stars(db, users[1]), 2);
});

test('double approval counts once', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'EDU03');
  E.approveClaim(db, coord, c.id);
  assert.equal(E.approveClaim(db, users[2], c.id).already, true);
  assert.equal(stars(db, users[1]), 8);
});

test('changing points later does not change a report already sent', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'EDU02');
  db.prepare("UPDATE mission_defs SET points = 50 WHERE id = 'EDU02'").run();
  E.approveClaim(db, coord, c.id);
  assert.equal(stars(db, users[1]), 5);
});

test('notes with phone numbers or emails are refused', () => {
  const { db, users } = setup();
  assert.throws(() => claim(db, users[1], 'PRE01', { note: 'call 809-555-1234' }), { code: 'pii' });
  assert.throws(() => claim(db, users[1], 'PRE01', { note: 'ana@example.com' }), { code: 'pii' });
});

test('cannot unlock a world out of order', () => {
  const { db, coord } = setup();
  db.prepare("UPDATE worlds SET star_target = 0 WHERE id = 'W04'").run();
  assert.throws(() => E.unlockWorld(db, coord, 'W04'), { code: 'not_eligible' });
});

test('a coordinator can remove a mistaken entry; history is kept', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'PRE01', { quantity: 5 });
  E.voidClaim(db, coord, c.id, 'reported twice');
  assert.equal(stars(db, users[1]), 0);
  assert.equal(worldStars(db), 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ledger').get().n, 4, 'original rows remain plus offsets');
});

test('send back, fix and resubmit; reject needs a reason', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'EDU02');
  E.requestChange(db, coord, c.id, 'Which sermon?');
  const r = E.resubmitClaim(db, users[1], c.id, { quantity: 2, performed_at: day });
  assert.equal(r.status, 'pending');
  E.approveClaim(db, coord, r.id);
  assert.equal(stars(db, users[1]), 10);
  const d = claim(db, users[1], 'EDU03');
  assert.throws(() => E.rejectClaim(db, coord, d.id, ''), { code: 'reason_required' });
  E.rejectClaim(db, coord, d.id, 'duplicate');
  assert.equal(stars(db, users[1]), 10);
});

test('levels follow stars', () => {
  const { db, users } = setup();
  claim(db, users[1], 'PRE01', { quantity: 160 });
  assert.equal(E.userStats(db, users[1].id).level, 3);
});

test('group feed lists approved activity', () => {
  const { db, users } = setup();
  claim(db, users[1], 'SER01');
  claim(db, users[2], 'EDU02');
  const feed = E.groupFeed(db);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].def_id, 'SER01');
});
