// Covers the QA cases in sheet "15 QA" of the blueprint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import * as E from '../server/engine.js';

let seq = 0;
function setup(n = 3) {
  const db = openDb(':memory:');
  const users = [];
  for (let i = 0; i < n; i++) {
    const r = db.prepare("INSERT INTO users (alias, pin_hash, role) VALUES (?, 'x', ?)").run('U' + i, i === 0 ? 'admin' : 'member');
    const id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO characters (user_id, class_id, look_json) VALUES (?, ?, '{}')").run(id, i % 2 ? 'CLS03' : 'CLS01');
    users.push(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }
  return { db, users, coord: users[0] };
}
const key = () => 'key-' + (++seq) + '-' + Math.random();
const day = E.today();
const claim = (db, u, def, extra = {}) => E.createClaim(db, u, { mission_def_id: def, quantity: 1, performed_at: day, idempotency_key: key(), ...extra }).claim;
const approve = (db, coord, c) => E.approveClaim(db, coord, c.id);
const xp = (db, u) => E.userStats(db, u.id).xp;

test('T01 PRE01 three people: +3 XP and +3 world stars', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'PRE01', { quantity: 3 });
  assert.equal(xp(db, users[1]), 0, 'pending gives no points');
  approve(db, coord, c);
  assert.equal(xp(db, users[1]), 3);
  assert.equal(E.worldProgress(db, 'W01').stars, 3);
});

test('T02/T03 PRE04 then PRE05 for same contact = 150; repeat PRE04 rejected', () => {
  const { db, users, coord } = setup();
  const u = users[1];
  const contact = E.createContact(db, u.id);
  assert.throws(() => claim(db, u, 'PRE05', { contact_id: contact.id }), { code: 'keeping_needs_baptism' });
  approve(db, coord, claim(db, u, 'PRE04', { contact_id: contact.id }));
  approve(db, coord, claim(db, u, 'PRE05', { contact_id: contact.id }));
  assert.equal(xp(db, u), 150);
  assert.throws(() => claim(db, u, 'PRE04', { contact_id: contact.id }), { code: 'milestone_duplicate' });
});

test('two pending PRE04 for one contact cannot both be approved', () => {
  const { db, users, coord } = setup();
  const contact = E.createContact(db, users[1].id);
  const a = claim(db, users[1], 'PRE04', { contact_id: contact.id });
  // Force a second pending claim past creation-time validation (e.g. older data).
  db.prepare(`INSERT INTO claims (user_id, def_id, world_id, quantity, points_per_unit, rule_version, status, performed_at, contact_id, idempotency_key)
    VALUES (?, 'PRE04', 'W01', 1, 50, 1, 'pending', ?, ?, 'dup-key-123')`).run(users[1].id, day, contact.id);
  approve(db, coord, a);
  const b = db.prepare("SELECT * FROM claims WHERE idempotency_key = 'dup-key-123'").get();
  assert.throws(() => approve(db, coord, b), { code: 'milestone_duplicate' });
});

test('T04 PRE02 adds +5 on top of PRE01', () => {
  const { db, users, coord } = setup();
  approve(db, coord, claim(db, users[1], 'PRE01'));
  approve(db, coord, claim(db, users[1], 'PRE02'));
  assert.equal(xp(db, users[1]), 6);
});

test('T06/T07 EduLMS needs a finished-course confirmation and credits once per day', () => {
  const { db, users, coord } = setup();
  assert.throws(() => claim(db, users[1], 'EDU01'), { code: 'confirm_required' });
  approve(db, coord, claim(db, users[1], 'EDU01', { confirmed: true }));
  assert.equal(xp(db, users[1]), 15);
  assert.throws(() => claim(db, users[1], 'EDU01', { confirmed: true }), { code: 'daily_cap' });
});

test('T08 team mission: points for each participant, one event for the world', () => {
  const { db, users, coord } = setup(4);
  const c = claim(db, users[1], 'SER03', { participant_ids: [users[2].id, users[3].id] });
  approve(db, coord, c);
  for (const u of users.slice(1)) assert.equal(xp(db, u), 10);
  const p = E.worldProgress(db, 'W01');
  assert.equal(p.stars, 10);
  assert.equal(p.tag_count, 1, 'encouragement event counted once');
  assert.equal(p.distinct, 3);
});

