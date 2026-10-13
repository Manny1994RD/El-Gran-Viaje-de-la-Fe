import { t, tr, getLang, setLang } from './i18n.js';
import { avatarSVG, companionSVG } from './avatar.js';
import { mapSVG, NODES } from './map.js';
import { play, isMuted, setMuted } from './sound.js';
import { LOOK_OPTIONS, SKIN, HAIR_COLORS, EYE_COLORS, OUTFIT_COLORS, DEFAULT_LOOK, COSMETICS, randomLook } from './options.js';

const S = { me: null, character: null, settings: {}, classes: [], levels: [] };
const app = document.getElementById('app');
const nav = document.getElementById('nav');
const topbar = document.getElementById('topbar');

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const isCoord = () => S.me && ['coordinator', 'admin'].includes(S.me.role);
const isAdmin = () => S.me?.role === 'admin';
const classById = (id) => S.classes.find((c) => c.id === id);
const pct = (a, b) => (b <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((a / b) * 100))));
const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
// Illustrations live in public/art/. Each <img> removes itself if the file is missing,
// so the game keeps its drawn look until the art is added.
const art = (file, cls, alt = '') => `<img class="${cls}" src="art/${file}" alt="${esc(alt)}" loading="lazy" onerror="this.remove()">`;
const worldArt = (w, cls = 'world-art') => art(w.id.toLowerCase() + '.webp', cls + (w.status === 'locked' ? ' locked' : ''), tr(w, 'name'));
const CAT_ICON = { preaching: '📣', education: '📖', shepherd: '🐑', service: '🤲', unity: '🤝', card: '🃏' };

class ApiError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}
async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') { S.me = null; S.character = null; }
    throw new ApiError(data.error || 'server_error', data.detail);
  }
  return data;
}
const errText = (e) => t('errors.' + (e.code || 'server_error'), e.detail || {});

let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

function modal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal panel" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('.modal-back', root).addEventListener('click', (e) => { if (e.target.classList.contains('modal-back')) close(); });
  return { el: $('.modal', root), close };
}

// Ask for confirmation, optionally with a required text (reason).
function ask(title, { input = false, placeholder = '', okLabel = t('ok'), danger = false } = {}) {
  return new Promise((resolve) => {
    const m = modal(`<h3>${esc(title)}</h3>${input ? `<label class="field"><textarea id="ask-in" maxlength="300" placeholder="${esc(placeholder)}"></textarea></label>` : ''}
      <div class="btn-row"><button class="btn" id="ask-no">${t('cancel')}</button><button class="btn ${danger ? 'primary' : 'green'}" id="ask-yes">${esc(okLabel)}</button></div>`);
    const done = (v) => { m.close(); resolve(v); };
    $('#ask-no', m.el).onclick = () => done(null);
    $('#ask-yes', m.el).onclick = () => {
      if (!input) return done(true);
      const v = $('#ask-in', m.el).value.trim();
      if (!v) { toast(t('errors.reason_required'), true); return; }
      done(v);
    };
    $('#ask-in', m.el)?.focus();
  });
}

function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#E5484D', '#FFD84D', '#3FAE5B', '#3B7DD8', '#E25FA4', '#9B51E0'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 2 + Math.random() * 2.5 + 's';
    p.style.animationDelay = Math.random() * 0.8 + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 5500);
}

const bar = (label, value, target, cls = '') => {
  const ok = value >= target;
  return `<div class="bar-label"><span>${label}</span><span class="${ok ? 'ok' : ''}">${ok ? '✔ ' : ''}${value} / ${target}</span></div>
    <div class="bar ${cls} ${ok ? 'full' : ''}" role="progressbar" aria-valuenow="${value}" aria-valuemax="${target}"><i style="width:${pct(value, target)}%"></i></div>`;
};

const statusPill = (st) => `<span class="status-pill ${st}">${t('status.' + st)}</span>`;
const worldStatusPill = (st) => `<span class="status-pill ${st}">${t('world_' + st)}</span>`;
const fmtDate = (d) => {
  try {
    return new Date(d.length === 10 ? d + 'T12:00:00' : d.replace(' ', 'T') + (d.includes('Z') ? '' : 'Z'))
      .toLocaleDateString(getLang() === 'en' ? 'en-US' : 'es-ES', { day: 'numeric', month: 'short' });
  } catch { return d; }
};

// ---------- icons for nav ----------
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
  missions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="8" r="4.5"/><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M9 9h6M9 13h6"/></svg>',
  lead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
};

let pendingCount = 0;
function renderNav(active) {
  const show = !!(S.me && S.character) && active !== 'tv';
  nav.hidden = !show;
  topbar.hidden = active === 'tv';
  document.body.classList.toggle('tv', active === 'tv');
  $('#lang-btn').textContent = getLang() === 'es' ? 'EN' : 'ES';
  $('#brand-name').textContent = S.settings.season_name && getLang() === 'es' ? S.settings.season_name : t('app_name');
  if (!show) return;
  const items = [['home', t('nav_home')], ['map', t('nav_map')], ['log', ''], ['me', t('nav_me')]];
  if (isCoord()) items.push(['lead', t('nav_lead')]);
  nav.innerHTML = items.map(([k, label]) => (k === 'log'
    ? `<a href="#/log" class="nav-plus ${active === 'log' ? 'on' : ''}" aria-label="${t('log_activity')}"><span>＋</span></a>`
    : `<a href="#/${k}" class="${active === k ? 'on' : ''}">${ICONS[k]}<span>${label}</span>${k === 'lead' && pendingCount ? `<b class="dot">${pendingCount}</b>` : ''}</a>`)).join('');
}
async function refreshPending() {
  if (!isCoord()) return;
  try {
    pendingCount = (await api('GET', '/approvals/queue')).length;
    const a = $('a[href="#/lead"]', nav);
    if (a) { $('.dot', a)?.remove(); if (pendingCount) a.insertAdjacentHTML('beforeend', `<b class="dot">${pendingCount}</b>`); }
  } catch { /* ignore */ }
}

// ---------- routing ----------
const routes = {
  '': welcome, welcome, login, join, create: () => creator(false), edit: () => creator(true),
  home: homeView, map: mapView, world: worldView, challenge: challengeView, gender: genderView, log: logView, missions: logView,
  report, fix: report, me: meView, news: homeView, lead, celebrate, tv,
};
const PUBLIC = new Set(['', 'welcome', 'login', 'join']);

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [name, ...rest] = path.split('/');
  return { name, args: rest, query: new URLSearchParams(qs || '') };
}

let tvTimer;
async function router() {
  clearInterval(tvTimer);
  document.getElementById('modal-root').innerHTML = '';
  const { name, args, query } = parseHash();
  if (!S.me && !PUBLIC.has(name)) {
    if (name === 'join') return go('join');
    return go('welcome');
  }
  if (S.me && !S.me.gender && name !== 'gender') return go('gender');
  if (S.me && !S.character && !['create', 'join', 'gender'].includes(name)) return go('create');
  if (S.me && S.character && PUBLIC.has(name)) return go('home');
  const view = routes[name] || homeView;
  renderNav(name === 'world' || name === 'challenge' ? 'map' : ['report', 'fix', 'missions'].includes(name) ? 'log' : routes[name] ? name : 'home');
  app.onclick = null;
  app.classList.toggle('wide', name === 'lead');
  window.scrollTo(0, 0);
  app.innerHTML = `<div class="loading">${t('loading')}</div>`;
  try {
    await view({ args, query, name });
    app.classList.remove('view-in');
    void app.offsetWidth;
    app.classList.add('view-in');
  } catch (e) {
    if (e.code === 'unauthorized') return go('welcome');
    app.innerHTML = `<div class="panel"><div class="error-msg">${esc(errText(e))}</div><button class="btn" onclick="location.reload()">↻</button></div>`;
  }
  refreshPending();
}
function go(path) {
  if (location.hash === '#/' + path) router();
  else location.hash = '#/' + path;
}
window.addEventListener('hashchange', router);

$('#lang-btn').addEventListener('click', async () => {
  setLang(getLang() === 'es' ? 'en' : 'es');
  if (S.me) api('POST', '/me/lang', { lang: getLang() }).catch(() => {});
  router();
});

// ---------- welcome / auth ----------
const HERO_LOOKS = [
  { cls: 'CLS01', look: { hairStyle: 'long', hat: 'veil', hand: 'book', companion: 'dove', outfitColor: 9, accentColor: 7, bottom: 'skirt', eyes: 'sparkle', skin: 1, back: 'none' } },
  { cls: 'CLS02', look: { hairStyle: 'spiky', hat: 'cap', hand: 'none', companion: 'lamb', outfitColor: 0, accentColor: 2, back: 'satchel', eyes: 'bold', mouth: 'grin', skin: 3 } },
  { cls: 'CLS04', look: { hairStyle: 'ponytail', hat: 'headband', hand: 'lantern', companion: 'none', outfitColor: 8, accentColor: 3, eyes: 'happy', skin: 5, hairColor: 0, back: 'none' } },
];

async function welcome() {
  app.innerHTML = `<section class="hero">
    <div class="splash">${art('splash.webp', 'splash-art')}<div class="party">${HERO_LOOKS.map((h) => `<div>${avatarSVG(h.look, { classId: h.cls })}</div>`).join('')}</div></div>
    <h1 class="${getLang() === 'es' ? 'has-logo' : ''}">${getLang() === 'es' ? art('logo.webp', 'logo-art', t('app_name')) : ''}<span>${esc(t('app_name'))}</span></h1>
    <div class="panel dialog-box"><p style="margin:0;font-weight:700">${t('tagline')}</p></div>
    <div class="btn-row" style="flex-direction:column">
      <a class="btn primary block" href="#/login">${t('login')}</a>
      <a class="btn block" href="#/join">${t('have_code')}</a>
    </div></section>`;
}

async function login() {
  app.innerHTML = `<div class="panel"><h2>${t('login')}</h2><div id="err"></div>
    <form id="f" autocomplete="on">
      <label class="field"><span>${t('alias')}</span><input type="text" name="alias" required autocomplete="username" maxlength="20"></label>
      <label class="field"><span>${t('pin')}</span><input type="password" name="pin" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" required autocomplete="current-password"></label>
      <button class="btn primary block" type="submit">${t('login')}</button>
    </form>
    <p style="text-align:center;margin-top:12px"><a href="#/join">${t('have_code')}</a></p></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('POST', '/auth/login', { alias: fd.get('alias'), pin: fd.get('pin') });
      S.me = r.me;
      if (r.me.lang && r.me.lang !== getLang()) setLang(r.me.lang);
      await loadBootstrap();
      toast(t('welcome_back'));
      go(S.character ? 'home' : 'create');
    } catch (err) {
      $('#err').innerHTML = `<div class="error-msg">${esc(errText(err))}</div>`;
    }
  };
}

async function join({ query }) {
  if (S.me) return go('home');
  app.innerHTML = `<div class="panel"><h2>${t('join')}</h2><div id="err"></div>
    <form id="f" autocomplete="off">
      <label class="field"><span>${t('code')}</span><input type="text" name="code" required value="${esc(query.get('code') || '')}" style="text-transform:uppercase;letter-spacing:.15em;font-weight:800" maxlength="20"></label>
      <div class="panel tight" style="box-shadow:none;background:var(--panel-2)"><h3>${t('consent_title')}</h3><p>${t('consent_body')}</p>
        <label class="check"><input type="checkbox" name="consent"> ${t('consent_check')}</label></div>
      <label class="field"><span>${t('alias')}</span><input type="text" name="alias" required maxlength="20" autocomplete="username"><div class="hint">${t('alias_hint')}</div></label>
      ${genderField()}
      <label class="field"><span>${t('pin')}</span><input type="password" name="pin" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" required autocomplete="new-password"><div class="hint">${t('pin_hint')}</div></label>
      <label class="field"><span>${t('pin_confirm')}</span><input type="password" name="pin2" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" required autocomplete="new-password"></label>
      <button class="btn primary block" type="submit">${t('join')}</button>
    </form></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const show = (m) => { $('#err').innerHTML = `<div class="error-msg">${esc(m)}</div>`; window.scrollTo(0, 0); };
    if (fd.get('pin') !== fd.get('pin2')) return show(t('pin_mismatch'));
    try {
      const r = await api('POST', '/auth/redeem', { code: fd.get('code'), alias: fd.get('alias'), pin: fd.get('pin'), consent: !!fd.get('consent'), gender: fd.get('gender'), lang: getLang() });
      S.me = r.me;
      await loadBootstrap();
      go('create');
    } catch (err) { show(errText(err)); }
  };
}

