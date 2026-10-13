// End-of-season results for leaders only: star ranking, participation and
// per-category totals used for recognitions. Never exposed to members.
import { levelFor } from './catalog.js';

export function seasonResults(db) {
  const players = db.prepare(`SELECT u.id, u.alias, u.role, u.gender FROM users u JOIN characters c ON c.user_id = u.id
      WHERE u.status = 'active' ORDER BY u.alias COLLATE NOCASE`).all();

  const stars = Object.fromEntries(db.prepare("SELECT user_id, COALESCE(SUM(amount),0) n FROM ledger WHERE scope = 'xp' AND user_id IS NOT NULL GROUP BY user_id").all()
    .map((r) => [r.user_id, r.n]));

  // Every approved report counts for the person who sent it and for each companion.
  const mission = Object.fromEntries(db.prepare(`
    WITH inv AS (
      SELECT c.id, c.user_id AS uid, c.def_id, c.quantity, c.performed_at,
        (SELECT COUNT(*) FROM claim_participants p WHERE p.claim_id = c.id) AS others
      FROM claims c WHERE c.status = 'approved'
      UNION ALL
      SELECT c.id, p.user_id AS uid, c.def_id, c.quantity, c.performed_at, 1 AS others
      FROM claims c JOIN claim_participants p ON p.claim_id = c.id WHERE c.status = 'approved'
    )
    SELECT i.uid,
      COUNT(*) AS reports,
      COUNT(DISTINCT i.performed_at) AS active_days,
      SUM(CASE WHEN i.others > 0 THEN 1 ELSE 0 END) AS team,
      SUM(CASE WHEN i.def_id = 'PRE01' THEN i.quantity ELSE 0 END) AS preached,
      SUM(CASE WHEN i.def_id = 'PRE03' THEN i.quantity ELSE 0 END) AS studies,
      SUM(CASE WHEN i.def_id = 'PRE04' THEN i.quantity ELSE 0 END) AS fruits,
      SUM(CASE WHEN i.def_id = 'PRE05' THEN i.quantity ELSE 0 END) AS keeping,
      SUM(CASE WHEN i.def_id IN ('EDU02','EDU03') THEN i.quantity ELSE 0 END) AS signatures,
      SUM(CASE WHEN i.def_id = 'EDU01' THEN i.quantity ELSE 0 END) AS courses,
      SUM(CASE WHEN d.category = 'shepherd' THEN i.quantity ELSE 0 END) AS shepherd,
      SUM(CASE WHEN d.category = 'service' THEN i.quantity ELSE 0 END) AS service,
      SUM(CASE WHEN i.def_id = 'SER01' THEN i.quantity ELSE 0 END) AS prayer
    FROM inv i JOIN mission_defs d ON d.id = i.def_id GROUP BY i.uid`).all().map((r) => [r.uid, r]));

  // Pair-challenge progress: the pair's total counts for each member of the pair.
  const challenge = {};
  for (const r of db.prepare(`
    SELECT m.uid, g.item_key, SUM(g.amount) AS n FROM pair_progress g
    JOIN pairs p ON p.id = g.pair_id AND p.status = 'active'
    JOIN (SELECT id AS pid, user_a AS uid FROM pairs UNION ALL SELECT id, user_b FROM pairs
          UNION ALL SELECT id, user_c FROM pairs WHERE user_c IS NOT NULL) m ON m.pid = p.id
    WHERE g.removed_by IS NULL GROUP BY m.uid, g.item_key`).all()) {
    (challenge[r.uid] ??= {})[r.item_key] = r.n;
  }

  const zero = { reports: 0, active_days: 0, team: 0, preached: 0, studies: 0, fruits: 0, keeping: 0, signatures: 0, courses: 0, shepherd: 0, service: 0, prayer: 0 };
  const rows = players.map((u) => {
    const m = { ...zero, ...(mission[u.id] || {}) };
    delete m.uid;
    const ch = challenge[u.id] || {};
    const total = stars[u.id] || 0;
    return {
      id: u.id, alias: u.alias, role: u.role, gender: u.gender, stars: total, level: levelFor(total).level, ...m,
      ch_chapters: ch.chapters || 0, ch_preached: ch.preached || 0, ch_contacts: ch.contacts || 0,
      ch_ga: ch.ga || 0, ch_edulms: ch.edulms || 0,
    };
  });

  // Ranking by stars; equal stars share a place.
  rows.sort((a, b) => b.stars - a.stars || a.alias.localeCompare(b.alias));
  let place = 0;
  rows.forEach((r, i) => { if (i === 0 || r.stars !== rows[i - 1].stars) place = i + 1; r.rank = place; });

  const participated = rows.filter((r) => r.reports > 0 || r.ch_chapters + r.ch_preached + r.ch_contacts + r.ch_ga + r.ch_edulms > 0);
  return {
    members: rows.length,
    participated: participated.length,
    total_stars: rows.reduce((a, r) => a + r.stars, 0),
    total_reports: db.prepare("SELECT COUNT(*) n FROM claims WHERE status = 'approved'").get().n,
    rows,
  };
}