test('T09/T11 unlock needs every requirement and then a coordinator confirmation', () => {
  const { db, users, coord } = setup(3);
  db.prepare("UPDATE worlds SET star_target = 20 WHERE id = 'W01'").run();
  approve(db, coord, claim(db, users[1], 'PRE01', { quantity: 25 }));
  let p = E.worldProgress(db, 'W01');
  assert.equal(p.checks.stars, true);
  assert.equal(p.eligible, false, 'obstacle still incomplete');
  assert.throws(() => E.unlockWorld(db, coord, 'W01'), { code: 'not_eligible' });
  // 5 encouragement acts on different days by different people
  for (let i = 0; i < 5; i++) {
    const u = users[1 + (i % 2)];
    const d = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10);
    approve(db, coord, claim(db, u, 'SER06', { performed_at: d }));
  }
  p = E.worldProgress(db, 'W01');
  assert.equal(p.eligible, true);
  assert.equal(db.prepare("SELECT status FROM worlds WHERE id = 'W01'").get().status, 'active', 'eligible is not unlocked');
  const r = E.unlockWorld(db, coord, 'W01');
  assert.equal(r.next, 'W02');
  assert.equal(E.activeWorld(db).id, 'W02');
  assert.throws(() => E.unlockWorld(db, coord, 'W01'), { code: 'already_unlocked' });
});

test('T10 diversity: 8 team missions by only 2 people keeps the bridge locked', () => {
  const { db, users, coord } = setup(3);
  db.prepare("UPDATE worlds SET status = 'unlocked' WHERE ord < 3").run();
  db.prepare("UPDATE worlds SET status = 'active', star_target = 0 WHERE id = 'W03'").run();
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10);
    approve(db, coord, claim(db, users[1], 'SER04', { performed_at: d, participant_ids: [users[2].id] }));
  }
  const p = E.worldProgress(db, 'W03');
  assert.equal(p.tag_count, 8);
  assert.equal(p.distinct, 2);
  assert.equal(p.eligible, false);
});

test('T12 same idempotency key twice = one claim and one ledger entry', () => {
  const { db, users, coord } = setup();
  const k = key();
  const a = E.createClaim(db, users[1], { mission_def_id: 'PRE01', quantity: 2, idempotency_key: k });
  const b = E.createClaim(db, users[1], { mission_def_id: 'PRE01', quantity: 2, idempotency_key: k });
  assert.equal(a.claim.id, b.claim.id);
  assert.equal(b.duplicate, true);
  approve(db, coord, a.claim);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ledger WHERE scope = 'xp'").get().n, 1);
});

test('T13 double approval counts once', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'PRE01', { quantity: 4 });
  approve(db, coord, c);
  const again = approve(db, users[2], c);
  assert.equal(again.already, true);
  assert.equal(xp(db, users[1]), 4);
});

test('T14 changing mission points does not touch submitted claims', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'EDU02');
  db.prepare("UPDATE mission_defs SET points = 50 WHERE id = 'EDU02'").run();
  approve(db, coord, c);
  assert.equal(xp(db, users[1]), 5);
});

test('T15 weekly cap stops base XP but the world still receives stars', () => {
  const { db, users, coord } = setup();
  db.prepare("UPDATE settings SET value = '10' WHERE key = 'max_personal_base_weekly'").run();
  approve(db, coord, claim(db, users[1], 'PRE01', { quantity: 8 }));
  const r = approve(db, coord, claim(db, users[1], 'PRE01', { quantity: 8 }));
  assert.equal(xp(db, users[1]), 10);
  assert.deepEqual(r.result.members[users[1].id].notes, ['weekly_base_cap']);
  assert.equal(E.worldProgress(db, 'W01').stars, 16);
});

test('T16 fruit milestones are exempt from the weekly cap', () => {
  const { db, users, coord } = setup();
  db.prepare("UPDATE settings SET value = '0' WHERE key = 'max_personal_base_weekly'").run();
  const contact = E.createContact(db, users[1].id);
  approve(db, coord, claim(db, users[1], 'PRE04', { contact_id: contact.id }));
  assert.equal(xp(db, users[1]), 50);
});