// ---------- character creator ----------
const COLOR_FIELDS = { skin: SKIN, hairColor: HAIR_COLORS, eyeColor: EYE_COLORS, outfitColor: OUTFIT_COLORS, accentColor: OUTFIT_COLORS };
const TABS = {
  class: ['class'], body: ['body', 'skin', 'bottom'], hair: ['hairStyle', 'hairColor'], face: ['eyes', 'eyeColor', 'mouth'],
  outfit: ['outfitColor', 'accentColor'], gear: ['hat', 'back', 'hand'], pal: ['companion'], rewards: ['rewards'],
};
const HEAD_FIELDS = new Set(['hairStyle', 'eyes', 'mouth', 'hat']);

async function creator(edit) {
  let stats = null;
  if (edit) stats = (await api('GET', '/me')).stats;
  const st = {
    classId: S.character?.class_id || 'CLS02',
    look: { ...DEFAULT_LOOK, ...(S.character?.look || {}), want: { ...DEFAULT_LOOK.want, ...(S.character?.look?.want || {}) } },
    motto: S.character?.motto || '',
    tab: edit ? 'body' : 'class',
  };
  const unlocked = stats?.unlocked_cosmetics || ['compass'];
  const preview = () => {
    const show = {};
    for (const c of COSMETICS) show[c] = st.look.want[c] && unlocked.includes(c);
    return avatarSVG({ ...st.look, show }, { classId: st.classId });
  };

  app.innerHTML = `<h1>${edit ? t('edit_character') : t('creator_title')}</h1>
    <div class="creator">
      <div><div class="stage" id="stage"></div></div>
      <div>
        <div class="chips" id="tabs">${Object.keys(TABS).map((k) => `<button class="chip" data-tab="${k}">${t('tab_' + k)}</button>`).join('')}</div>
        <div class="panel" id="opts"></div>
        <div class="panel">
          <label class="field"><span>${t('motto')}</span><input type="text" id="motto" maxlength="60" placeholder="${esc(t('motto_ph'))}" value="${esc(st.motto)}"></label>
          <button class="btn primary block" id="save">${t('save')}</button>
        </div>
      </div>
    </div>`;

  const drawStage = () => {
    $('#stage').innerHTML = preview() + `<button class="btn small gold random" id="rand">🎲 ${t('random')}</button>`;
    $('#rand').onclick = () => {
      const r = randomLook();
      st.look = { ...r, want: st.look.want };
      drawStage(); drawOpts();
    };
  };
  const optLabel = (field, v) => {
    if (field === 'body') return t(v === 'a' ? 'body_a' : 'body_b');
    return t('opt.' + v);
  };
  const thumb = (field, v) => {
    const look = { ...st.look, [field]: v, show: {} };
    if (field === 'companion') return v === 'none' ? '<div style="height:56px;display:grid;place-items:center;font-size:1.6rem">—</div>' : companionSVG(v, 70);
    return avatarSVG(look, { classId: st.classId, crop: HEAD_FIELDS.has(field) ? 'head' : 'full', companion: false, frame: false });
  };
  const drawOpts = () => {
    $$('#tabs .chip').forEach((c) => c.classList.toggle('on', c.dataset.tab === st.tab));
    let h = '';
    for (const field of TABS[st.tab]) {
      if (field === 'class') {
        h += `<div class="class-cards">${S.classes.map((c) => `<button class="class-card ${c.id === st.classId ? 'on' : ''}" data-class="${c.id}">
          ${avatarSVG({ ...st.look, show: {} }, { classId: c.id, crop: 'full', companion: false })}
          <div><b>${esc(tr(c, 'name'))}</b><small>${esc(tr(c, 'style'))}</small></div></button>`).join('')}</div>`;
      } else if (field === 'rewards') {
        h += `<p class="hint">${t('rewards_hint')}</p>` + S.levels.filter((l) => COSMETICS.includes(l.cosmetic)).map((l) => {
          const got = unlocked.includes(l.cosmetic);
          return `<div class="reward-row ${got ? 'got' : ''}"><div class="lv">${l.level}</div><div class="grow"><b>${esc(tr(l, 'prize'))}</b>
            <div class="hint">${got ? '' : t('locked_until') + ' ' + l.level}</div></div>
            <label class="check"><input type="checkbox" data-want="${l.cosmetic}" ${st.look.want[l.cosmetic] ? 'checked' : ''}> ${t('show_reward')}</label></div>`;
        }).join('');
      } else if (COLOR_FIELDS[field]) {
        h += `<div class="opt-group"><h4>${t(field)}</h4><div class="swatches">${COLOR_FIELDS[field].map((c, i) => `<button class="swatch ${st.look[field] === i ? 'on' : ''}" style="background:${c}" data-field="${field}" data-val="${i}" aria-label="${t(field)} ${i + 1}"></button>`).join('')}</div></div>`;
      } else {
        h += `<div class="opt-group"><h4>${t(field)}</h4><div class="thumbs">${LOOK_OPTIONS[field].map((v) => `<button class="thumb ${st.look[field] === v ? 'on' : ''}" data-field="${field}" data-val="${v}">${thumb(field, v)}${esc(optLabel(field, v))}</button>`).join('')}</div></div>`;
      }
    }
    $('#opts').innerHTML = h;
  };
  $('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { st.tab = b.dataset.tab; drawOpts(); } };
  $('#opts').onclick = (e) => {
    const c = e.target.closest('[data-class]');
    if (c) { st.classId = c.dataset.class; drawStage(); drawOpts(); return; }
    const b = e.target.closest('[data-field]');
    if (!b) return;
    const f = b.dataset.field;
    st.look[f] = COLOR_FIELDS[f] ? Number(b.dataset.val) : b.dataset.val;
    drawStage(); drawOpts();
  };
  $('#opts').onchange = (e) => {
    if (e.target.dataset.want) { st.look.want[e.target.dataset.want] = e.target.checked; drawStage(); }
  };
  $('#save').onclick = async () => {
    try {
      const body = { class_id: st.classId, look: st.look, motto: $('#motto').value };
      S.character = await api(edit ? 'PUT' : 'POST', '/characters', body);
      toast(t('saved'));
      if (!edit) confetti();
      go(edit ? 'me' : 'home');
    } catch (err) { toast(errText(err), true); }
  };
  drawStage(); drawOpts();
}

// ---------- map & worlds ----------
async function mapView() {
  const [worlds, members, me] = await Promise.all([api('GET', '/worlds'), api('GET', '/members'), api('GET', '/me')]);
  S.character = me.character;
  const active = worlds.find((p) => p.world.status === 'active');
  const finished = worlds.every((p) => p.world.status === 'unlocked');
  const party = [{ look: me.character.look, class_id: me.character.class_id }, ...members.filter((m) => m.id !== S.me.id)];
  let head = '';
  if (finished) {
    head = `<div class="panel" style="text-align:center"><h2>🎉 ${t('victory')}</h2><a class="btn gold" href="#/celebrate">${t('see_celebration')}</a></div>`;
  } else if (active) {
    const w = active.world;
    head = `<div class="panel">
      ${worldArt(w, 'world-art banner')}
      <div class="panel-title"><div><div class="hint" style="margin:0;font-weight:800">${t('current_world')} ${w.ord}/6</div><h2>${esc(tr(w, 'name'))}</h2></div>${worldStatusPill(w.status)}</div>
      ${active.challenge ? `<p style="font-weight:700;margin:4px 0 0">🎯 ${esc(chText(active.challenge))}</p>` : ''}
      ${w.star_target ? bar('⭐ ' + t('stars'), active.stars, w.star_target, 'gold') : ''}
      ${active.challenge ? challengeBar(active.challenge) : bar('🔑 ' + esc(tr(w, 'obstacle')), active.tag_count, w.tag_target)}
      ${!active.challenge && w.distinct_min ? bar('👥 ' + t('people'), active.distinct, w.distinct_min, 'blue') : ''}
      ${active.eligible ? `<p style="margin-top:12px;font-weight:800;color:var(--green-d)">✨ ${t('eligible')}</p>` : ''}
      <div class="btn-row" style="margin-top:14px">${active.challenge
        ? `<a class="btn gold" href="#/challenge/${w.id}">🎯 ${t('see_challenge')}</a>`
        : `<a class="btn" href="#/world/${w.id}">ℹ️ ${esc(tr(w, 'obstacle'))}</a>`}<a class="btn primary" href="#/log">＋ ${t('log_activity')}</a></div>
    </div>`;
  }
  const keys = worlds.map((p) => `<div class="key-slot ${p.world.status === 'unlocked' ? 'got' : ''}" title="${esc(tr(p.world, 'key'))}">${p.world.status === 'unlocked' ? '🔑' : ''}</div>`).join('');
  app.innerHTML = head
    + `<div class="map-wrap" id="map">${mapSVG(worlds, party, getLang())}</div>`
    + `<div class="panel tight"><div class="panel-title"><h3>${t('keys')}</h3></div><div class="keys">${keys}</div></div>`;
  walkParty(active?.world.id);
  $('#map').addEventListener('click', (e) => { const n = e.target.closest('[data-world]'); if (n) go('world/' + n.dataset.world); });
  $('#map').addEventListener('keydown', (e) => { const n = e.target.closest('[data-world]'); if (n && (e.key === 'Enter' || e.key === ' ')) go('world/' + n.dataset.world); });
}

// After a world opens, the party walks from the old world to the new one.
function walkParty(toId) {
  let from = '';
  try { from = sessionStorage.getItem('walk') || ''; sessionStorage.removeItem('walk'); } catch { /* storage blocked */ }
  const g = $('#map .party');
  if (!g || !from || !NODES[from] || !NODES[toId]) return;
  // CSS lengths on SVG elements are in the map's own units (400 x 760).
  const dx = NODES[from].x - NODES[toId].x;
  const dy = NODES[from].y - NODES[toId].y;
  g.style.transform = `translate(${dx}px, ${dy}px)`;
  $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    g.style.transition = 'transform 2.6s cubic-bezier(.45,.05,.35,1)';
    g.style.transform = 'translate(0, 0)';
    setTimeout(() => play('star'), 2500);
  }));
}

