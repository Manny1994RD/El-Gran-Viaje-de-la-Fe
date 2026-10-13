import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import * as E from '../server/engine.js';
import * as C from '../server/challenge.js';

// genders: array like ['brother','brother','sister','sister']; user 0 is the coordinator.
function setup(genders) {
  const db = openDb(':memory:');
  const users = genders.map((g, i) => {
    const r = db.prepare("INSERT INTO users (alias, pin_hash, role, gender) VALUES (?, 'x', ?, ?)").run('U' + i, i === 0 ? 'coordinator' : 'member', g);
    const id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO characters (user_id, class_id, look_json) VALUES (?, 'CLS01', '{}')").run(id);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  });
  return { db, users, coord: users[0] };
}
const now = () => new Date().toISOString().slice(0, 16);
const pairUp = (db, a, b, world = 'W01') => {
  const req = C.requestPartner(db, a, world, b.id);
  return C.respondPartner(db, b, req.id, true);
};
const xp = (db, u) => E.userStats(db, u.id).xp;

test('worlds get the challenges and larger star goals', () => {
  const { db } = setup([]);
  const w1 = db.prepare("SELECT * FROM worlds WHERE id = 'W01'").get();
  assert.equal(w1.star_target, 500);
  assert.equal(C.challengeOf(w1).items[0].target, 5);
  assert.equal(C.challengeOf(db.prepare("SELECT * FROM worlds WHERE id = 'W02'").get()).items.length, 2);
  assert.equal(C.challengeOf(db.prepare("SELECT * FROM worlds WHERE id = 'W05'").get()).type, 'fruit');
});

test('pairs must be the same gender and need the partner to accept', () => {
  const { db, users } = setup(['brother', 'brother', 'brother', 'sister']);
  assert.throws(() => C.requestPartner(db, users[1], 'W01', users[3].id), { code: 'gender_mismatch' });
  const req = C.requestPartner(db, users[1], 'W01', users[2].id);
  assert.equal(req.status, 'pending');
  assert.throws(() => C.respondPartner(db, users[3], req.id, true), { code: 'forbidden' });
  const p = C.respondPartner(db, users[2], req.id, true);
  assert.equal(p.status, 'active');
  assert.throws(() => C.requestPartner(db, users[0], 'W01', users[1].id), { code: 'already_paired' });
});

test('mutual invitations become one pair; other invitations are cancelled', () => {
  const { db, users } = setup(['sister', 'sister', 'sister', 'sister']);
  C.requestPartner(db, users[3], 'W01', users[1].id);
  C.requestPartner(db, users[1], 'W01', users[2].id);
  const p = C.requestPartner(db, users[2], 'W01', users[1].id);
  assert.equal(p.status, 'active');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pairs WHERE status = 'pending'").get().n, 0);
});

test('members without gender are asked to set it first', () => {
  const { db, users } = setup(['brother', null]);
  assert.throws(() => C.requestPartner(db, users[0], 'W01', users[1].id), { code: 'gender_missing' });
});

test('last world\'s partner cannot be chosen again (coordinators may override)', () => {
  const { db, users, coord } = setup(['brother', 'brother', 'brother', 'brother']);
  pairUp(db, users[1], users[2]);
  db.prepare("UPDATE worlds SET status = 'unlocked' WHERE id = 'W01'").run();
  db.prepare("UPDATE worlds SET status = 'active' WHERE id = 'W02'").run();
  assert.throws(() => C.requestPartner(db, users[1], 'W02', users[2].id), { code: 'previous_partner' });
  const b = C.board(db, 'W02', users[1]);
  assert.deepEqual(b.my.candidates.sort(), [users[0].id, users[3].id].sort());
  assert.equal(C.coordCreatePair(db, coord, 'W02', [users[1].id, users[2].id]).status, 'active');
});

test('a pair completes by logging progress; each member gets challenge XP once', () => {
  const { db, users } = setup(['brother', 'brother', 'brother', 'brother']);
  const p = pairUp(db, users[1], users[2]);
  const r1 = C.addProgress(db, users[1], p.id, { item: 'chapters', amount: 3, done_at: now() });
  assert.equal(r1.completed, false);
  assert.throws(() => C.addProgress(db, users[3], p.id, { item: 'chapters', amount: 2, done_at: now() }), { code: 'forbidden' });
  const r2 = C.addProgress(db, users[2], p.id, { item: 'chapters', amount: 2, done_at: now() });
  assert.equal(r2.completed, true);
  assert.equal(xp(db, users[1]), 15);
  C.addProgress(db, users[2], p.id, { item: 'chapters', amount: 1, done_at: now() });
  assert.equal(xp(db, users[2]), 15, 'no second award');
});

test('coordinators can log for any pair and remove mistaken entries', () => {
  const { db, users, coord } = setup(['sister', 'sister', 'sister']);
  const p = pairUp(db, users[1], users[2]);
  const e = C.addProgress(db, coord, p.id, { item: 'chapters', amount: 5, done_at: now() });
  assert.equal(e.completed, true);
  C.removeProgress(db, coord, e.id);
  assert.equal(C.board(db, 'W01', coord).pairs[0].complete, false);
});

test('World 2 needs both the GA signature and the EduLMS course', () => {
  const { db, users } = setup(['brother', 'brother', 'brother']);
  db.prepare("UPDATE worlds SET status = 'unlocked' WHERE id = 'W01'").run();
  db.prepare("UPDATE worlds SET status = 'active' WHERE id = 'W02'").run();
  const p = pairUp(db, users[1], users[2], 'W02');
  assert.equal(C.addProgress(db, users[1], p.id, { item: 'ga', amount: 1, done_at: now() }).completed, false);
  assert.equal(C.addProgress(db, users[1], p.id, { item: 'edulms', amount: 1, done_at: now() }).completed, true);
  assert.throws(() => C.addProgress(db, users[1], p.id, { item: 'chapters', amount: 1, done_at: now() }), { code: 'bad_item' });
});

test('world opens only when every non-excused member is in a finished pair and stars are met', () => {
  const { db, users, coord } = setup(['brother', 'brother', 'sister', 'sister', 'sister']);
  db.prepare("UPDATE worlds SET star_target = 0 WHERE id = 'W01'").run();
  const a = C.coordCreatePair(db, coord, 'W01', [users[0].id, users[1].id]);
  const b = pairUp(db, users[2], users[3]);
  C.addProgress(db, coord, a.id, { item: 'chapters', amount: 5, done_at: now() });
  C.addProgress(db, users[2], b.id, { item: 'chapters', amount: 5, done_at: now() });
  let w = E.worldProgress(db, 'W01');
  assert.equal(w.challenge.done, 4);
  assert.equal(w.challenge.members, 5);
  assert.equal(w.eligible, false, 'user 4 has no partner yet');
  // Odd sister joins as a trio; or could be excused.
  C.coordAddToPair(db, coord, b.id, users[4].id);
  w = E.worldProgress(db, 'W01');
  assert.equal(w.eligible, true);
  assert.equal(E.unlockWorld(db, coord, 'W01').next, 'W02');
});

test('excused members do not block the world', () => {
  const { db, users, coord } = setup(['brother', 'brother', 'sister']);
  db.prepare("UPDATE worlds SET star_target = 0 WHERE id = 'W01'").run();
  const p = C.coordCreatePair(db, coord, 'W01', [users[0].id, users[1].id]);
  C.addProgress(db, coord, p.id, { item: 'chapters', amount: 5, done_at: now() });
  assert.equal(E.worldProgress(db, 'W01').eligible, false);
  C.setExcused(db, coord, 'W01', users[2].id, true, 'traveling');
  assert.equal(E.worldProgress(db, 'W01').eligible, true);
});

test('stars are still required', () => {
  const { db, users, coord } = setup(['brother', 'brother']);
  const p = C.coordCreatePair(db, coord, 'W01', [users[0].id, users[1].id]);
  C.addProgress(db, coord, p.id, { item: 'chapters', amount: 5, done_at: now() });
  const w = E.worldProgress(db, 'W01');
  assert.equal(w.checks.challenge, true);
  assert.equal(w.checks.stars, false);
  assert.equal(w.eligible, false);
});

test('Garden needs 3 approved fruits from the whole group; City needs one that keeps service', () => {
  const { db, users, coord } = setup(['brother', 'sister']);
  db.prepare("UPDATE worlds SET status = 'unlocked' WHERE ord < 5").run();
  db.prepare("UPDATE worlds SET status = 'active', star_target = 0 WHERE id = 'W05'").run();
  const report = (u, def) => E.approveClaim(db, coord, E.createClaim(db, u, { mission_def_id: def, idempotency_key: 'k' + Math.random() }).claim.id);
  report(users[0], 'PRE04');
  report(users[1], 'PRE04');
  assert.equal(E.worldProgress(db, 'W05').eligible, false);
  report(users[1], 'PRE04');
  assert.equal(E.worldProgress(db, 'W05').challenge.count, 3);
  assert.equal(E.unlockWorld(db, coord, 'W05').next, 'W06');
  db.prepare("UPDATE worlds SET star_target = 0 WHERE id = 'W06'").run();
  assert.equal(E.worldProgress(db, 'W06').eligible, false);
  report(users[0], 'PRE05');
  assert.equal(E.worldProgress(db, 'W06').eligible, true);
});

test('support flag and prayers', () => {
  const { db, users } = setup(['brother', 'brother', 'sister']);
  const p = pairUp(db, users[0], users[1]);
  C.setSupport(db, users[1], p.id, true);
  assert.equal(C.togglePrayer(db, users[2], p.id).praying, true);
  const b = C.board(db, 'W01', users[2]);
  assert.equal(b.pairs[0].needs_support, true);
  assert.equal(b.pairs[0].prayers, 1);
  assert.equal(b.pairs[0].entries, undefined, 'others see status, not the log');
  assert.throws(() => C.setSupport(db, users[2], p.id, false), { code: 'forbidden' });
});

test('an existing version-1 database upgrades without losing data', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'viaje-')), 'old.db');
  const db1 = openDb(file);
  db1.prepare("INSERT INTO users (alias, pin_hash, role) VALUES ('Old', 'x', 'admin')").run();
  // Simulate the old schema: drop the new columns' values and the version marker.
  db1.prepare("DELETE FROM settings WHERE key = 'schema_version'").run();
  db1.prepare("UPDATE worlds SET challenge_type = NULL, star_target = 100 WHERE id = 'W01'").run();
  db1.prepare("UPDATE worlds SET status = 'unlocked', star_target = 100 WHERE id = 'W02'").run();
  db1.close();
  const db2 = openDb(file);
  assert.equal(db2.prepare("SELECT alias FROM users").get().alias, 'Old');
  assert.equal(db2.prepare("SELECT star_target FROM worlds WHERE id = 'W01'").get().star_target, 500);
  assert.equal(db2.prepare("SELECT star_target FROM worlds WHERE id = 'W02'").get().star_target, 100, 'completed worlds keep their history');
  assert.equal(db2.prepare("SELECT challenge_type FROM worlds WHERE id = 'W01'").get().challenge_type, 'pair');
  assert.ok(new DatabaseSync(file));
});