test('T18 notes with phone numbers or emails are refused', () => {
  const { db, users } = setup();
  assert.throws(() => claim(db, users[1], 'PRE01', { note: 'call 809-555-1234' }), { code: 'pii' });
  assert.throws(() => claim(db, users[1], 'PRE01', { note: 'ana@example.com' }), { code: 'pii' });
});

test('T19 cannot unlock a world out of order', () => {
  const { db, coord } = setup();
  db.prepare("UPDATE worlds SET star_target = 0, tag_target = 0, distinct_min = 0 WHERE id = 'W04'").run();
  assert.throws(() => E.unlockWorld(db, coord, 'W04'), { code: 'not_eligible' });
});

test('T21 admin void appends offsetting entries and keeps history', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'PRE01', { quantity: 5 });
  approve(db, coord, c);
  E.voidClaim(db, coord, c.id, 'reported twice');
  assert.equal(xp(db, users[1]), 0);
  assert.equal(E.worldProgress(db, 'W01').stars, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ledger').get().n, 4, 'original rows remain plus offsets');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'void'").get().n, 1);
});

test('T22 final world needs all five paths and 3 people', () => {
  const { db, users, coord } = setup(4);
  db.prepare("UPDATE worlds SET status = 'unlocked' WHERE ord < 6").run();
  db.prepare("UPDATE worlds SET status = 'active' WHERE id = 'W06'").run();
  approve(db, coord, claim(db, users[1], 'EDU02'));
  approve(db, coord, claim(db, users[2], 'SER06'));
  approve(db, coord, claim(db, users[3], 'PRE01'));
  let p = E.worldProgress(db, 'W06');
  assert.equal(p.tag_count, 4, 'knowledge, encouragement, service, preaching');
  assert.equal(p.eligible, false);
  approve(db, coord, claim(db, users[1], 'SER04'));
  p = E.worldProgress(db, 'W06');
  assert.equal(p.eligible, true);
  assert.equal(E.unlockWorld(db, coord, 'W06').next, null);
});

test('class ability: +5 to each teammate once per week, needs a matching mission', () => {
  const { db, users, coord } = setup(3);
  // users[1] is CLS03 Guardian of Unity (teamwork)
  assert.throws(() => claim(db, users[1], 'SER04', { use_ability: true }), { code: 'ability_needs_team' });
  assert.throws(() => claim(db, users[1], 'EDU02', { use_ability: true, participant_ids: [users[2].id] }), { code: 'ability_no_match' });
  approve(db, coord, claim(db, users[1], 'SER04', { use_ability: true, participant_ids: [users[2].id] }));
  assert.equal(xp(db, users[1]), 15);
  assert.equal(xp(db, users[2]), 15);
  assert.throws(() => claim(db, users[1], 'SP06', { use_ability: true, participant_ids: [users[2].id, users[0].id] }), { code: 'ability_cooldown' });
});

test('cards must be revealed and can be completed once', () => {
  const { db, users, coord } = setup(3);
  assert.throws(() => claim(db, users[1], 'CARD01'), { code: 'card_hidden' });
  db.prepare("UPDATE mission_defs SET revealed_at = datetime('now') WHERE id = 'CARD01'").run();
  approve(db, coord, claim(db, users[1], 'CARD01'));
  assert.equal(xp(db, users[1]), 5);
  assert.throws(() => claim(db, users[1], 'CARD01'), { code: 'card_done' });
});

test('request change then resubmit, reject needs a reason and never removes points', () => {
  const { db, users, coord } = setup();
  const c = claim(db, users[1], 'PRE01', { quantity: 2 });
  E.requestChange(db, coord, c.id, 'How many people?');
  const r = E.resubmitClaim(db, users[1], c.id, { quantity: 3, performed_at: day });
  assert.equal(r.status, 'pending');
  approve(db, coord, r);
  assert.equal(xp(db, users[1]), 3);
  const d = claim(db, users[1], 'PRE01');
  assert.throws(() => E.rejectClaim(db, coord, d.id, ''), { code: 'reason_required' });
  E.rejectClaim(db, coord, d.id, 'duplicate');
  assert.equal(xp(db, users[1]), 3);
});