async function worldView({ args }) {
  const p = await api('GET', '/worlds/' + args[0]);
  const w = p.world;
  const tick = (ok, label) => `<li><span class="tick ${ok ? 'ok' : ''}">${ok ? '✔' : ''}</span>${label}</li>`;
  let paths = '';
  if (p.paths) paths = `<ul class="req-list" style="margin-top:8px">${p.paths.map((x) => tick(x.done, t('paths.' + x.path))).join('')}</ul>`;
  app.innerHTML = `<div class="panel">
      ${worldArt(w, 'world-art banner')}
      <div class="world-head"><div class="world-badge ${w.status}">${w.status === 'unlocked' ? '🔑' : w.status === 'locked' ? '🔒' : w.ord}</div>
        <div><h1 style="margin:0">${esc(tr(w, 'name'))}</h1>${worldStatusPill(w.status)}</div></div>
      <p class="story" style="margin-top:12px">${esc(tr(w, 'story'))}</p>
    </div>
    ${p.challenge ? `<div class="panel"><h2>🎯 ${t('challenge')}</h2><p style="font-weight:700">${esc(chText(p.challenge))}</p>
      ${w.star_target ? bar('⭐ ' + t('stars'), p.stars, w.star_target, 'gold') : ''}
      ${challengeBar(p.challenge)}
      <h3 style="margin-top:16px">${t('requirements')}</h3>
      <ul class="req-list">
        ${w.star_target ? tick(p.checks.stars, '⭐ ' + t('stars')) : ''}
        ${tick(p.checks.challenge, '🎯 ' + t(p.challenge.type === 'pair' ? 'pair_challenge' : 'group_challenge'))}
        ${w.ord > 1 ? tick(p.checks.previous, t('prev_world')) : ''}
      </ul>
      ${w.status !== 'locked' ? `<a class="btn gold block" style="margin:12px 0" href="#/challenge/${w.id}">🎯 ${t('see_challenge')}</a>` : ''}`
    : `<div class="panel"><h2>🚧 ${esc(tr(w, 'obstacle'))}</h2><p>${esc(tr(w, 'rule'))}</p>
      ${w.star_target ? bar('⭐ ' + t('stars'), p.stars, w.star_target, 'gold') : ''}
      ${bar('🔑 ' + t('obstacle'), p.tag_count, w.tag_target)}
      ${paths}
      ${w.distinct_min ? bar('👥 ' + t('people'), p.distinct, w.distinct_min, 'blue') : ''}
      <h3 style="margin-top:16px">${t('requirements')}</h3>
      <ul class="req-list">
        ${w.star_target ? tick(p.checks.stars, '⭐ ' + t('stars')) : ''}
        ${tick(p.checks.obstacle, '🔑 ' + esc(tr(w, 'obstacle')))}
        ${w.distinct_min ? tick(p.checks.distinct, '👥 ' + t('people')) : ''}
        ${w.ord > 1 ? tick(p.checks.previous, t('prev_world')) : ''}
      </ul>`}
      ${p.pending_claims ? `<p class="hint">⏳ ${p.pending_claims} ${t('pending_claims')}</p>` : ''}
      ${p.eligible ? `<p style="font-weight:800;color:var(--green-d)">✨ ${t('eligible')}</p>` : ''}
      ${p.eligible && isCoord() ? `<button class="btn gold block" id="unlock">🔑 ${t('confirm_unlock')}</button>` : ''}
    </div>
    <div class="panel tight"><p style="margin:0"><b>🎁 ${esc(tr(w, 'key'))}</b> · ${esc(tr(w, 'reward'))}</p>
      <p class="hint" style="margin:6px 0 0">${t('suggested_dates')}: ${fmtDate(w.start)} – ${fmtDate(w.end)}. ${t('no_rush')}</p></div>
    ${w.status === 'active' ? `<a class="btn primary block" href="#/log">＋ ${t('log_activity')}</a>` : ''}`;
  $('#unlock')?.addEventListener('click', async () => {
    if (!(await ask(t('confirm_unlock') + '?', { okLabel: t('yes') }))) return;
    try {
      const r = await api('POST', `/worlds/${w.id}/unlock`, {});
      confetti();
      toast(t('unlocked_ok'));
      go(r.next ? 'map' : 'celebrate');
    } catch (err) { toast(errText(err), true); }
  });
}

// ---------- world challenge (pairs / group fruit) ----------
const chText = (ch) => (getLang() === 'en' ? ch.en || ch.es : ch.es) || '';
const itemLabel = (it) => (getLang() === 'en' ? it.en : it.es);
function challengeBar(ch) {
  if (ch.type === 'pair') return bar('👥 ' + t('members_done'), ch.done, ch.members, 'blue');
  return bar((ch.type === 'keeping' ? '🌱 ' + t('keeping') : '🍇 ' + t('fruits')), ch.count, ch.target, 'blue');
}
const nowLocal = () => { const d = new Date(); return localDate(d) + 'T' + d.toTimeString().slice(0, 5); };

function genderField(current = '') {
  return `<div class="field"><span style="font-weight:800;display:block;margin-bottom:6px">${t('gender')}</span><div class="gender-pick">
    ${['brother', 'sister'].map((g) => `<label class="gender-opt"><input type="radio" name="gender" value="${g}" required ${current === g ? 'checked' : ''}><span>${g === 'brother' ? '👨' : '👩'} ${t(g)}</span></label>`).join('')}
  </div></div>`;
}

async function genderView() {
  if (S.me.gender) return go('home');
  app.innerHTML = `<div class="panel"><h2>${t('gender_title')}</h2><p>${t('gender_body')}</p><form id="gf">${genderField()}
    <button class="btn primary block">${t('save')}</button></form></div>`;
  $('#gf').onsubmit = async (e) => {
    e.preventDefault();
    const g = new FormData(e.target).get('gender');
    try {
      await api('POST', '/me/gender', { gender: g });
      S.me.gender = g;
      go(S.character ? 'home' : 'create');
    } catch (err) { toast(errText(err), true); }
  };
}

// Small form to log progress for one pair; used for my pair and by coordinators.
function progressFormHTML(ch, pairId) {
  return `<form class="progress-form" data-pair="${pairId}">
    ${ch.items.length > 1 ? `<div class="chips">${ch.items.map((it, i) => `<label class="chip"><input type="radio" name="item" value="${it.key}" ${i === 0 ? 'checked' : ''} style="display:none"> ${esc(itemLabel(it))}</label>`).join('')}</div>`
      : `<input type="hidden" name="item" value="${ch.items[0].key}">`}
    <div class="stepper" style="margin:10px 0"><button type="button" data-step="-1" aria-label="-">−</button><output name="amount">1</output><button type="button" data-step="1" aria-label="+">+</button>
      <span class="hint">${esc(itemLabel(ch.items[0]))}</span></div>
    <label class="field"><span>${t('when_done')}</span><input type="datetime-local" name="done_at" value="${nowLocal()}" max="${nowLocal()}"></label>
    <button class="btn green block">✔ ${t('save_progress')}</button></form>`;
}

function wireProgressForms(root, ch, onDone) {
  root.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) {
      const out = $('output[name=amount]', step.closest('form'));
      out.textContent = Math.max(1, Math.min(200, Number(out.textContent) + Number(step.dataset.step)));
    }
    const chip = e.target.closest('.progress-form .chip');
    if (chip) {
      const f = chip.closest('form');
      $$('.chip', f).forEach((c) => c.classList.toggle('on', c === chip));
      const it = ch.items.find((x) => x.key === $('input', chip).value);
      $('.stepper .hint', f).textContent = itemLabel(it);
    }
  });
  $$('.progress-form', root).forEach((f) => { $('.chip', f)?.classList.add('on'); });
  root.addEventListener('submit', async (e) => {
    const f = e.target.closest('.progress-form');
    if (!f) return;
    e.preventDefault();
    const btn = $('button.green', f);
    btn.disabled = true;
    try {
      const r = await api('POST', `/pairs/${f.dataset.pair}/progress`, {
        item: (f.querySelector('input[name=item]:checked') || f.querySelector('input[name=item]')).value,
        amount: Number($('output[name=amount]', f).textContent), done_at: f.elements.done_at.value,
      });
      if (r.completed) { confetti(); toast('🎉 ' + t('st_done')); } else toast(t('saved'));
      onDone();
    } catch (err) { toast(errText(err), true); btn.disabled = false; }
  });
}

async function challengeView({ args }) {
  let worldId = args[0];
  if (!worldId) {
    const ws = await api('GET', '/worlds');
    worldId = (ws.find((p) => p.world.status === 'active') || ws[ws.length - 1]).world.id;
  }
  const [b, members] = await Promise.all([api('GET', '/challenge/' + worldId), api('GET', '/members')]);
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const face = (id) => (byId[id] ? avatarSVG({ ...byId[id].look, show: {} }, { classId: byId[id].class_id, crop: 'head' }) : '');
  const name = (id) => esc(byId[id]?.alias || '—');
  const w = b.world;
  const ch = b.challenge;
  const live = w.status === 'active';
  const reload = () => challengeView({ args: [worldId] });

  let h = `<div class="panel">${worldArt(w, 'world-art banner')}
    <div class="hint" style="margin:0;font-weight:800">${esc(tr(w, 'name'))} · ${worldStatusPill(w.status)}</div>
    <h1 style="margin:4px 0">🎯 ${t(ch.type === 'pair' ? 'pair_challenge' : 'group_challenge')}</h1>
    <p style="font-weight:700;font-size:1.05rem">${esc(chText(ch))}</p>${challengeBar(ch)}</div>`;

  if (ch.type !== 'pair') {
    const def = ch.type === 'keeping' ? 'PRE05' : 'PRE04';
    h += `<div class="panel"><h2>${t('fruits_list')}</h2><p class="hint">${t('fruit_hint')}</p>
      ${b.fruits.length ? b.fruits.map((f) => `<div class="reward-row"><span class="code">🌱 ${esc(f.token || '—')}</span><div class="grow">${esc(f.alias)} · ${fmtDate(f.performed_at)}</div>${statusPill(f.status)}</div>`).join('') : '<p>—</p>'}
      ${live ? `<a class="btn primary block" style="margin-top:12px" href="#/report/${def}">${t(ch.type === 'keeping' ? 'report_keeping' : 'report_fruit')}</a>` : ''}</div>`;
    app.innerHTML = h;
    return;
  }

  const statusOf = (p) => (p.complete ? 'done' : p.needs_support ? 'support' : p.started ? 'progress' : 'none');
  const pill = (st) => `<span class="status-pill ${{ done: 'approved', support: 'needs_changes', progress: 'pending', none: '' }[st]}">${{ done: '✅', support: '🙋', progress: '🟡', none: '⏳' }[st]} ${t('st_' + st)}</span>`;
  const progText = (p) => ch.items.map((it) => `${esc(itemLabel(it))}: <b>${Math.min(p.progress[it.key] || 0, 9999)}/${it.target}</b>`).join(' · ');
  const faces = (ids) => `<span class="pair-faces">${ids.map((id) => `<span>${face(id)}</span>`).join('')}</span>`;
  const my = b.my;
  const myPair = b.pairs.find((p) => p.mine);

  // My pair / choosing a partner
  if (my.excused) {
    h += `<div class="panel"><p style="margin:0">${t('excused_you')}</p></div>`;
  } else if (myPair) {
    h += `<div class="panel"><div class="panel-title"><h2>${t('my_pair')}</h2>${pill(statusOf(myPair))}</div>
      <div class="pair-row">${faces(myPair.members)}<b>${myPair.members.map(name).join(' & ')}</b></div>
      ${ch.items.map((it) => bar(esc(itemLabel(it)), myPair.progress[it.key] || 0, it.target)).join('')}
      ${live && !myPair.complete ? `<h3 style="margin-top:16px">${t('log_progress')}</h3>${progressFormHTML(ch, myPair.id)}
        <button class="btn small ${myPair.needs_support ? '' : 'blue'}" style="margin-top:10px" id="support">${myPair.needs_support ? t('support_off') : t('need_support')}</button>` : ''}
      ${myPair.entries?.length ? `<h3 style="margin-top:16px">${t('progress_log')}</h3>${myPair.entries.map((e) => `<div class="reward-row"><div class="grow"><b>+${e.amount}</b> ${esc(itemLabel(ch.items.find((it) => it.key === e.item_key) || { es: e.item_key, en: e.item_key }))}
        <div class="hint" style="margin:0">${fmtDate(e.done_at.slice(0, 10))} ${esc(e.done_at.slice(11, 16))} · ${esc(e.actor)}</div></div>
        ${live && (e.actor_id === S.me.id || isCoord()) ? `<button class="link-btn" data-remove="${e.id}">${t('remove')}</button>` : ''}</div>`).join('')}` : ''}</div>`;
  } else if (live) {
    h += `<div class="panel"><h2>${t('choose_partner')}</h2><p class="hint">${t('choose_hint')}</p>
      ${my.incoming.map((i) => `<div class="claim"><div class="pair-row">${faces([i.from])}<div><b>${name(i.from)}</b> ${t('invited_you')}</div></div>
        <div class="btn-row" style="margin-top:8px"><button class="btn small green" data-respond="${i.id}" data-accept="1">✔ ${t('accept')}</button><button class="btn small" data-respond="${i.id}" data-accept="0">${t('decline')}</button></div></div>`).join('')}
      ${my.outgoing.map((o) => `<div class="claim"><div class="pair-row">${faces([o.to])}<div>⏳ ${t('waiting_for')} <b>${name(o.to)}</b></div></div>
        <button class="link-btn" data-respond="${o.id}" data-accept="0">${t('cancel_invite')}</button></div>`).join('')}
      ${my.candidates.length ? `<div class="people-grid">${my.candidates.map((id) => `<button type="button" class="person" data-invite="${id}"><span class="face">${face(id)}</span><span>${name(id)}</span></button>`).join('')}</div>`
        : `<p>${t('no_candidates')}</p>`}</div>`;
  }

  // Board for everyone
  const order = { support: 0, none: 1, progress: 2, done: 3 };
  const sorted = [...b.pairs].sort((x, y) => order[statusOf(x)] - order[statusOf(y)]);
  h += `<div class="panel"><h2>${t('board')}</h2><p class="hint">${t('board_hint')}</p>
    ${sorted.map((p) => `<div class="claim board-pair" data-pid="${p.id}"><div class="top"><div class="pair-row">${faces(p.members)}<b>${p.members.map(name).join(' & ')}</b></div>${pill(statusOf(p))}</div>
      <div class="sub" style="margin-top:4px">${progText(p)}</div>
      <div class="btn-row" style="margin-top:8px;align-items:center">
        ${!p.complete ? `<button class="btn small ${p.i_pray ? 'gold' : ''}" data-pray="${p.id}">${p.i_pray ? t('praying') : t('pray')}${p.prayers ? ` · ${p.prayers}` : ''}</button>` : ''}
        ${isCoord() && live ? `<button class="btn small" data-logfor="${p.id}" title="${t('log_for')}" aria-label="${t('log_for')}">📝</button>${p.members.length < 3 ? `<button class="btn small" data-third="${p.id}" title="${t('add_third')}" aria-label="${t('add_third')}">➕ 3</button>` : ''}<button class="btn small primary" data-dissolve="${p.id}" title="${t('dissolve')}" aria-label="${t('dissolve')}">✖</button>` : ''}
      </div></div>`).join('') || '<p>—</p>'}
    ${b.unpaired.length ? `<h3 style="margin-top:16px">${t('unpaired')} (${b.unpaired.length})</h3><div class="unpaired">${b.unpaired.map((id) => `<span class="chip" style="cursor:default">${name(id)}${isCoord() && live ? ` <button class="link-btn" data-excuse="${id}">${t('excuse')}</button>` : ''}</span>`).join('')}</div>` : ''}
    ${b.excused.length ? `<h3 style="margin-top:16px">${t('excused')}</h3><div class="unpaired">${b.excused.map((x) => `<span class="chip" style="cursor:default">${esc(x.alias)}${x.reason ? ` · ${esc(x.reason)}` : ''}${isCoord() && live ? ` <button class="link-btn" data-unexcuse="${x.user_id}">${t('unexcuse')}</button>` : ''}</span>`).join('')}</div>` : ''}
  </div>`;

  // Coordinator: make a pair from the people without one
  if (isCoord() && live && b.unpaired_detail?.length >= 2) {
    h += `<div class="panel"><h2>${t('coord_tools')}</h2><h3>${t('make_pair')}</h3><p class="hint">${t('make_pair_hint')}</p>
      <div class="people-grid" id="mk">${b.unpaired_detail.map((u) => `<button type="button" class="person" data-pick="${u.id}"><span class="face">${face(u.id)}</span><span>${name(u.id)}</span><span class="hint" style="margin:0">${u.gender ? t(u.gender) : '—'}</span></button>`).join('')}</div>
      <button class="btn green" style="margin-top:10px" id="mkgo">${t('make_pair')}</button></div>`;
  }
  app.innerHTML = `<div id="chv">${h}</div>`;
  const root = $('#chv');
  wireProgressForms(root, ch, reload);
  const call = async (method, path, body, msg) => {
    try { await api(method, path, body); if (msg) toast(msg); reload(); } catch (err) { toast(errText(err), true); }
  };
  const picked = new Set();
  root.onclick = async (e) => {
    const el = (sel) => e.target.closest(sel);
    if (el('#support')) return call('POST', `/pairs/${myPair.id}/support`, { on: !myPair.needs_support });
    if (el('[data-remove]')) { if (await ask(t('remove') + '?', { danger: true })) call('DELETE', '/progress/' + el('[data-remove]').dataset.remove, {}); return; }
    if (el('[data-respond]')) { const r = el('[data-respond]'); return call('POST', `/pairs/${r.dataset.respond}/respond`, { accept: r.dataset.accept === '1' }); }
    if (el('[data-invite]')) {
      const id = Number(el('[data-invite]').dataset.invite);
      if (await ask(`${t('invite_partner')}: ${byId[id]?.alias}?`, { okLabel: t('invite_partner') })) call('POST', `/challenge/${worldId}/request`, { partner_id: id }, t('saved'));
      return;
    }
    if (el('[data-pray]')) return call('POST', `/pairs/${el('[data-pray]').dataset.pray}/pray`, {});
    if (el('[data-dissolve]')) { if (await ask(t('dissolve') + '?', { danger: true })) call('DELETE', '/pairs/' + el('[data-dissolve]').dataset.dissolve, {}); return; }
    if (el('[data-excuse]')) {
      const reason = await ask(t('excuse'), { input: true, placeholder: t('reason_ph'), okLabel: t('excuse') });
      if (reason) call('POST', `/challenge/${worldId}/excuse`, { user_id: Number(el('[data-excuse]').dataset.excuse), excused: true, reason });
      return;
    }
    if (el('[data-unexcuse]')) return call('POST', `/challenge/${worldId}/excuse`, { user_id: Number(el('[data-unexcuse]').dataset.unexcuse), excused: false });
    if (el('[data-pick]')) {
      const b2 = el('[data-pick]'); const id = Number(b2.dataset.pick);
      picked.has(id) ? picked.delete(id) : picked.add(id);
      b2.classList.toggle('on', picked.has(id));
      return;
    }
    if (el('#mkgo')) return call('POST', `/challenge/${worldId}/pairs`, { ids: [...picked] }, t('saved'));
    if (el('[data-third]')) {
      const pid = el('[data-third]').dataset.third;
      const m = modal(`<h3>${t('add_third')}</h3><div class="people-grid">${b.unpaired.map((id) => `<button type="button" class="person" data-add="${id}"><span class="face">${face(id)}</span><span>${name(id)}</span></button>`).join('') || '<p>—</p>'}</div>
        <button class="btn block" style="margin-top:10px" id="mclose">${t('cancel')}</button>`);
      $('#mclose', m.el).onclick = m.close;
      m.el.onclick = (ev) => { const a = ev.target.closest('[data-add]'); if (a) { m.close(); call('POST', `/pairs/${pid}/add`, { user_id: Number(a.dataset.add) }, t('saved')); } };
      return;
    }
    if (el('[data-logfor]')) {
      const pid = el('[data-logfor]').dataset.logfor;
      const p = b.pairs.find((x) => String(x.id) === pid);
      const m = modal(`<h3>${t('log_for')}</h3><p><b>${p.members.map(name).join(' & ')}</b></p><div class="sub" style="margin-bottom:8px">${progText(p)}</div>
        ${progressFormHTML(ch, pid)}
        ${p.entries?.length ? `<h3 style="margin-top:12px">${t('progress_log')}</h3>${p.entries.map((e2) => `<div class="reward-row"><div class="grow">+${e2.amount} ${esc(itemLabel(ch.items.find((it) => it.key === e2.item_key) || { es: e2.item_key, en: e2.item_key }))} · ${esc(e2.actor)}</div><button class="link-btn" data-mremove="${e2.id}">${t('remove')}</button></div>`).join('')}` : ''}
        <button class="btn block" style="margin-top:10px" id="mclose">${t('cancel')}</button>`);
      $('#mclose', m.el).onclick = m.close;
      wireProgressForms(m.el, ch, () => { m.close(); reload(); });
      m.el.addEventListener('click', (ev) => { const r = ev.target.closest('[data-mremove]'); if (r) { m.close(); call('DELETE', '/progress/' + r.dataset.mremove, {}); } });
    }
  };
}

// ---------- game moments: level up and new world ----------
// Remembers per device what the member has already seen, then celebrates anything new.
function seenState() {
  try { return JSON.parse(localStorage.getItem('seen:' + S.me.id) || 'null'); } catch { return null; }
}
function saveSeen(v) { try { localStorage.setItem('seen:' + S.me.id, JSON.stringify(v)); } catch { /* storage blocked */ } }

async function checkMoments(worlds, stats, members) {
  const unlocked = worlds.filter((p) => p.world.status === 'unlocked').length;
  const seen = seenState();
  saveSeen({ unlocked, level: stats.level });
  if (!seen) return;
  if (unlocked > seen.unlocked) {
    const next = worlds.find((p) => p.world.status === 'active')?.world;
    const opened = worlds.filter((p) => p.world.status === 'unlocked').pop()?.world;
    try { sessionStorage.setItem('walk', opened?.id || ''); } catch { /* storage blocked */ }
    play('unlock');
    confetti();
    const m = modal(`<div class="moment">
      <div class="moment-key">🔑</div>
      <h2>${next ? t('new_world') : t('victory')}</h2>
      ${next ? worldArt(next, 'world-art') : art('victory.webp', 'world-art', t('victory'))}
      <h3 style="margin:10px 0 4px">${next ? esc(tr(next, 'name')) : ''}</h3>
      <p>${next ? esc(tr(next, 'story')) : t('victory_body')}</p>
      <div class="moment-party">${(members || []).slice(0, 12).map((x) => avatarSVG({ ...x.look, show: {} }, { classId: x.class_id, frame: false, companion: false })).join('')}</div>
      <a class="btn gold block" href="#/${next ? 'map' : 'celebrate'}" id="mgo">${next ? t('walk_there') : t('see_celebration')}</a></div>`);
    $('#mgo', m.el).addEventListener('click', m.close);
    return;
  }
  if (stats.level > seen.level) {
    const lvl = S.levels.find((l) => l.level === stats.level);
    play('level');
    confetti();
    const m = modal(`<div class="moment">
      <div class="moment-badge">${stats.level}</div>
      <h2>${t('level_up')}</h2>
      <div class="moment-avatar">${avatarSVG(S.character.look, { classId: S.character.class_id })}</div>
      <h3 style="margin:8px 0 4px">${esc(tr(lvl, 'title'))}</h3>
      <p>🎁 ${esc(tr(lvl, 'prize'))}</p>
      <button class="btn gold block" id="mok">${t('ok')}</button></div>`);
    $('#mok', m.el).onclick = m.close;
  }
}

// ---------- home ("Hoy") ----------
const timeAgo = (d) => {
  const ms = Date.now() - new Date(d.replace(' ', 'T') + (d.includes('Z') ? '' : 'Z')).getTime();
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return t('ago_min', { n: min });
  const h = Math.round(min / 60);
  return h < 24 ? t('ago_h', { n: h }) : fmtDate(d);
};

async function homeView() {
  const [worlds, me, members, feed, notices] = await Promise.all([api('GET', '/worlds'), api('GET', '/me'), api('GET', '/members'), api('GET', '/feed'), api('GET', '/news')]);
  S.character = me.character;
  const s = me.stats;
  const active = worlds.find((p) => p.world.status === 'active');
  const finished = worlds.every((p) => p.world.status === 'unlocked');
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const head = (id) => (byId[id] ? avatarSVG({ ...byId[id].look, show: {} }, { classId: byId[id].class_id, crop: 'head' }) : '');
  const lvl = S.levels.find((l) => l.level === s.level);

  let h = '';
  if (finished) {
    h += `<a class="hero-world" href="#/celebrate">${art('victory.webp', 'hero-img')}<div class="hero-text"><small>${t('journey_done')}</small><b>🎉 ${t('victory')}</b></div></a>`;
  } else if (active) {
    const w = active.world;
    h += `<a class="hero-world" href="#/world/${w.id}">${worldArt(w, 'hero-img')}
      <div class="hero-text"><small>${t('world_n', { n: w.ord })}</small><b>${esc(tr(w, 'name'))}</b></div>
      <div class="hero-me">${avatarSVG(me.character.look, { classId: me.character.class_id, frame: false })}</div></a>`;
  }
  h += `<a class="btn primary block big-cta" href="#/log">＋ ${t('log_activity')}</a>`;

  // My numbers
  h += `<div class="stat-grid home-stats">
    <div class="stat"><b>⭐ ${s.xp}</b><span>${t('my_stars')}</span></div>
    <div class="stat"><b>+${s.today_stars}</b><span>${t('today')}</span></div>
    <a class="stat" href="#/me"><b>${s.level}</b><span>${esc(tr(lvl, 'title'))}</span></a></div>`;

  // Group progress + my pair
  if (active) {
    const w = active.world;
    const ch = active.challenge;
    h += `<div class="panel"><div class="panel-title"><h2>${t('group_progress')}</h2>${worldStatusPill(w.status)}</div>
      ${w.star_target ? bar('⭐ ' + t('stars'), active.stars, w.star_target, 'gold') : ''}
      ${ch ? `<p style="font-weight:700;margin:12px 0 0">🎯 ${esc(chText(ch))}</p>${challengeBar(ch)}` : ''}
      ${active.eligible ? `<p style="margin:12px 0 0;font-weight:800;color:var(--green-d)">✨ ${t('eligible')}</p>` : ''}</div>`;
    if (ch?.type === 'pair') {
      const b = await api('GET', '/challenge/' + w.id);
      const mine = b.pairs.find((p) => p.mine);
      if (mine) {
        h += `<a class="panel pair-card" href="#/challenge/${w.id}"><div class="panel-title"><h2>${t('my_pair')}</h2><span class="chev">›</span></div>
          <div class="pair-row"><span class="pair-faces">${mine.members.map((id) => `<span>${head(id)}</span>`).join('')}</span><b>${mine.members.map((id) => esc(byId[id]?.alias || '')).join(' & ')}</b></div>
          ${ch.items.map((it) => bar(esc(itemLabel(it)), mine.progress[it.key] || 0, it.target)).join('')}
          ${mine.complete ? `<p style="margin:10px 0 0;font-weight:800;color:var(--green-d)">✅ ${t('st_done')}</p>` : `<span class="btn small gold" style="margin-top:12px">📝 ${t('log_progress')}</span>`}</a>`;
      } else if (!b.my.excused) {
        const invites = b.my.incoming.length;
        h += `<a class="panel pair-card need" href="#/challenge/${w.id}"><div class="panel-title"><h2>🤝 ${t('choose_partner')}</h2><span class="chev">›</span></div>
          <p style="margin:0">${invites ? `<b>${t('you_have_invites', { n: invites })}</b>` : t('choose_hint')}</p></a>`;
      }
    } else if (ch) {
      h += `<a class="panel pair-card" href="#/challenge/${w.id}"><div class="panel-title"><h2>🍇 ${t('group_challenge')}</h2><span class="chev">›</span></div>
        <p style="margin:0">${t('fruit_hint')}</p></a>`;
    }
  }

  // Notices from coordinators
  if (notices.length) {
    h += `<div class="panel"><h2>📣 ${t('notices')}</h2>${notices.slice(0, 3).map((n) => `<div class="news-item"><time>${fmtDate(n.at)}</time><h3 style="margin:2px 0">${esc(n.title)}</h3>${n.body ? `<p style="margin:0">${esc(n.body)}</p>` : ''}</div>`).join('')}</div>`;
  }

  // Group activity
  h += `<div class="panel"><h2>${t('group_activity')}</h2>${feed.length ? feed.map((f) => `<div class="feed-row"><span class="feed-face">${head(f.user_id)}</span>
      <div class="grow"><b>${esc(f.alias)}</b>${f.others ? ` +${f.others}` : ''} · ${esc(tr(f, 'name'))}<div class="hint" style="margin:0">${timeAgo(f.updated_at)}</div></div>
      <span class="feed-pts">+${f.quantity * f.points_per_unit} ⭐</span></div>`).join('') : `<p>${t('feed_empty')}</p>`}</div>`;

  app.innerHTML = h;
  checkMoments(worlds, s, members);
}

// ---------- log an activity ----------
const GROUPS = [
  { cat: 'preaching', icon: '📣' }, { cat: 'education', icon: '📖' },
  { cat: 'shepherd', icon: '🐑' }, { cat: 'service', icon: '🤲' },
];

async function logView({ query }) {
  const [defs, worlds] = await Promise.all([api('GET', '/missions'), api('GET', '/worlds')]);
  const active = worlds.find((p) => p.world.status === 'active');
  let cat = query.get('cat') || '';
  const draw = () => {
    let h = `<h1>${t('what_did_you_do')}</h1>`;
    if (active?.challenge) {
      h += `<a class="panel tight challenge-banner" href="#/challenge/${active.world.id}">🎯 <span><b>${t('challenge')}:</b> ${esc(chText(active.challenge))}</span><span class="chev">›</span></a>`;
    }
    h += `<div class="group-tiles">${GROUPS.map((g) => `<button class="group-tile cat-${g.cat} ${cat === g.cat ? 'on' : ''}" data-cat="${g.cat}">
      <span class="gt-icon">${g.icon}</span><span class="gt-name">${t('grp.' + g.cat)}</span><span class="gt-sub">${defs.filter((d) => d.category === g.cat).length} ${t('activities')}</span></button>`).join('')}</div>`;
    if (cat) {
      h += `<div class="mission-list" style="margin-top:16px">${defs.filter((d) => d.category === cat).map((d) => {
        const capped = d.daily_cap != null && d.used_today >= d.daily_cap;
        return `<button class="mission" data-id="${d.id}" ${capped ? 'disabled' : ''}>
          <span class="ico cat-${d.category}">${GROUPS.find((g) => g.cat === d.category)?.icon || '⭐'}</span>
          <span class="body"><span class="name">${esc(tr(d, 'name'))}</span>
            <span class="meta"><span>${esc(tr(d, 'freq'))}</span>${capped ? `<span class="tag">✔ ${t('done_today')}</span>` : ''}</span></span>
          <span class="pts">+${d.points}</span></button>`;
      }).join('')}</div>`;
    }
    app.innerHTML = h;
  };
  draw();
  app.onclick = (e) => {
    const g = e.target.closest('[data-cat]');
    if (g) { play('tap'); cat = cat === g.dataset.cat ? '' : g.dataset.cat; history.replaceState(null, '', '#/log' + (cat ? '?cat=' + cat : '')); draw(); return; }
    const m = e.target.closest('.mission[data-id]');
    if (m && !m.disabled) go('report/' + m.dataset.id);
  };
}

async function report({ args, name }) {
  const fixing = name === 'fix';
  const [defs, members, mine] = await Promise.all([api('GET', '/missions'), api('GET', '/members'), fixing ? api('GET', '/claims/mine') : null]);
  const claim = fixing ? mine.find((c) => c.id === Number(args[0])) : null;
  if (fixing && !claim) return go('me');
  const def = defs.find((d) => d.id === (fixing ? claim.def_id : args[0]));
  if (!def) return go('log');
  const others = members.filter((m) => m.id !== S.me.id);
  const st = { qty: claim?.quantity || 1, date: claim?.performed_at || localDate(), people: new Set((claim?.participants || []).map((p) => p.id)), key: newKey() };
  const maxQty = def.daily_cap != null ? Math.max(1, def.daily_cap - (fixing ? 0 : def.used_today)) : 200;
  const showQty = def.daily_cap !== 1;
  const today = localDate();
  const yesterday = localDate(new Date(Date.now() - 86400e3));
  const minDate = localDate(new Date(Date.now() - 14 * 86400e3));
  const icon = GROUPS.find((g) => g.cat === def.category)?.icon || '⭐';

  app.innerHTML = `<div class="panel report-head cat-${def.category}">
      <span class="gt-icon">${icon}</span>
      <div class="grow"><h2 style="margin:0">${esc(tr(def, 'name'))}</h2><div class="hint" style="margin:0">${esc(tr(def, 'freq'))}</div></div>
      <span class="pts">+${def.points} ⭐</span></div>
    ${claim?.coord_message ? `<div class="panel tight"><div class="coord-msg">💬 ${esc(claim.coord_message)}</div></div>` : ''}
    <form id="f" class="panel">
      ${showQty ? `<div class="field"><span style="font-weight:800;display:block;margin-bottom:6px">${t('quantity')}</span>
        <div class="stepper"><button type="button" data-q="-1" aria-label="-">−</button><output id="qty">${st.qty}</output><button type="button" data-q="1" aria-label="+">+</button>
        <span class="hint" id="qpts"></span></div></div>` : ''}
      <div class="field" style="margin-top:14px"><span style="font-weight:800;display:block;margin-bottom:6px">${t('date')}</span>
        <div class="chips"><button type="button" class="chip" data-date="${today}">${t('today')}</button><button type="button" class="chip" data-date="${yesterday}">${t('yesterday')}</button>
        <input type="date" id="date" value="${st.date}" min="${minDate}" max="${today}" style="width:auto;min-height:40px"></div></div>
      ${def.confirm ? `<label class="check" style="margin-top:14px"><input type="checkbox" id="confirm" ${claim ? 'checked' : ''}> ${t('confirm_course')}</label>` : ''}
      ${others.length ? `<details class="field companions" style="margin-top:16px" ${st.people.size ? 'open' : ''}><summary>👥 ${t('companions')} <span id="pcount"></span></summary>
        <div class="hint" style="margin:6px 0 8px">${t('companions_hint')}</div>
        ${others.length > 8 ? `<input type="search" id="psearch" placeholder="${esc(t('search'))}" style="margin-bottom:8px">` : ''}
        <div class="people-grid" id="people"></div></details>` : ''}
      <label class="field" style="margin-top:14px"><span>${t('note')}</span><textarea id="note" maxlength="300">${esc(claim?.note || '')}</textarea><div class="hint">🔒 ${t('note_hint')}</div></label>
      ${def.needs_approval ? `<p class="hint">⏳ ${t('needs_approval_note')}</p>` : ''}
      <div id="err"></div>
      <button class="btn primary block" type="submit">${fixing ? t('fix') : t('send')}</button>
    </form>`;

  const drawQty = () => { if (!showQty) return; $('#qty').textContent = st.qty; $('#qpts').textContent = '= +' + st.qty * def.points + ' ⭐'; };
  const drawDate = () => $$('[data-date]').forEach((c) => c.classList.toggle('on', c.dataset.date === st.date));
  const drawPeople = (filter = '') => {
    const box = $('#people');
    if (!box) return;
    const f = filter.trim().toLowerCase();
    box.innerHTML = others.filter((m) => !f || m.alias.toLowerCase().includes(f) || st.people.has(m.id)).map((m) =>
      `<button type="button" class="person ${st.people.has(m.id) ? 'on' : ''}" data-pid="${m.id}"><span class="face">${avatarSVG({ ...m.look, show: {} }, { classId: m.class_id, crop: 'head' })}</span><span>${st.people.has(m.id) ? '✔ ' : ''}${esc(m.alias)}</span></button>`).join('');
    $('#pcount').textContent = st.people.size ? `(${st.people.size})` : '';
  };
  drawQty(); drawDate(); drawPeople();

  $('#f').addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) { play('tap'); st.qty = Math.max(1, Math.min(maxQty, st.qty + Number(q.dataset.q))); drawQty(); return; }
    const d = e.target.closest('[data-date]');
    if (d) { st.date = d.dataset.date; $('#date').value = st.date; drawDate(); return; }
    const p = e.target.closest('[data-pid]');
    if (p) { const id = Number(p.dataset.pid); st.people.has(id) ? st.people.delete(id) : st.people.add(id); drawPeople($('#psearch')?.value || ''); }
  });
  $('#date').onchange = (e) => { st.date = e.target.value; drawDate(); };
  $('#psearch')?.addEventListener('input', (e) => drawPeople(e.target.value));

  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      mission_def_id: def.id, quantity: st.qty, performed_at: st.date, participant_ids: [...st.people],
      confirmed: $('#confirm')?.checked || false, note: $('#note').value, idempotency_key: st.key,
    };
    const btn = $('#f button[type=submit]');
    btn.disabled = true;
    try {
      let status = 'pending';
      if (fixing) await api('PUT', '/claims/' + claim.id, body);
      else status = (await api('POST', '/claims', body)).claim.status;
      const got = st.qty * def.points * (status === 'approved' ? 1 : 0);
      play(got ? 'star' : 'sent');
      const m = modal(`<div class="celebrate-pop">
        ${got ? `<div class="star-burst"><span>⭐</span><b>+${got}</b></div><h2>${t('stars_earned')}</h2><p>${t('stars_earned_body')}</p>`
          : `<div class="big">📨</div><h2>${t('sent_title')}</h2><p>${t('sent_body')}</p>`}
        <div class="btn-row"><a class="btn" href="#/log" id="m1">＋ ${t('log_another')}</a><a class="btn primary" href="#/home" id="m2">${t('nav_home')}</a></div></div>`);
      $$('a', m.el).forEach((a) => a.addEventListener('click', m.close));
      if (got) confetti();
    } catch (err) {
      play('error');
      $('#err').innerHTML = `<div class="error-msg">${esc(errText(err))}</div>`;
      btn.disabled = false;
    }
  };
}

// ---------- me ("Yo") ----------
async function meView() {
  const [me, mine] = await Promise.all([api('GET', '/me'), api('GET', '/claims/mine')]);
  S.character = me.character;
  const s = me.stats;
  const cls = classById(me.character.class_id);
  const lvl = S.levels.find((l) => l.level === s.level);
  const claimRow = (c) => {
    const result = c.result?.members?.[S.me.id];
    const isMine = c.user.id === S.me.id;
    return `<div class="claim"><div class="top"><div><div class="name">${GROUPS.find((g) => g.cat === c.category)?.icon || '⭐'} ${esc(c.mission)} ${c.quantity > 1 ? '×' + c.quantity : ''}</div>
      <div class="sub">${fmtDate(c.performed_at)}${!isMine ? ` · ${t('with')} ${esc(c.user.alias)}` : c.participants.length ? ` · ${t('with')} ${c.participants.map((p) => esc(p.alias)).join(', ')}` : ''}</div></div>
      <div style="text-align:right">${statusPill(c.status)}${result ? `<div class="sub" style="font-weight:800">+${result.xp} ⭐</div>` : ''}</div></div>
      ${c.coord_message ? `<div class="coord-msg">💬 ${esc(c.coord_message)}</div>` : ''}
      ${c.status === 'needs_changes' && isMine ? `<a class="btn small blue" style="margin-top:8px" href="#/fix/${c.id}">✏️ ${t('fix')}</a>` : ''}</div>`;
  };
  app.innerHTML = `<div class="panel"><div class="char-card">
      <div class="portrait">${avatarSVG(me.character.look, { classId: me.character.class_id })}</div>
      <div><h1 style="margin:0">${esc(S.me.alias)}</h1>
        ${me.character.look.show?.title ? `<span class="title-ribbon">🏅 ${esc(tr(lvl, 'title'))}</span>` : ''}
        <div style="font-weight:800">${esc(tr(cls, 'name'))}</div>
        ${me.character.motto ? `<p class="story" style="margin:4px 0">“${esc(me.character.motto)}”</p>` : ''}
        <div class="bar-label"><span>${t('level')} ${s.level} · ${esc(tr(lvl, 'title'))}</span><span>${s.xp} ⭐</span></div>
        <div class="bar gold"><i style="width:${s.next_level_xp ? pct(s.xp - s.level_min_xp, s.next_level_xp - s.level_min_xp) : 100}%"></i></div>
        <div class="hint">${s.next_level_xp ? t('next_level', { n: s.next_level_xp }) : t('max_level')}${s.pending_xp ? ' · ' + t('pending_xp', { n: s.pending_xp }) : ''}</div>
        <a class="btn small" style="margin-top:10px" href="#/edit">🎨 ${t('edit_character')}</a></div></div></div>
    <div class="panel"><h2>${t('level_rewards')}</h2>${S.levels.map((l) => `<div class="reward-row ${s.xp >= l.min_xp ? 'got' : ''}"><div class="lv">${l.level}</div>
      <div class="grow"><b>${esc(tr(l, 'title'))}</b><div class="hint" style="margin:0">${esc(tr(l, 'prize'))} · ${l.min_xp} ⭐</div></div>${s.xp >= l.min_xp ? '✔' : '🔒'}</div>`).join('')}</div>
    <div class="panel"><h2>${t('history')}</h2>${mine.length ? mine.slice(0, 40).map(claimRow).join('') : `<p>${t('empty_history')}</p><a class="btn primary" href="#/log">＋ ${t('log_activity')}</a>`}</div>
    <div class="panel"><h2>${t('settings_title')}</h2>
      <label class="check switch-row"><input type="checkbox" id="snd" ${isMuted() ? '' : 'checked'}> 🔊 ${t('sounds')}</label>
      <div class="btn-row" style="margin-top:12px"><button class="btn" id="pinbtn">🔑 ${t('change_pin')}</button><button class="btn" id="out">🚪 ${t('logout')}</button></div></div>`;
  $('#snd').onchange = (e) => { setMuted(!e.target.checked); play('tap'); };
  $('#out').onclick = async () => { await api('POST', '/auth/logout', {}); S.me = null; S.character = null; go('welcome'); };
  $('#pinbtn').onclick = () => {
    const m = modal(`<h3>${t('change_pin')}</h3><form id="pf">
      <label class="field"><span>${t('old_pin')}</span><input type="password" name="old" class="pin-input" inputmode="numeric" maxlength="8" required></label>
      <label class="field"><span>${t('new_pin')}</span><input type="password" name="pin" class="pin-input" inputmode="numeric" maxlength="8" required></label>
      <div class="btn-row"><button type="button" class="btn" id="pc">${t('cancel')}</button><button class="btn green">${t('save')}</button></div></form>`);
    $('#pc', m.el).onclick = m.close;
    $('#pf', m.el).onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await api('POST', '/me/pin', { old: fd.get('old'), pin: fd.get('pin') }); m.close(); toast(t('saved')); } catch (err) { toast(errText(err), true); }
    };
  };
}

// ---------- leader: Aprobar · Grupo · Ajustes ----------
const LEAD_TABS = { approve: 'lead_approve', group: 'lead_group', setup: 'lead_setup' };

async function lead({ args }) {
  if (!isCoord()) return go('home');
  const tabs = isAdmin() ? ['approve', 'group', 'setup'] : ['approve', 'group'];
  const tab = tabs.includes(args[0]) ? args[0] : 'approve';
  app.innerHTML = `<div class="seg">${tabs.map((k) => `<a class="${k === tab ? 'on' : ''}" href="#/lead/${k}">${t(LEAD_TABS[k])}${k === 'approve' && pendingCount ? ` <b class="dot-inline">${pendingCount}</b>` : ''}</a>`).join('')}</div><div id="lead"></div>`;
  const box = $('#lead');
  const parts = {
    approve: [leadQueue, leadRecent],
    group: [leadPanel, leadInvites, ...(isAdmin() ? [leadUsers] : [])],
    setup: [leadWorlds, leadMissions, leadSettings, leadFix, leadAudit],
  }[tab];
  // Setup sections fold away so the admin screen stays short on a phone.
  const folds = tab === 'setup' ? ['lead_worlds', 'lead_missions', 'lead_settings', 'adjust', 'lead_audit'] : null;
  box.innerHTML = parts.map((_, i) => (folds
    ? `<details class="fold"><summary>${t(folds[i])}</summary><div id="lp${i}"></div></details>`
    : `<div id="lp${i}"></div>`)).join('');
  await Promise.all(parts.map((fn, i) => fn($('#lp' + i))));
}

// Recently counted reports; a coordinator can remove a mistaken one (it is reversed, not deleted).
async function leadRecent(box) {
  const rows = (await api('GET', '/admin/claims?status=approved')).slice(0, 30);
  box.innerHTML = `<div class="panel"><h2>${t('recent')}</h2><p class="hint">${t('void_hint')}</p>
    ${rows.map((c) => `<div class="claim" data-cid="${c.id}"><div class="top"><div><div class="name">${GROUPS.find((g) => g.cat === c.category)?.icon || '⭐'} ${esc(c.mission)} ×${c.quantity}</div>
      <div class="sub">${esc(c.user.alias)}${c.participants.length ? ' +' + c.participants.length : ''} · ${fmtDate(c.performed_at)}</div></div>
      <button class="btn small" data-void>${t('remove')}</button></div></div>`).join('') || '<p>—</p>'}</div>`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-void]');
    if (!b) return;
    const id = b.closest('[data-cid]').dataset.cid;
    const reason = await ask(t('remove') + '?', { input: true, placeholder: t('reason_ph'), danger: true, okLabel: t('remove') });
    if (!reason) return;
    try {
      const r = await api('POST', `/admin/claims/${id}/void`, { reason });
      toast(r.unlocked_world_affected ? t('unlocked_world_warning') : t('saved'), r.unlocked_world_affected);
      leadRecent(box);
    } catch (err) { toast(errText(err), true); }
  };
}

async function leadQueue(box) {
  const [queue, members] = await Promise.all([api('GET', '/approvals/queue'), api('GET', '/members')]);
  const face = (id) => {
    const m = members.find((x) => x.id === id);
    return m ? avatarSVG({ ...m.look, show: {} }, { classId: m.class_id, crop: 'head' }) : '';
  };
  if (!queue.length) { box.innerHTML = `<div class="panel" style="text-align:center"><div style="font-size:3rem">🎉</div><h2>${t('queue_empty')}</h2></div>`; return; }
  box.innerHTML = queue.map((c) => `<div class="claim panel tight" data-cid="${c.id}">
    <div class="top"><div class="who">${face(c.user.id)}<div><div class="name">${esc(c.user.alias)}</div><div class="sub">${fmtDate(c.performed_at)}</div></div></div>
      <span class="pts" style="font-family:var(--font-head);font-weight:700;background:var(--gold);border:2.5px solid var(--line);border-radius:12px;padding:2px 8px;color:#2A2238">+${c.quantity * c.points_per_unit}</span></div>
    <div class="name" style="margin-top:8px">${CAT_ICON[c.category] || '⭐'} ${esc(c.mission)} ${c.quantity > 1 ? `× ${c.quantity}` : ''}</div>
    ${c.participants.length ? `<div class="sub">👥 ${c.participants.map((p) => esc(p.alias)).join(', ')}</div>` : ''}
    ${c.note ? `<div class="coord-msg" style="background:var(--panel-2);color:inherit">📝 ${esc(c.note)}</div>` : ''}
    ${c.same_day ? `<div class="warn">⚠️ ${t('same_day_warn', { n: c.same_day })}</div>` : ''}
    <div class="btn-row" style="margin-top:10px"><button class="btn small green" data-act="approve">✔ ${t('approve')}</button>
      <button class="btn small blue" data-act="request-change">↩ ${t('request_change')}</button><button class="btn small primary" data-act="reject">✖ ${t('reject')}</button></div></div>`).join('');
  box.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const card = b.closest('[data-cid]');
    const id = card.dataset.cid;
    const act = b.dataset.act;
    let body = {};
    if (act === 'reject') { const r = await ask(t('reject'), { input: true, placeholder: t('reason_ph'), okLabel: t('reject'), danger: true }); if (!r) return; body = { reason: r }; }
    if (act === 'request-change') { const r = await ask(t('request_change'), { input: true, placeholder: t('reason_ph'), okLabel: t('request_change') }); if (!r) return; body = { message: r }; }
    try {
      $$('button', card).forEach((x) => { x.disabled = true; });
      await api('POST', `/claims/${id}/${act}`, body);
      card.remove();
      toast(act === 'approve' ? '✔ ' + t('status.approved') : t('saved'));
      await refreshPending();
      if (!$('[data-cid]', box)) leadQueue(box);
    } catch (err) {
      toast(errText(err), true);
      $$('button', card).forEach((x) => { x.disabled = false; });
    }
  };
}

async function leadPanel(box) {
  const [worlds, g] = await Promise.all([api('GET', '/worlds'), api('GET', '/group')]);
  const active = worlds.find((p) => p.world.status === 'active');
  box.innerHTML = `${active ? `<div class="panel"><h2>${esc(tr(active.world, 'name'))}</h2>
      ${active.world.star_target ? bar('⭐ ' + t('stars'), active.stars, active.world.star_target, 'gold') : ''}
      ${active.challenge ? challengeBar(active.challenge) : bar('🔑 ' + esc(tr(active.world, 'obstacle')), active.tag_count, active.world.tag_target)}
      ${!active.challenge && active.world.distinct_min ? bar('👥 ' + t('people'), active.distinct, active.world.distinct_min, 'blue') : ''}
      ${active.challenge ? `<a class="btn gold block" style="margin-top:12px" href="#/challenge/${active.world.id}">🎯 ${t('board')}</a>` : ''}
      ${active.pending_claims ? `<p class="hint">⏳ ${active.pending_claims} ${t('pending_claims')}</p>` : ''}
      <a class="btn ${active.eligible ? 'gold' : ''} block" style="margin-top:12px" href="#/world/${active.world.id}">${active.eligible ? '🔑 ' + t('confirm_unlock') : 'ℹ️ ' + t('requirements')}</a></div>` : ''}
    <div class="panel"><h2>${t('group_stats')}</h2><div class="stat-grid">
      <div class="stat"><b>${g.members}</b><span>${t('members')}</span></div><div class="stat"><b>${g.contributors}</b><span>${t('contributors')}</span></div>
      <div class="stat"><b>${g.missions}</b><span>${t('missions_done')}</span></div><div class="stat"><b>${g.stars}</b><span>${t('total_stars')}</span></div>
      <div class="stat"><b>${g.keys}/6</b><span>${t('keys')}</span></div></div>
      <div class="chips" style="flex-wrap:wrap;margin-top:12px">${Object.entries(g.by_category).map(([k, v]) => `<span class="chip" style="cursor:default">${CAT_ICON[k] || '⭐'} ${t('cat.' + k)}: ${v}</span>`).join('')}</div>
      <a class="btn blue" href="#/tv" style="margin-top:8px">📺 ${t('open_tv')}</a></div>
    <div class="panel"><h2>${t('post_news')}</h2><form id="nf">
      <label class="field"><span>${t('title')}</span><input type="text" name="title" maxlength="120" required></label>
      <label class="field"><span>${t('message')}</span><textarea name="body" maxlength="1000"></textarea></label>
      <button class="btn green">${t('publish')}</button></form></div>`;
  $('#nf').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { await api('POST', '/news', { title: fd.get('title'), body: fd.get('body') }); e.target.reset(); toast(t('saved')); } catch (err) { toast(errText(err), true); }
  };
}

async function leadInvites(box) {
  const list = await api('GET', '/invites');
  const link = (code) => `${location.origin}/#/join?code=${code}`;
  box.innerHTML = `<div class="panel"><h2>${t('new_invite')}</h2><p class="hint">${t('invite_hint')}</p><form id="inf">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
      <label class="field"><span>${t('role')}</span><select name="role">${['member', ...(isAdmin() ? ['coordinator', 'admin'] : [])].map((r) => `<option value="${r}">${t('roles.' + r)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('uses')}</span><input type="number" name="uses" value="1" min="1" max="100"></label>
      <label class="field"><span>${t('days')}</span><input type="number" name="days" value="14" min="1" max="90"></label></div>
      <button class="btn green">${t('new_invite')}</button></form><div id="newcode"></div></div>
    <div class="panel"><div class="table-scroll"><table class="simple"><tbody>${list.map((i) => `<tr><td><span class="code">${esc(i.code)}</span></td><td>${t('roles.' + i.role)}</td><td>${i.uses_left}×</td>
      <td><button class="btn small" data-copy="${esc(i.code)}">${t('copy_link')}</button></td><td><button class="btn small primary" data-revoke="${esc(i.code)}">${t('revoke')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
  const copy = async (code) => {
    try { await navigator.clipboard.writeText(link(code)); toast(t('copied')); } catch { prompt(t('copy_link'), link(code)); }
  };
  $('#inf').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('POST', '/invites', { role: fd.get('role'), uses: fd.get('uses'), days: fd.get('days') });
      $('#newcode').innerHTML = `<div class="panel tight" style="margin-top:12px;box-shadow:none;background:#BFF0C9;color:#1E5B2E;text-align:center">
        <div class="code" style="font-size:1.6rem">${esc(r.code)}</div><p class="hint" style="word-break:break-all;color:inherit">${esc(link(r.code))}</p>
        <div class="btn-row"><button class="btn small" data-copy="${esc(r.code)}">📋 ${t('copy_link')}</button>
        ${navigator.share ? `<button class="btn small blue" id="share">📤 Share</button>` : ''}</div></div>`;
      $('#share')?.addEventListener('click', () => navigator.share({ title: t('app_name'), text: t('tagline'), url: link(r.code) }).catch(() => {}));
    } catch (err) { toast(errText(err), true); }
  };
  box.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) return copy(c.dataset.copy);
    const r = e.target.closest('[data-revoke]');
    if (r && (await ask(t('revoke') + ' ' + r.dataset.revoke + '?', { danger: true }))) {
      await api('DELETE', '/invites/' + r.dataset.revoke, {});
      leadInvites(box);
    }
  });
}

async function leadSettings(box) {
  const d = await api('GET', '/admin/settings');
  const field = (k) => {
    const type = d.types[k];
    const v = d.settings[k];
    let input;
    if (type === 'bool') input = `<label class="check"><input type="checkbox" name="${k}" ${v ? 'checked' : ''}> ${t('yes')}</label>`;
    else if (type.startsWith('enum:')) input = `<select name="${k}">${type.slice(5).split(',').map((o) => `<option value="${o}" ${o === v ? 'selected' : ''}>${t('enum.' + o)}</option>`).join('')}</select>`;
    else input = `<input type="${type === 'integer' ? 'number' : type === 'date' ? 'date' : 'text'}" name="${k}" value="${esc(v)}">`;
    return `<label class="field"><span>${t('setting_names.' + k)}</span>${input}</label>`;
  };
  box.innerHTML = `<div class="panel"><h2>${t('lead_settings')}</h2><p class="hint">${t('version_note')} (v${d.settings.rule_version})</p>
    <form id="sf"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 16px">${Object.keys(d.types).map(field).join('')}</div>
    <button class="btn green">${t('save')}</button></form></div>
    <div class="panel"><h3>Versiones / Versions</h3>${d.versions.map((v) => `<div class="sub" style="padding:4px 0;border-bottom:1px dashed #ccc"><b>${esc(v.alias || '')}</b> · ${esc(v.at)}<br><code style="font-size:.78rem;word-break:break-all">${esc(v.changes_json)}</code></div>`).join('') || '—'}</div>`;
  $('#sf').onsubmit = async (e) => {
    e.preventDefault();
    const changes = {};
    for (const k of Object.keys(d.types)) {
      const el = e.target.elements[k];
      changes[k] = el.type === 'checkbox' ? el.checked : el.value;
    }
    try { await api('PUT', '/admin/settings', { changes }); toast(t('saved')); await loadBootstrap(); leadSettings(box); } catch (err) { toast(errText(err), true); }
  };
}

async function leadMissions(box) {
  const d = await api('GET', '/admin/settings');
  const row = (m) => `<tr data-mid="${m.id}"><td><b>${esc(tr(m, 'name'))}</b><div class="sub">${t('grp.' + m.category) || m.category}</div></td>
      <td><input type="number" name="points" value="${m.points}" min="0" max="1000"></td>
      <td><input type="number" name="cap" value="${m.daily_cap ?? ''}" min="1" max="100" placeholder="∞"></td>
      <td><input type="checkbox" name="approval" ${m.needs_approval ? 'checked' : ''} style="width:22px;height:22px"></td>
      <td><input type="checkbox" name="active" ${m.active ? 'checked' : ''} style="width:22px;height:22px"></td>
      <td><button class="btn small green" data-save>${t('save')}</button></td></tr>`;
  const head = `<thead><tr><th></th><th>⭐</th><th>${t('daily_cap')}</th><th>${t('approval_col')}</th><th>${t('active')}</th><th></th></tr></thead>`;
  box.innerHTML = `<div class="panel"><h2>${t('lead_missions')}</h2><p class="hint">${t('version_note')}</p>
    <div class="table-scroll"><table class="simple">${head}<tbody>${d.missions.filter((m) => m.active).map(row).join('')}</tbody></table></div>
    <details style="margin-top:12px"><summary>${t('inactive_missions')}</summary><div class="table-scroll"><table class="simple">${head}<tbody>${d.missions.filter((m) => !m.active).map(row).join('')}</tbody></table></div></details></div>`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-save]');
    if (!b) return;
    const r = b.closest('[data-mid]');
    try {
      await api('PUT', '/admin/missions/' + r.dataset.mid, {
        points: $('[name=points]', r).value, daily_cap: $('[name=cap]', r).value || null,
        active: $('[name=active]', r).checked, needs_approval: $('[name=approval]', r).checked,
      });
      toast(t('saved'));
    } catch (err) { toast(errText(err), true); }
  };
}

async function leadWorlds(box) {
  const d = await api('GET', '/admin/settings');
  const num = (name, label, value, off) => `<label class="field" style="margin:0"><span style="font-size:.8rem">${label}</span><input type="number" name="${name}" value="${value}" min="0" ${off ? 'disabled' : ''}></label>`;
  box.innerHTML = `<div class="panel"><h2>${t('lead_worlds')}</h2><p class="hint">${t('world_targets_hint')}</p>${d.worlds.map((w) => {
    const off = w.status === 'unlocked';
    const cfg = w.challenge_json ? JSON.parse(w.challenge_json) : null;
    const fields = w.challenge_type
      ? [num('star_target', t('star_target'), w.star_target, off),
        ...(cfg.items ? cfg.items.map((it) => num('item:' + it.key, esc(getLang() === 'en' ? it.en : it.es), it.target, off)) : [num('challenge_target', t('goal'), cfg.target, off)])]
      : [num('star_target', t('star_target'), w.star_target, off), num('tag_target', t('tag_target'), w.tag_target, off), num('distinct_min', t('distinct_min'), w.distinct_min, off)];
    return `<div class="claim" data-wid="${w.id}">
    <div class="top"><b>${w.ord}. ${esc(tr(w, 'name'))}</b>${worldStatusPill(w.status)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:8px">${fields.join('')}</div>
    ${w.challenge_type ? `<label class="field" style="margin:8px 0 0"><span style="font-size:.8rem">${t('challenge_text')} (ES)</span><textarea name="challenge_es" ${off ? 'disabled' : ''} style="min-height:56px">${esc(w.challenge_es)}</textarea></label>
      <label class="field" style="margin:8px 0 0"><span style="font-size:.8rem">${t('challenge_text')} (EN)</span><textarea name="challenge_en" ${off ? 'disabled' : ''} style="min-height:56px">${esc(w.challenge_en)}</textarea></label>` : ''}
    ${off ? '' : `<button class="btn small green" style="margin-top:8px" data-save>${t('save')}</button>`}</div>`;
  }).join('')}</div>`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-save]');
    if (!b) return;
    const row = b.closest('[data-wid]');
    const body = { items: {} };
    for (const el of $$('input, textarea', row)) {
      if (el.name.startsWith('item:')) body.items[el.name.slice(5)] = el.value;
      else body[el.name] = el.value;
    }
    try { await api('PUT', '/admin/worlds/' + row.dataset.wid, body); toast(t('saved')); } catch (err) { toast(errText(err), true); }
  };
}

async function leadUsers(box) {
  const users = await api('GET', '/admin/users');
  box.innerHTML = `<div class="panel"><h2>${t('lead_users')} (${users.length})</h2><div class="table-scroll"><table class="simple"><tbody>
    ${users.map((u) => `<tr data-uid="${u.id}"><td><b>${esc(u.alias)}</b><div class="sub">${esc(tr(classById(u.class_id), 'name'))} · ${u.xp} XP</div></td>
      <td><select name="role" style="min-height:38px">${['member', 'coordinator', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${t('roles.' + r)}</option>`).join('')}</select></td>
      <td><select name="gender" style="min-height:38px"><option value="" ${u.gender ? '' : 'selected'} disabled>—</option>${['brother', 'sister'].map((g) => `<option value="${g}" ${u.gender === g ? 'selected' : ''}>${t(g)}</option>`).join('')}</select></td>
      <td><button class="btn small ${u.status === 'active' ? '' : 'green'}" data-status="${u.status === 'active' ? 'disabled' : 'active'}">${u.status === 'active' ? t('disable') : t('enable')}</button></td>
      <td><button class="btn small" data-pin>🔑 ${t('reset_pin')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
  box.onchange = async (e) => {
    if (!['role', 'gender'].includes(e.target.name)) return;
    const id = e.target.closest('[data-uid]').dataset.uid;
    try { await api('PUT', '/admin/users/' + id, { [e.target.name]: e.target.value }); toast(t('saved')); } catch (err) { toast(errText(err), true); leadUsers(box); }
  };
  box.onclick = async (e) => {
    const row = e.target.closest('[data-uid]');
    if (!row) return;
    const id = row.dataset.uid;
    const s = e.target.closest('[data-status]');
    if (s) {
      if (!(await ask(t('confirm_q'), { danger: s.dataset.status === 'disabled' }))) return;
      try { await api('PUT', '/admin/users/' + id, { status: s.dataset.status }); leadUsers(box); } catch (err) { toast(errText(err), true); }
    }
    if (e.target.closest('[data-pin]')) {
      const pin = prompt(t('new_pin') + ' (4-8)');
      if (!pin) return;
      try { await api('POST', `/admin/users/${id}/pin`, { pin }); toast(t('saved')); } catch (err) { toast(errText(err), true); }
    }
  };
}

async function leadFix(box) {
  const [users, worlds] = await Promise.all([api('GET', '/admin/users'), api('GET', '/worlds')]);
  box.innerHTML = `<div class="panel"><h2>${t('adjust')}</h2><form id="af">
      <label class="field"><span>${t('adjust_target')}</span><select name="target">
        <optgroup label="${t('lead_users')}">${users.map((u) => `<option value="u:${u.id}">${esc(u.alias)}</option>`).join('')}</optgroup>
        <optgroup label="${t('lead_worlds')}">${worlds.map((p) => `<option value="w:${p.world.id}">${esc(tr(p.world, 'name'))} (⭐)</option>`).join('')}</optgroup></select></label>
      <label class="field"><span>${t('amount')}</span><input type="number" name="amount" required></label>
      <label class="field"><span>${t('reason')}</span><input type="text" name="reason" required maxlength="300"></label>
      <button class="btn green">${t('apply')}</button></form></div>`;
  $('#af', box).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const [kind, id] = String(fd.get('target')).split(':');
    try {
      await api('POST', '/admin/adjust', { user_id: kind === 'u' ? Number(id) : null, world_id: kind === 'w' ? id : null, amount: fd.get('amount'), reason: fd.get('reason') });
      e.target.reset(); toast(t('saved'));
    } catch (err) { toast(errText(err), true); }
  };
}

async function leadAudit(box) {
  const rows = await api('GET', '/admin/audit');
  box.innerHTML = `<div class="panel"><h2>${t('export')}</h2><div class="btn-row">${['claims', 'ledger', 'members', 'worlds', 'audit'].map((n) => `<a class="btn small" href="/api/exports/${n}.csv" download>⬇ ${n}.csv</a>`).join('')}
      <a class="btn small gold" href="/api/admin/backup" download>💾 ${t('backup')}</a></div></div>
    <div class="panel"><h2>${t('lead_audit')}</h2><div class="table-scroll"><table class="simple"><tbody>${rows.map((r) => `<tr><td class="sub">${esc(r.at)}</td><td><b>${esc(r.actor || '—')}</b></td><td>${esc(r.entity)} ${esc(r.entity_id || '')}</td><td>${esc(r.action)}</td>
      <td><code style="font-size:.75rem;word-break:break-all">${esc(r.new_json || '')}</code></td></tr>`).join('')}</tbody></table></div></div>`;
}

// ---------- celebration & projector ----------
async function celebrate() {
  const [worlds, members] = await Promise.all([api('GET', '/worlds'), api('GET', '/members')]);
  const done = worlds.every((p) => p.world.status === 'unlocked');
  app.innerHTML = `<div class="panel victory">
    ${done ? art('victory.webp', 'world-art banner', t('victory')) : worldArt(worlds[5].world, 'world-art banner')}
    <div style="font-size:2.4rem">${worlds.map((p) => (p.world.status === 'unlocked' ? '🔑' : '🔒')).join(' ')}</div>
    <h1>${done ? '🎉 ' + t('victory') : esc(tr(worlds[5].world, 'name'))}</h1>
    <p>${done ? t('victory_body') : esc(tr(worlds[5].world, 'story'))}</p>
    <div class="row">${members.map((m) => avatarSVG(m.look, { classId: m.class_id, frame: false })).join('')}</div>
    <p style="font-weight:800">${members.map((m) => esc(m.alias)).join(' · ')}</p>
    <a class="btn primary" href="#/map">${t('nav_map')}</a></div>`;
  if (done) confetti();
}

async function tv() {
  const draw = async () => {
    const [worlds, members, g] = await Promise.all([api('GET', '/worlds'), api('GET', '/members'), api('GET', '/group')]);
    const active = worlds.find((p) => p.world.status === 'active');
    const party = members.map((m) => ({ look: m.look, class_id: m.class_id }));
    const w = active?.world;
    app.innerHTML = `<div class="tv-grid"><div class="map-wrap">${mapSVG(worlds, party.length ? party : [], getLang())}</div>
      <div class="tv-side"><div class="panel"><div class="hint" style="font-size:1.2rem;font-weight:800;margin:0">${esc(S.settings.season_name || t('app_name'))}</div>
        ${w ? `<h1>${w.ord}. ${esc(tr(w, 'name'))}</h1>
        ${w.star_target ? bar('⭐ ' + t('stars'), active.stars, w.star_target, 'gold') : ''}
        ${active.challenge ? `<p style="font-size:1.3rem;font-weight:700;margin:8px 0">🎯 ${esc(chText(active.challenge))}</p>${challengeBar(active.challenge)}`
          : `${bar('🔑 ' + esc(tr(w, 'obstacle')), active.tag_count, w.tag_target)}${w.distinct_min ? bar('👥 ' + t('people'), active.distinct, w.distinct_min, 'blue') : ''}`}` : `<h1>🎉 ${t('victory')}</h1>`}</div>
        <div class="panel"><div class="stat-grid"><div class="stat"><b>${g.members}</b><span>${t('members')}</span></div><div class="stat"><b>${g.missions}</b><span>${t('missions_done')}</span></div>
          <div class="stat"><b>${g.stars}</b><span>${t('total_stars')}</span></div><div class="stat"><b>${g.keys}/6</b><span>${t('keys')}</span></div></div></div>
        <div class="panel" style="flex:1;overflow:hidden"><div class="tv-party">${members.slice(0, 40).map((m) => avatarSVG(m.look, { classId: m.class_id, frame: false })).join('')}</div></div>
        <a href="#/map" class="link-btn">✕</a></div></div>`;
  };
  await draw();
  tvTimer = setInterval(() => draw().catch(() => {}), 30000);
}

// ---------- boot ----------
async function loadBootstrap() {
  const b = await api('GET', '/bootstrap');
  S.me = b.me;
  S.character = b.character;
  S.settings = b.settings;
  S.classes = b.classes;
  S.levels = b.levels;
  S.settingsCaps = b.caps;
}

(async function boot() {
  setLang(getLang());
  try {
    await loadBootstrap();
    let saved = null;
    try { saved = localStorage.getItem('lang'); } catch { /* storage blocked */ }
    if (S.me?.lang && !saved) setLang(S.me.lang);
  } catch { /* offline: still route to welcome */ }
  router();
})();
