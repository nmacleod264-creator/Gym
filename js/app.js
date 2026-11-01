import {
  EXERCISES, SLOTS, TYPE_DEFAULTS, GROUPS, SLOT_GROUP, DAY_TYPES, LENGTHS, BLOCK, WARMUP, RECOVERY, MEALS, TIPS, GUIDE,
} from './data.js';
import * as store from './store.js';
import { capabilities as mealCapabilities, preparePhoto, analyseMeal } from './meal.js';

/* ---------- storage ---------- */


function defaultState() {
  return {
    settings: {
      onboarded: false,
      name: '',
      sex: 'm',
      age: 25,
      heightCm: 178,
      startWeight: 70,
      goalWeight: 80,
      activity: 1.55,
      surplus: 350,
      waterTarget: 3,
      weeklyGoal: 5,
      sessionLength: 45,
      restTimer: true,
      startDate: todayKey(),
    },
    habits: [
      { id: 'creatine', label: 'Take creatine (5 g)' },
      { id: 'sleep', label: 'Sleep 7-9 hours' },
      { id: 'stretch', label: '10 min stretch' },
    ],
    calAdjust: 0,
    days: {},
  };
}

// Builds state from what the database returned (or a backup file).
function fromSaved(data) {
  const d = defaultState();
  if (!data) return d;
  return { ...d, ...data, settings: { ...d.settings, ...(data.settings || {}) }, days: data.days || {} };
}

function save() { store.scheduleSave(); }

/* ---------- small utils ---------- */

function pad(n) { return String(n).padStart(2, '0'); }
function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayKey() { return keyOf(new Date()); }
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 86400000); }
function uid() { return Math.random().toString(36).slice(2, 9); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function num(v) { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; }
function fmtKg(n) { return n == null ? '–' : (Math.round(n * 10) / 10).toString(); }
function fmtDate(k, opts = { weekday: 'short', day: 'numeric', month: 'short' }) { return parseKey(k).toLocaleDateString(undefined, opts); }
function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${pad(sec % 60)}`; }
function fmtDur(ms) { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; }

// Deterministic RNG so the same date always produces the same workout / meals.
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }

/* ---------- state ---------- */

let state = defaultState();
let boot = 'loading'; // loading | ready | outside | unavailable | signed-out | error
let mealCaps = { text: false, images: false };
let tab = 'today';
let modal = null;
let timer = null;
let curKey = todayKey();
const openInfo = new Set();
const freshSnap = () => ({ photo: null, preview: null, desc: '', busy: false, result: null, error: '' });
let snap = freshSnap();
let audioCtx = null;

function day(k) {
  if (!state.days[k]) state.days[k] = { habits: {}, tasks: [], water: 0, weight: null, workout: null, meals: null, extra: [] };
  return state.days[k];
}
function sortedKeys() { return Object.keys(state.days).sort(); }

/* ---------- program logic ---------- */

function blockInfo(k) {
  const d = Math.max(0, daysBetween(state.settings.startDate, k));
  const week = Math.floor((d % 42) / 7) + 1;
  return { number: Math.floor(d / 42) + 1, ...BLOCK[week - 1] };
}

function previousSessionIds(type, k) {
  const keys = sortedKeys().filter(x => x < k).reverse();
  for (const x of keys) {
    const w = state.days[x].workout;
    if (w && w.type === type) return w.exercises.map(e => e.id);
  }
  return [];
}

function makeExercise(id, slot, baseSets, anchor, blk) {
  const ex = EXERCISES[id];
  const len = state.settings.sessionLength;
  let sets = len === 30 && !anchor ? Math.min(baseSets, 2) : baseSets;
  // Hard weeks add an isolation set, but only when there's time for it.
  if ((blk.week === 4 || blk.week === 5) && ex.type === 'isolation' && len >= 60) sets += 1;
  if (blk.week === 6) sets = Math.max(1, Math.ceil(sets / 2));
  const def = TYPE_DEFAULTS[ex.type];
  return {
    id, slot, baseSets, anchor: !!anchor,
    reps: id === 'plank' ? '30-60s' : def.reps,
    rest: def.rest,
    sets: Array.from({ length: sets }, () => ({ w: '', r: '', done: false })),
  };
}

function buildSession(k, type, salt = '') {
  const tpl = DAY_TYPES[type];
  const blk = blockInfo(k);
  const r = rng(k + type + salt);
  const last = new Set(previousSessionIds(type, k));
  const used = new Set();
  const count = LENGTHS[state.settings.sessionLength] || LENGTHS[45];
  const exercises = tpl.slots.slice(0, count).map(([slot, sets, anchor]) => {
    const pool = SLOTS[slot].filter(id => !used.has(id));
    let id;
    if (anchor) {
      // Main lift is fixed for the whole block so progress is measurable.
      id = pick(pool, rng(`anchor${blk.number}${slot}`));
    } else {
      const fresh = pool.filter(x => !last.has(x));
      id = pick(fresh.length ? fresh : pool, r);
    }
    used.add(id);
    return makeExercise(id, slot, sets, anchor, blk);
  });
  return {
    kind: 'lift', type, picked: true, title: tpl.title, focus: tpl.focus,
    block: blk.number, week: blk.week, rir: blk.rir, exercises, notes: '', started: null, finished: null,
  };
}

function buildRest() {
  return { kind: 'rest', picked: true, title: 'Recovery Day', focus: 'Walk, mobility and core', done: {}, finished: null };
}

function setCounts(w) {
  let done = 0, total = 0;
  for (const e of w.exercises) for (const s of e.sets) { total++; if (s.done) done++; }
  return { done, total };
}

// Counts as trained as soon as any set is ticked, whether or not Finish was tapped.
function trained(w) { return !!w && w.kind === 'lift' && (!!w.finished || setCounts(w).done > 0); }
function workoutDone(w) {
  if (!w) return false;
  if (w.kind === 'rest') return !!w.finished;
  const c = setCounts(w);
  return !!w.finished || (c.total > 0 && c.done / c.total >= 0.75);
}
function touched(w) {
  if (!w) return false;
  if (w.kind === 'rest') return !!w.finished || Object.values(w.done || {}).some(Boolean);
  return trained(w);
}

function groupsWorked(w) {
  const g = new Set();
  for (const e of w.exercises) if (SLOT_GROUP[e.slot] && e.sets.some(s => s.done)) g.add(SLOT_GROUP[e.slot]);
  if (!g.size && w.finished) for (const e of w.exercises) if (SLOT_GROUP[e.slot]) g.add(SLOT_GROUP[e.slot]);
  return g;
}

function plannedGroups(type) {
  const count = LENGTHS[state.settings.sessionLength] || LENGTHS[45];
  return [...new Set(DAY_TYPES[type].slots.slice(0, count).map(([slot]) => SLOT_GROUP[slot]).filter(Boolean))];
}

// Days since each muscle group was last trained (0 = today, null = never in the last 60 days).
function recovery() {
  const out = Object.fromEntries(Object.keys(GROUPS).map(g => [g, null]));
  const from = addDays(curKey, -60);
  for (const k of sortedKeys().filter(x => x >= from && x <= curKey).reverse()) {
    const w = state.days[k].workout;
    if (!trained(w)) continue;
    for (const g of groupsWorked(w)) if (out[g] == null) out[g] = daysBetween(k, curKey);
  }
  return out;
}

function lastDoneType(type) {
  const k = sortedKeys().filter(x => x < curKey).reverse().find(x => state.days[x].workout?.type === type && trained(state.days[x].workout));
  return k ? daysBetween(k, curKey) : null;
}

// Pick the workout whose muscles have rested longest. Suggest recovery if everything was hit in the last day.
function suggestion(rec = recovery()) {
  const order = ['push', 'pull', 'legs', 'upper', 'lower', 'arms', 'full'];
  let best = null;
  for (const t of order) {
    const days = plannedGroups(t).map(g => rec[g] ?? 99);
    const min = Math.min(...days), avg = days.reduce((a, b) => a + b, 0) / days.length;
    if (!best || min > best.min || (min === best.min && avg > best.avg)) best = { type: t, min, avg };
  }
  return best.min <= 1 ? 'rest' : best.type;
}

function dayAgo(n) { return n == null ? 'Not yet' : n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`; }

function lastPerformance(id, beforeKey) {
  const keys = sortedKeys().filter(x => x < beforeKey).reverse();
  for (const k of keys) {
    const w = state.days[k].workout;
    if (!w || w.kind !== 'lift') continue;
    const ex = w.exercises.find(e => e.id === id);
    if (!ex) continue;
    const sets = ex.sets.filter(s => s.done && (s.r !== '' || s.w !== ''));
    if (sets.length) return { key: k, sets, reps: ex.reps };
  }
  return null;
}

function progressHint(id, last) {
  if (!last) return '';
  const top = parseInt(String(last.reps).split('-')[1], 10);
  const ws = last.sets.map(s => num(s.w)).filter(x => x != null);
  if (!top || !ws.length) return '';
  const allTop = last.sets.every(s => (num(s.r) ?? 0) >= top);
  const w = Math.max(...ws);
  if (!allTop) return `Aim for more reps at ${fmtKg(w)} kg`;
  const ex = EXERCISES[id];
  const lower = /Quads|Hamstrings|Glutes|Legs/.test(ex.muscle) && ex.type === 'compound';
  const inc = ex.type === 'isolation' ? 1 : lower ? 5 : 2.5;
  return `You hit the top of the range, try ${fmtKg(w + inc)} kg`;
}

function e1rm(w, r) { return w * (1 + r / 30); }

function bestLifts(beforeKey = '9999') {
  const best = {};
  for (const k of sortedKeys()) {
    if (k >= beforeKey) continue;
    const w = state.days[k].workout;
    if (!w || w.kind !== 'lift') continue;
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        const kg = num(s.w), r = num(s.r);
        if (!s.done || !kg || !r || ex.id === 'plank') continue;
        const v = e1rm(kg, r);
        if (!best[ex.id] || v > best[ex.id].v) best[ex.id] = { v, kg, r, k };
      }
    }
  }
  return best;
}

/* ---------- nutrition ---------- */

function latestWeight() {
  const keys = sortedKeys().reverse();
  for (const k of keys) if (state.days[k].weight != null) return state.days[k].weight;
  return null;
}

function targets() {
  const s = state.settings;
  const w = latestWeight() ?? s.startWeight;
  const bmr = 10 * w + 6.25 * s.heightCm - 5 * s.age + (s.sex === 'f' ? -161 : 5);
  const tdee = bmr * s.activity;
  return {
    kcal: Math.round((tdee + s.surplus + (state.calAdjust || 0)) / 50) * 50,
    protein: Math.round((w * 2) / 5) * 5,
    tdee: Math.round(tdee / 10) * 10,
    water: s.waterTarget,
  };
}

function buildMealPlan(k) {
  const r = rng('meals' + k);
  const t = targets();
  const idx = cat => Math.floor(r() * MEALS[cat].length);
  const main = ['breakfast', 'lunch', 'dinner'].map(cat => ({ cat, i: idx(cat) }));
  let total = main.reduce((a, m) => a + MEALS[m.cat][m.i].kcal, 0);
  const snacks = [];
  while (total < t.kcal - 150 && snacks.length < 3) {
    let i = idx('snack');
    if (snacks.some(s => s.i === i)) i = (i + 1) % MEALS.snack.length;
    snacks.push({ cat: 'snack', i });
    total += MEALS.snack[i].kcal;
  }
  const order = [main[0], snacks[0], main[1], snacks[1], main[2], snacks[2]].filter(Boolean);
  return order.map(m => ({ ...m, eaten: false }));
}

function foodTotals(d) {
  let kcal = 0, p = 0;
  for (const m of d.meals || []) if (m.eaten) { const x = MEALS[m.cat][m.i]; kcal += x.kcal; p += x.p; }
  for (const x of d.extra || []) { kcal += x.kcal || 0; p += x.p || 0; }
  return { kcal, p };
}

/* ---------- daily checklist ---------- */

function checklist(k) {
  const d = state.days[k];
  if (!d) return [];
  const t = targets();
  const f = foodTotals(d);
  const w = d.workout;
  const items = [];
  if (!w) items.push({ id: 'workout', label: 'Train or recover', sub: k === curKey ? 'Pick today\'s workout' : 'Nothing logged', done: false, auto: true });
  else items.push({ id: 'workout', label: w.kind === 'rest' ? 'Recovery: walk + mobility' : `Workout: ${w.title}`, sub: workoutDone(w) ? 'Done' : w.kind === 'rest' ? 'Easy day' : `${setCounts(w).done}/${setCounts(w).total} sets`, done: workoutDone(w), auto: true });
  items.push({ id: 'protein', label: 'Hit your protein', sub: `${f.p} / ${t.protein} g`, done: f.p >= t.protein || !!d.habits.protein });
  items.push({ id: 'calories', label: 'Hit your calories', sub: `${f.kcal} / ${t.kcal} kcal`, done: f.kcal >= t.kcal - 100 || !!d.habits.calories });
  items.push({ id: 'water', label: 'Drink water', sub: `${+(d.water / 1000).toFixed(2)} / ${t.water} L`, done: d.water >= t.water * 1000, auto: true });
  items.push({ id: 'weight', label: 'Morning weigh-in', sub: d.weight != null ? `${fmtKg(d.weight)} kg` : 'After the toilet, before food', done: d.weight != null, auto: true });
  for (const h of state.habits) items.push({ id: h.id, label: h.label, done: !!d.habits[h.id], custom: true });
  for (const task of d.tasks) items.push({ id: task.id, label: task.text, done: task.done, task: true });
  return items;
}

function score(k) {
  const items = checklist(k);
  return items.length ? items.filter(i => i.done).length / items.length : 0;
}

function prepareToday() {
  const k = curKey;
  const d = day(k);
  let changed = false;
  if (!d.carried) {
    // Unfinished to-dos from your last active day roll over automatically.
    const prev = sortedKeys().filter(x => x < k && state.days[x].tasks.length).pop();
    if (prev) {
      for (const t of state.days[prev].tasks) if (!t.done) d.tasks.push({ id: uid(), text: t.text, done: false, carried: true });
    }
    d.carried = true;
    changed = true;
  }
  if (d.workout && !d.workout.picked && !touched(d.workout)) {
    // Left over from the old automatic rotation: let you choose instead.
    d.workout = null;
    changed = true;
  }
  if (!d.meals) { d.meals = buildMealPlan(k); changed = true; }
  if (changed) save();
}

/* ---------- icons ---------- */

const I = {
  today: '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  lift: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M7 3v8M4.5 3v5a2.5 2.5 0 005 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 4-3.5 7.5V14H17"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 19h16M6 15l4-4 3 3 5-6"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14zM4 19.5A2.5 2.5 0 006.5 22H20v-5"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
};

/* ---------- rendering ---------- */

const TABS = [
  ['today', 'Today', I.today],
  ['workout', 'Workout', I.lift],
  ['food', 'Food', I.food],
  ['progress', 'Progress', I.chart],
];

function renderGate() {
  const msg = {
    loading: ['Loading your data…', ''],
    outside: ['Open Daily Gym in Claude', 'This app keeps your data in your Claude account, so it only works when opened on claude.ai or in the Claude app.'],
    unavailable: ['Can\'t reach your data', 'Your saved data isn\'t available in this view. Make sure you\'re signed in to Claude, then reopen the page.'],
    'signed-out': ['Sign in to Claude', 'Sign in to Claude to see and save your workouts, meals and progress.'],
    error: ['Something went wrong loading your data', 'Check your connection and reopen the page.'],
  }[boot];
  document.getElementById('app').innerHTML = `
    <div class="gate">
      <span class="logo big">${I.lift}</span>
      <h2>${msg[0]}</h2>
      ${msg[1] ? `<p class="muted">${msg[1]}</p>` : '<span class="spinner"></span>'}
    </div>`;
}

function render() {
  if (boot !== 'ready') { renderGate(); return; }
  const newKey = todayKey();
  const dayChanged = newKey !== curKey;
  curKey = newKey;
  prepareToday();
  const root = document.getElementById('app');
  const y = window.scrollY;
  root.innerHTML = `
    <header class="topbar">
      <div class="brand"><span class="logo">${I.lift}</span>Daily Gym</div>
      <div class="top-actions">
        <button class="icon-btn" data-act="modal" data-modal="guide" aria-label="How the plan works">${I.book}</button>
        <button class="icon-btn" data-act="modal" data-modal="settings" aria-label="Settings">${I.gear}</button>
      </div>
    </header>
    <main id="main">${VIEWS[tab]()}</main>
    <nav class="tabbar">${TABS.map(([id, label, icon]) => `
      <button class="tab ${tab === id ? 'active' : ''}" data-act="tab" data-tab="${id}">${icon}<span>${label}</span></button>`).join('')}
    </nav>
    <div id="timer"></div>
    ${modal ? renderModal() : ''}
    <div id="toast"></div>`;
  if (!dayChanged) window.scrollTo(0, y);
  afterRender();
  tick();
}

function ring(frac, label) {
  const r = 30, c = 2 * Math.PI * r;
  return `<div class="ring"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" class="ring-bg"/><circle cx="36" cy="36" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"/></svg><div class="ring-label"><span>${label}</span></div></div>`;
}

function greeting() {
  const h = new Date().getHours();
  const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return state.settings.name ? `${part}, ${esc(state.settings.name)}` : part;
}

function viewToday() {
  const d = day(curKey);
  const w = d.workout;
  const items = checklist(curKey);
  const done = items.filter(i => i.done).length;
  const blk = blockInfo(curKey);
  const tip = TIPS[daysBetween('2024-01-01', curKey) % TIPS.length];

  return `
    <section class="hero">
      <div>
        <div class="eyebrow">${fmtDate(curKey, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>${greeting()}</h1>
        <p class="muted">Block ${blk.number} · Week ${blk.week} of 6${blk.week === 6 ? ' (deload)' : ''}</p>
      </div>
      ${ring(items.length ? done / items.length : 0, `<b>${done}</b>/${items.length}`)}
    </section>

    ${todayWorkoutCard(w)}

    <section class="card">
      <h3>Daily checklist</h3>
      <ul class="checklist">${items.filter(i => !i.task).map(checkItem).join('')}</ul>
    </section>

    <section class="card">
      <h3>To-do today</h3>
      <form class="add-row" data-form="task">
        <input name="text" placeholder="Add something you need to do…" autocomplete="off" maxlength="120">
        <button class="icon-btn solid" aria-label="Add">${I.plus}</button>
      </form>
      <ul class="checklist">${d.tasks.map(t => `
        <li class="check-item ${t.done ? 'done' : ''}">
          <button class="tick" data-act="task" data-id="${t.id}" aria-label="Toggle">${I.check}</button>
          <div class="ci-body" data-act="task" data-id="${t.id}"><div class="ci-label">${esc(t.text)}</div>${t.carried ? '<div class="ci-sub">Carried over</div>' : ''}</div>
          <button class="icon-btn subtle" data-act="del-task" data-id="${t.id}" aria-label="Delete">${I.x}</button>
        </li>`).join('') || '<li class="empty">Nothing yet. Add anything you need to get done today.</li>'}
      </ul>
    </section>

    <section class="card tip"><div class="eyebrow">Tip of the day</div><p>${esc(tip)}</p></section>`;
}

function todayWorkoutCard(w) {
  if (!w) {
    const sug = suggestion();
    const title = sug === 'rest' ? 'Recovery day' : DAY_TYPES[sug].title;
    return `
    <section class="card workout-card">
      <div class="eyebrow">Today's training</div>
      <h2>What are you training?</h2>
      <p class="muted">Suggested: <b>${title}</b>, ${sug === 'rest' ? 'since you trained everything recently' : 'the most rested muscles right now'}.</p>
      <div class="row mt-s">
        <button class="btn ghost" data-act="tab" data-tab="workout">Choose</button>
        <button class="btn primary" data-act="pick" data-type="${sug}">${I.play} Start ${esc(title)}</button>
      </div>
    </section>`;
  }
  const done = workoutDone(w);
  let btn;
  if (w.kind === 'rest') btn = done ? `${I.check} Recovery done` : `${I.play} Open recovery plan`;
  else {
    const c = setCounts(w);
    btn = done ? `${I.check} Done, nice work` : c.done ? `${I.play} Continue (${c.done}/${c.total} sets)` : `${I.play} Start workout`;
  }
  return `
    <section class="card workout-card ${done ? 'is-done' : ''}">
      <div class="eyebrow">${w.kind === 'rest' ? 'Rest day' : "Today's training"}</div>
      <h2>${esc(w.title)}</h2>
      <p class="muted">${esc(w.focus)}</p>
      ${w.kind === 'lift' ? `<div class="chips"><span class="chip">${w.exercises.length} exercises</span><span class="chip">${setCounts(w).total} sets</span><span class="chip">~${estMinutes(w)} min</span></div>` : ''}
      <button class="btn ${done ? 'ghost' : 'primary'} block" data-act="tab" data-tab="workout">${btn}</button>
    </section>`;
}

function estMinutes(w) {
  let sec = 6 * 60; // warm-up
  for (const e of w.exercises) sec += e.sets.length * (45 + e.rest);
  return Math.round(sec / 60 / 5) * 5;
}

function checkItem(i) {
  const d = day(curKey);
  let extra = '';
  let bodyAct = `data-act="habit" data-id="${i.id}"`;
  if (i.id === 'workout') bodyAct = 'data-act="tab" data-tab="workout"';
  if (i.id === 'protein' || i.id === 'calories') bodyAct = 'data-act="tab" data-tab="food"';
  if (i.id === 'water') {
    bodyAct = 'data-act="water" data-amt="250"';
    extra = `<div class="stepper"><button class="icon-btn subtle" data-act="water" data-amt="-250" aria-label="Less water">${I.minus}</button><button class="icon-btn subtle" data-act="water" data-amt="250" aria-label="250 ml more">${I.plus}</button></div>`;
  }
  if (i.id === 'weight') {
    bodyAct = '';
    extra = `<div class="weight-in"><input type="number" inputmode="decimal" step="0.1" min="30" max="250" placeholder="kg" value="${d.weight ?? ''}" data-input="weight" aria-label="Weight in kg"></div>`;
  }
  return `
    <li class="check-item ${i.done ? 'done' : ''}">
      <button class="tick" ${i.auto ? bodyAct || 'data-act="focus-weight"' : `data-act="habit" data-id="${i.id}"`} aria-label="Toggle">${I.check}</button>
      <div class="ci-body" ${bodyAct}><div class="ci-label">${esc(i.label)}</div>${i.sub ? `<div class="ci-sub">${esc(i.sub)}</div>` : ''}</div>
      ${extra}
    </li>`;
}

/* ----- workout ----- */

function viewWorkout() {
  const d = day(curKey);
  const w = d.workout;
  if (!w) return viewPicker();
  return w.kind === 'rest' ? viewRest(w) : viewLift(w);
}

function viewPicker() {
  const rec = recovery();
  const sug = suggestion(rec);
  const card = (type, title, focus, note, warn) => `
    <button class="pick ${sug === type ? 'suggested' : ''}" data-act="pick" data-type="${type}">
      ${sug === type ? '<span class="badge">Suggested</span>' : ''}
      <b>${esc(title)}</b>
      <span class="pick-focus">${esc(focus)}</span>
      <span class="pick-note ${warn ? 'warn' : ''}">${esc(note)}</span>
    </button>`;
  const cards = Object.entries(DAY_TYPES).map(([type, t]) => {
    const tired = plannedGroups(type).filter(g => rec[g] != null && rec[g] <= 1);
    const last = lastDoneType(type);
    const note = tired.length
      ? `${tired.map(g => GROUPS[g]).join(' & ')} worked ${rec[tired[0]] === 0 ? 'today' : 'yesterday'}`
      : last != null ? `Last done ${dayAgo(last).toLowerCase()}` : 'Not done yet';
    return card(type, t.title, t.focus, note, tired.length > 0);
  }).join('');
  return `
    <section class="card">
      <div class="eyebrow">${fmtDate(curKey)}</div>
      <h2>What are you training today?</h2>
      <p class="muted">About ${state.settings.sessionLength} minutes each. Muscles need around 48 hours to recover, so the suggestion goes for what's rested longest.</p>
    </section>
    <section class="pick-grid">
      ${cards}
      ${card('rest', 'Recovery', 'Walk, mobility and core', 'Good after a few hard days', false)}
    </section>
    <section class="card">
      <h3>Muscle recovery</h3>
      <ul class="rows">${Object.entries(GROUPS).map(([g, name]) => {
        const n = rec[g];
        const ready = n == null || n >= 2;
        return `<li><span>${name}</span><span class="muted">${dayAgo(n)}</span><span class="status ${ready ? 'ready' : 'rest'}"><i></i>${ready ? 'Ready' : 'Recovering'}</span></li>`;
      }).join('')}</ul>
    </section>`;
}

function viewRest(w) {
  const done = RECOVERY.filter(x => w.done[x.id]).length;
  return `
    <section class="card">
      <div class="eyebrow">${fmtDate(curKey)} · Rest day</div>
      <h2>${esc(w.title)}</h2>
      <p class="muted">Muscle is built while you recover. Keep moving, stay loose, eat well.</p>
    </section>
    <section class="card">
      <h3>Recovery plan <span class="muted small">${done}/${RECOVERY.length}</span></h3>
      <ul class="checklist">${RECOVERY.map(x => `
        <li class="check-item ${w.done[x.id] ? 'done' : ''}">
          <button class="tick" data-act="rest-item" data-id="${x.id}" aria-label="Toggle">${I.check}</button>
          <div class="ci-body" data-act="rest-item" data-id="${x.id}"><div class="ci-label">${esc(x.label)}</div><div class="ci-sub">${esc(x.detail)}</div></div>
        </li>`).join('')}
      </ul>
      ${w.finished ? `<p class="done-note">${I.check} Recovery done</p>` : `<button class="btn primary block" data-act="finish-rest">Mark recovery done</button>`}
    </section>
    <section class="actions">
      <button class="btn ghost block" data-act="switch">${I.lift} Train today instead</button>
    </section>`;
}

function viewLift(w) {
  const { done: setsDone, total: setsTotal } = setCounts(w);
  const blk = BLOCK[w.week - 1];
  return `
    ${w.finished ? summaryCard(w) : ''}
    <section class="card">
      <div class="eyebrow">${fmtDate(curKey)} · Block ${w.block}, week ${w.week}</div>
      <h2>${esc(w.title)}</h2>
      <p class="muted">${esc(w.focus)}</p>
      <div class="chips">
        <span class="chip">${setsDone}/${setsTotal} sets</span>
        <span class="chip">~${estMinutes(w)} min</span>
        <span class="chip">${w.rir} reps in reserve</span>
        ${w.started && !w.finished ? `<span class="chip accent" id="elapsed"></span>` : ''}
      </div>
      <p class="block-note">${esc(blk.note)}</p>
      <details class="warmup"><summary>Warm-up</summary><ul>${WARMUP.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>
    </section>
    ${w.exercises.map((e, i) => exerciseCard(e, i, w)).join('')}
    <section class="card">
      <h3>Add an exercise</h3>
      <div class="add-row">
        <select data-input="add-ex" aria-label="Add exercise">
          <option value="">Choose…</option>
          ${Object.entries(groupByMuscle()).map(([m, ids]) => `<optgroup label="${esc(m)}">${ids.map(id => `<option value="${id}">${esc(EXERCISES[id].name)}</option>`).join('')}</optgroup>`).join('')}
        </select>
      </div>
      <h3 class="mt">Notes</h3>
      <textarea data-input="notes" rows="3" placeholder="How did it feel? Anything to remember next time?">${esc(w.notes)}</textarea>
    </section>
    <section class="actions">
      ${w.finished
        ? `<button class="btn ghost block" data-act="reopen">Reopen workout</button>`
        : `<button class="btn primary block big" data-act="finish">${I.check} Finish workout</button>`}
      <div class="row">
        <button class="btn ghost" data-act="shuffle">${I.swap} New exercises</button>
        <button class="btn ghost" data-act="switch">Change workout</button>
      </div>
    </section>`;
}

function groupByMuscle() {
  const g = {};
  for (const [id, e] of Object.entries(EXERCISES)) {
    const m = e.muscle.split(' / ')[0];
    (g[m] = g[m] || []).push(id);
  }
  return g;
}

function exerciseCard(e, i, w) {
  const ex = EXERCISES[e.id];
  const last = lastPerformance(e.id, curKey);
  const hint = progressHint(e.id, last);
  const open = openInfo.has(i);
  const allDone = e.sets.length && e.sets.every(s => s.done);
  const video = `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' proper form')}`;
  return `
    <article class="card ex ${allDone ? 'is-done' : ''}">
      <div class="ex-head">
        <div class="ex-title">
          ${e.anchor ? '<span class="badge">Main lift</span>' : ''}
          <h3>${esc(ex.name)}</h3>
          <p class="muted small">${esc(ex.muscle)} · ${e.sets.length} × ${e.reps} · rest ${fmtClock(e.rest)}</p>
        </div>
        <div class="ex-btns">
          <button class="icon-btn subtle ${open ? 'on' : ''}" data-act="info" data-i="${i}" aria-label="How to">${I.info}</button>
          ${w.finished ? '' : `<button class="icon-btn subtle" data-act="swap" data-i="${i}" aria-label="Swap exercise">${I.swap}</button>`}
        </div>
      </div>
      ${open ? `<div class="ex-info"><p>${esc(ex.cue)}</p><a href="${video}" target="_blank" rel="noopener">Watch form videos ${I.chevron}</a></div>` : ''}
      ${last ? `<div class="last"><span>Last (${fmtDate(last.key, { day: 'numeric', month: 'short' })}): ${last.sets.map(s => `${s.w !== '' ? fmtKg(num(s.w)) + '×' : ''}${esc(s.r) || '?'}`).join(', ')}</span>${hint ? `<b>${esc(hint)}</b>` : ''}</div>` : ''}
      <div class="sets">
        <div class="set-row head"><span>Set</span><span>kg</span><span>Reps</span><span></span></div>
        ${e.sets.map((s, j) => {
          const ls = last && (last.sets[j] || last.sets[last.sets.length - 1]);
          return `
          <div class="set-row ${s.done ? 'done' : ''}">
            <span class="set-n">${j + 1}</span>
            <input type="text" inputmode="decimal" value="${esc(s.w)}" placeholder="${ls && ls.w !== '' ? esc(ls.w) : '–'}" data-input="w" data-i="${i}" data-j="${j}" aria-label="Weight">
            <input type="text" inputmode="numeric" value="${esc(s.r)}" placeholder="${ls && ls.r !== '' ? esc(ls.r) : esc(e.reps)}" data-input="r" data-i="${i}" data-j="${j}" aria-label="Reps">
            <button class="tick ${s.done ? 'on' : ''}" data-act="set" data-i="${i}" data-j="${j}" aria-label="Set done">${I.check}</button>
          </div>`;
        }).join('')}
      </div>
      <div class="ex-foot">
        <button class="link-btn" data-act="add-set" data-i="${i}">${I.plus} Set</button>
        ${e.sets.length > 1 ? `<button class="link-btn" data-act="rm-set" data-i="${i}">${I.minus} Set</button>` : ''}
        ${!e.anchor ? `<button class="link-btn danger" data-act="rm-ex" data-i="${i}">Remove</button>` : ''}
      </div>
    </article>`;
}

function workoutStats(w, k) {
  let sets = 0, volume = 0;
  for (const e of w.exercises) for (const s of e.sets) if (s.done) { sets++; volume += (num(s.w) || 0) * (num(s.r) || 0); }
  const before = bestLifts(k);
  const prs = [];
  for (const e of w.exercises) {
    let top = 0;
    for (const s of e.sets) { const kg = num(s.w), r = num(s.r); if (s.done && kg && r && e.id !== 'plank') top = Math.max(top, e1rm(kg, r)); }
    if (top && (!before[e.id] || top > before[e.id].v + 0.01)) prs.push(EXERCISES[e.id].name);
  }
  return { sets, volume: Math.round(volume), prs, dur: w.started && w.finished ? w.finished - w.started : null };
}

function summaryCard(w) {
  const st = workoutStats(w, curKey);
  return `
    <section class="card summary">
      <div class="eyebrow">Workout complete</div>
      <h2>Nice work 💪</h2>
      <div class="stats">
        <div><b>${st.sets}</b><span>sets</span></div>
        <div><b>${st.volume ? st.volume.toLocaleString() : '–'}</b><span>kg lifted</span></div>
        <div><b>${st.dur ? fmtDur(st.dur) : '–'}</b><span>time</span></div>
      </div>
      ${st.prs.length ? `<p class="pr">🏆 New best: ${st.prs.map(esc).join(', ')}</p>` : ''}
      <p class="muted small">Now eat a proper meal with protein and get some sleep. That's when the growing happens.</p>
    </section>`;
}

/* ----- food ----- */

function bar(val, max, label) {
  const f = Math.min(1, max ? val / max : 0);
  return `<div class="meter"><div class="meter-top"><span>${label}</span><span><b>${val}</b> / ${max}</span></div><div class="meter-track"><div class="meter-fill" style="width:${f * 100}%"></div></div></div>`;
}

function viewFood() {
  const d = day(curKey);
  const t = targets();
  const f = foodTotals(d);
  const label = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  return `
    <section class="card">
      <div class="eyebrow">${fmtDate(curKey)} · Lean bulk</div>
      <h2>Fuel for growth</h2>
      ${bar(f.kcal, t.kcal, 'Calories')}
      ${bar(f.p, t.protein, 'Protein (g)')}
      <p class="muted small">Maintenance is about ${t.tdee} kcal. Your target adds a ${state.settings.surplus + (state.calAdjust || 0)} kcal surplus for slow, lean weight gain.</p>
    </section>
    ${snapCard()}
    <section class="card">
      <h3>Today's meal plan</h3>
      <p class="muted small">Tick meals as you eat them. Swap anything you don't fancy. Values are estimates.</p>
      <ul class="meals">${d.meals.map((m, i) => {
        const x = MEALS[m.cat][m.i];
        return `
        <li class="meal ${m.eaten ? 'done' : ''}">
          <button class="tick" data-act="meal" data-i="${i}" aria-label="Eaten">${I.check}</button>
          <div class="ci-body" data-act="meal" data-i="${i}">
            <div class="eyebrow">${label[m.cat]}</div>
            <div class="ci-label">${esc(x.name)}</div>
            <div class="ci-sub">${esc(x.detail)}</div>
            <div class="macros"><span>${x.kcal} kcal</span><span>${x.p} g protein</span></div>
          </div>
          <button class="icon-btn subtle" data-act="swap-meal" data-i="${i}" aria-label="Swap meal">${I.swap}</button>
        </li>`;
      }).join('')}</ul>
    </section>
    <section class="card">
      <h3>Quick add</h3>
      <p class="muted small">Already know the numbers? Type them in.</p>
      <form class="quick-add" data-form="food">
        <input name="name" placeholder="What was it?" maxlength="60" autocomplete="off">
        <input name="kcal" type="number" inputmode="numeric" placeholder="kcal" min="0" max="5000">
        <input name="p" type="number" inputmode="numeric" placeholder="protein g" min="0" max="300">
        <button class="icon-btn solid" aria-label="Add food">${I.plus}</button>
      </form>
      <ul class="checklist">${(d.extra || []).map((x, i) => `
        <li class="check-item done">
          ${x.thumb ? `<img class="thumb" src="${x.thumb}" alt="">` : ''}
          <div class="ci-body"><div class="ci-label">${x.ai ? I.spark : ''}${esc(x.name || 'Food')}</div><div class="ci-sub">${x.kcal || 0} kcal · ${x.p || 0} g protein${x.detail ? `<br>${esc(x.detail)}` : ''}</div></div>
          <button class="icon-btn subtle" data-act="del-food" data-i="${i}" aria-label="Delete">${I.x}</button>
        </li>`).join('')}</ul>
    </section>
    <section class="card tip">
      <div class="eyebrow">Struggling to eat enough?</div>
      <p>Drink calories (milk, shakes), add olive oil or peanut butter to meals, and eat every 3-4 hours. A mass shake is an easy 800 kcal.</p>
    </section>`;
}

/* ----- AI meal snap ----- */

function snapTotals(r) {
  return r.items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.protein_g }), { kcal: 0, p: 0 });
}

function snapCard() {
  if (!mealCaps.text) {
    return `
    <section class="card snap">
      <h3>Snap a meal</h3>
      <p class="muted small">Meal analysis needs Claude, which isn't available in this view. You can still add meals with Quick add below.</p>
    </section>`;
  }
  const r = snap.result;
  return `
    <section class="card snap">
      <h3>Snap a meal</h3>
      <p class="muted small">Claude estimates calories and protein from a photo, a description, or both. It uses your Claude account, so there's nothing to set up.</p>
      ${mealCaps.images ? `
      <label class="photo-pick ${snap.preview ? 'has' : ''}">
        ${snap.preview ? `<img src="${snap.preview}" alt="Your meal">` : `${I.camera}<span>Take or choose a photo</span>`}
        <input type="file" accept="image/*" data-input="snap-photo" hidden>
      </label>
      ${snap.preview ? `<button class="link-btn" data-act="snap-clear-photo">${I.x} Remove photo</button>` : ''}` : ''}
      <textarea data-input="snap-desc" rows="2" placeholder="Describe it, or photograph it on your scale. Weights help a lot, e.g. 80 g oats (dry), 250 ml whole milk, 1 banana">${esc(snap.desc)}</textarea>
      <button class="btn primary block" data-act="snap-analyze" ${snap.busy ? 'disabled' : ''}>${snap.busy ? '<span class="spinner"></span> Claude is looking…' : `${I.spark} ${r ? 'Analyse again' : 'Analyse'}`}</button>
      ${snap.busy ? '<p class="muted small center">This usually takes 10-40 seconds.</p>' : ''}
      ${snap.error ? `<p class="error">${esc(snap.error)}</p>` : ''}
      ${r && !snap.busy ? snapResult(r) : ''}
    </section>`;
}

function snapResult(r) {
  if (!r.is_food || !r.items.length) {
    return `<div class="ai-result"><p>That doesn't look like food or drink. Try another photo or describe what you ate.</p></div>`;
  }
  const tot = snapTotals(r);
  const conf = { high: 'High confidence', medium: 'Medium confidence', low: 'Rough guess' }[r.confidence] || '';
  return `
    <div class="ai-result">
      <div class="ai-head">
        <div><div class="eyebrow">Estimate</div><h3>${esc(r.title)}</h3></div>
        <span class="chip conf-${esc(r.confidence)}">${conf}</span>
      </div>
      <div class="ai-total"><b>${tot.kcal}</b> kcal · <b>${tot.p}</b> g protein</div>
      <div class="muted small">Likely range ${r.kcal_low}-${r.kcal_high} kcal</div>
      ${r.question ? `<div class="ai-question">${I.info}<span>${esc(r.question)} <em>Add the answer to the description and tap Analyse again.</em></span></div>` : ''}
      <ul class="ai-items">${r.items.map((it, i) => `
        <li>
          <div class="ai-name"><b>${esc(it.name)}</b><span>${esc(it.amount)}</span></div>
          <label><input type="number" inputmode="numeric" min="0" value="${it.kcal}" data-input="ai-kcal" data-i="${i}" aria-label="${esc(it.name)} calories"><span>kcal</span></label>
          <label><input type="number" inputmode="numeric" min="0" value="${it.protein_g}" data-input="ai-p" data-i="${i}" aria-label="${esc(it.name)} protein"><span>g prot</span></label>
        </li>`).join('')}
      </ul>
      ${r.assumptions.length ? `<div class="ai-assume"><div class="eyebrow">Assumed</div><ul>${r.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
      <p class="muted small">Numbers look off? Edit them above, or fix the description and analyse again.</p>
      <div class="row">
        <button class="btn ghost" data-act="snap-clear">Discard</button>
        <button class="btn primary" data-act="snap-add">${I.plus} Add to today</button>
      </div>
    </div>`;
}

/* ----- progress ----- */

function weightEntries(daysBack = 120) {
  const from = addDays(curKey, -daysBack);
  return sortedKeys().filter(k => k >= from && state.days[k].weight != null).map(k => ({ k, v: state.days[k].weight }));
}

function weeklyRate() {
  const pts = weightEntries(28);
  if (pts.length < 4 || daysBetween(pts[0].k, pts[pts.length - 1].k) < 10) return null;
  const xs = pts.map(p => daysBetween(pts[0].k, p.k)), ys = pts.map(p => p.v);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let nume = 0, den = 0;
  xs.forEach((x, i) => { nume += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? (nume / den) * 7 : null;
}

function streak() {
  let k = curKey, n = 0;
  if (score(k) < 0.6) k = addDays(k, -1);
  while (score(k) >= 0.6) { n++; k = addDays(k, -1); }
  return n;
}

function weightChart(pts, goal) {
  if (pts.length < 2) return '<div class="empty chart-empty">Log your weight on a few mornings to see your trend here.</div>';
  const W = 340, H = 180, L = 34, R = 10, T = 12, B = 22;
  const vals = pts.map(p => p.v);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(goal, ...vals) + 0.5);
  const span = Math.max(1, daysBetween(pts[0].k, pts[pts.length - 1].k));
  const x = k => L + (daysBetween(pts[0].k, k) / span) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  const ticks = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.k).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  chartPts = pts.map(p => ({ ...p, cx: x(p.k), cy: y(p.v) }));
  return `
    <div class="chart-wrap">
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bodyweight over time">
        ${ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join('')}
        <line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}"/>
        <text class="goal-label" x="${W - R}" y="${y(goal) - 5}" text-anchor="end">Goal ${fmtKg(goal)} kg</text>
        <path class="line" d="${path}"/>
        ${chartPts.map(p => `<circle class="dot" cx="${p.cx}" cy="${p.cy}" r="3"/>`).join('')}
        <text class="axis" x="${L}" y="${H - 5}">${fmtDate(pts[0].k, { day: 'numeric', month: 'short' })}</text>
        <text class="axis" x="${W - R}" y="${H - 5}" text-anchor="end">${fmtDate(pts[pts.length - 1].k, { day: 'numeric', month: 'short' })}</text>
        <line class="cross" id="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"/>
        <circle class="hover-dot" id="hover-dot" r="5" style="display:none"/>
        <rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>
      </svg>
      <div class="tooltip" id="chart-tip" hidden></div>
    </div>`;
}
let chartPts = [];

function heatGrid() {
  const today = parseKey(curKey);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = addDays(curKey, -mondayOffset - 28);
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const k = addDays(start, i);
    if (k > curKey) { cells.push('<div class="cell future"></div>'); continue; }
    const s = state.days[k] ? score(k) : 0;
    const lvl = s === 0 ? 0 : s < 0.34 ? 1 : s < 0.67 ? 2 : s < 1 ? 3 : 4;
    const w = state.days[k]?.workout;
    const lifted = trained(w);
    cells.push(`<div class="cell l${lvl} ${k === curKey ? 'today' : ''}" title="${fmtDate(k)}: ${Math.round(s * 100)}%${lifted ? ' · trained' : ''}">${lifted ? '<i></i>' : ''}</div>`);
  }
  return `
    <div class="heat-days">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="heat">${cells.join('')}</div>
    <div class="heat-legend"><span>Less</span>${[0, 1, 2, 3, 4].map(l => `<div class="cell l${l}"></div>`).join('')}<span>More</span><span class="sep"></span><div class="cell l3"><i></i></div><span>Trained</span></div>`;
}

function viewProgress() {
  const s = state.settings;
  const cur = latestWeight();
  const now = cur ?? s.startWeight;
  const frac = Math.max(0, Math.min(1, (now - s.startWeight) / (s.goalWeight - s.startWeight || 1)));
  const rate = weeklyRate();
  const pts = weightEntries();
  const best = bestLifts();
  const bestList = Object.entries(best).sort((a, b) => b[1].v - a[1].v).slice(0, 8);
  const mondayKey = addDays(curKey, -((parseKey(curKey).getDay() + 6) % 7));
  const weekLifts = sortedKeys().filter(k => k >= mondayKey && k <= curKey && trained(state.days[k].workout)).length;
  const history = sortedKeys().reverse().filter(k => trained(state.days[k].workout));

  let advice = '';
  if (rate != null) {
    if (rate < 0.15) advice = `<div class="advice"><p>You're gaining ${rate.toFixed(2)} kg/week, a bit slow for a lean bulk. Try eating ~150 kcal more per day.</p><button class="btn small primary" data-act="cal-adjust" data-amt="150">Add 150 kcal to my target</button></div>`;
    else if (rate > 0.5) advice = `<div class="advice"><p>You're gaining ${rate.toFixed(2)} kg/week. That's fast, and some of it will be fat. Consider ~100 kcal less per day.</p><button class="btn small ghost" data-act="cal-adjust" data-amt="-100">Remove 100 kcal from target</button></div>`;
    else advice = `<div class="advice good"><p>${I.check} ${rate.toFixed(2)} kg/week is right in the sweet spot. Keep doing what you're doing.</p></div>`;
  }
  const eta = rate && rate > 0.05 && now < s.goalWeight ? parseKey(addDays(curKey, Math.round(((s.goalWeight - now) / rate) * 7))).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;

  return `
    <section class="card">
      <div class="eyebrow">Bodyweight</div>
      <div class="weight-hero">
        <div><b>${fmtKg(now)}</b><span>kg now</span></div>
        <div><b>${fmtKg(Math.max(0, s.goalWeight - now))}</b><span>kg to go</span></div>
        <div><b>${rate != null ? (rate >= 0 ? '+' : '') + rate.toFixed(2) : '–'}</b><span>kg / week</span></div>
      </div>
      <div class="journey"><span>${fmtKg(s.startWeight)}</span><div class="meter-track"><div class="meter-fill" style="width:${frac * 100}%"></div></div><span>${fmtKg(s.goalWeight)}</span></div>
      ${eta ? `<p class="muted small">At this pace you'll hit ${fmtKg(s.goalWeight)} kg around <b>${eta}</b>.</p>` : ''}
      ${weightChart(pts, s.goalWeight)}
      ${advice}
    </section>

    <section class="card">
      <div class="stats">
        <div><b>${streak()}</b><span>day streak</span></div>
        <div><b>${weekLifts}/${s.weeklyGoal}</b><span>workouts this week</span></div>
        <div><b>${history.length}</b><span>total workouts</span></div>
      </div>
      <h3 class="mt">Last 5 weeks</h3>
      ${heatGrid()}
    </section>

    <section class="card">
      <h3>Best lifts</h3>
      ${bestList.length ? `<p class="muted small">Estimated one-rep max from your best set.</p><ul class="rows">${bestList.map(([id, b]) => `
        <li><span>${esc(EXERCISES[id].name)}</span><span class="muted">${fmtKg(b.kg)} × ${b.r}</span><b>${Math.round(b.v)} kg</b></li>`).join('')}</ul>`
        : '<div class="empty">Log weights on your sets and your best lifts will show up here.</div>'}
    </section>

    <section class="card">
      <h3>Workout history</h3>
      ${history.length ? `<ul class="rows link">${history.slice(0, 30).map(k => {
        const w = state.days[k].workout;
        const st = workoutStats(w, k);
        return `<li data-act="modal" data-modal="history" data-key="${k}"><span>${fmtDate(k)}</span><span>${esc(w.title)}</span><span class="muted">${st.sets} set${st.sets === 1 ? '' : 's'}</span>${I.chevron}</li>`;
      }).join('')}</ul>` : '<div class="empty">Finished workouts will show up here.</div>'}
    </section>`;
}

const VIEWS = { today: viewToday, workout: viewWorkout, food: viewFood, progress: viewProgress };

/* ----- modals ----- */

function renderModal() {
  let body = '';
  if (modal.type === 'guide') {
    body = `<h2>How your plan works</h2>${GUIDE.map(g => `<h3>${esc(g.h)}</h3><p>${esc(g.b)}</p>`).join('')}`;
  } else if (modal.type === 'history') {
    const w = state.days[modal.key].workout;
    const st = workoutStats(w, modal.key);
    body = `
      <div class="eyebrow">${fmtDate(modal.key, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <h2>${esc(w.title)}</h2>
      <p class="muted">${st.sets} sets · ${st.volume ? st.volume.toLocaleString() + ' kg' : 'no weights logged'}${st.dur ? ' · ' + fmtDur(st.dur) : ''}</p>
      <ul class="rows">${w.exercises.map(e => `<li class="stack"><b>${esc(EXERCISES[e.id].name)}</b><span class="muted">${e.sets.filter(s => s.done).map(s => `${s.w !== '' ? fmtKg(num(s.w)) + ' kg × ' : ''}${esc(s.r) || '✓'}`).join(', ') || 'Skipped'}</span></li>`).join('')}</ul>
      ${w.notes ? `<h3>Notes</h3><p>${esc(w.notes)}</p>` : ''}`;
  } else if (modal.type === 'confirm') {
    body = `<h3 class="confirm-q">${esc(modal.message)}</h3>
      <div class="row mt-s">
        <button class="btn ghost" data-act="confirm-no">Cancel</button>
        <button class="btn ${modal.danger ? 'danger-solid' : 'primary'}" data-act="confirm-yes">${esc(modal.okLabel)}</button>
      </div>`;
  } else if (modal.type === 'settings' || modal.type === 'welcome') {
    body = settingsForm(modal.type === 'welcome');
  }
  return `<div class="modal-bg" data-act="close-modal"></div>
    <div class="modal" role="dialog" aria-modal="true">
      ${modal.type === 'welcome' || modal.type === 'confirm' ? '' : `<button class="icon-btn subtle close" data-act="close-modal" aria-label="Close">${I.x}</button>`}
      ${body}
    </div>`;
}

function settingsForm(welcome) {
  const s = state.settings;
  return `
    ${welcome ? `<div class="eyebrow">Welcome</div><h2>Let's set up your plan</h2><p class="muted">A new workout every day, a daily checklist, and a meal plan to get you from ${fmtKg(s.startWeight)} to ${fmtKg(s.goalWeight)} kg. You can change all of this later.</p>` : '<h2>Settings</h2>'}
    <form data-form="settings" class="settings">
      <label>Your name<input name="name" value="${esc(s.name)}" maxlength="30" placeholder="Optional"></label>
      <div class="grid2">
        <label>Current weight (kg)<input name="startWeight" type="number" step="0.1" inputmode="decimal" value="${s.startWeight}"></label>
        <label>Goal weight (kg)<input name="goalWeight" type="number" step="0.1" inputmode="decimal" value="${s.goalWeight}"></label>
      </div>
      <div class="grid2">
        <label>Workouts per week<select name="weeklyGoal">${[3, 4, 5, 6].map(n => `<option value="${n}" ${s.weeklyGoal === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Session length<select name="sessionLength">${[30, 45, 60].map(n => `<option value="${n}" ${s.sessionLength === n ? 'selected' : ''}>${n} min</option>`).join('')}</select></label>
      </div>
      <p class="muted small">You pick what to train each day. The weekly number is just your target.</p>
      <details ${welcome ? '' : 'open'}>
        <summary>Body details (for calorie targets)</summary>
        <div class="grid2">
          <label>Height (cm)<input name="heightCm" type="number" inputmode="numeric" value="${s.heightCm}"></label>
          <label>Age<input name="age" type="number" inputmode="numeric" value="${s.age}"></label>
          <label>Sex<select name="sex"><option value="m" ${s.sex === 'm' ? 'selected' : ''}>Male</option><option value="f" ${s.sex === 'f' ? 'selected' : ''}>Female</option></select></label>
          <label>Activity outside the gym<select name="activity">
            ${[[1.4, 'Mostly sitting'], [1.55, 'On my feet some'], [1.7, 'Active job / sport'], [1.85, 'Very active']].map(([v, l]) => `<option value="${v}" ${Number(s.activity) === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
          <label>Calorie surplus<input name="surplus" type="number" inputmode="numeric" step="50" value="${s.surplus}"></label>
          <label>Water target (L)<input name="waterTarget" type="number" step="0.5" inputmode="decimal" value="${s.waterTarget}"></label>
        </div>
      </details>
      ${welcome ? '' : `
      <fieldset>
        <legend>Daily habits</legend>
        <ul class="habit-edit">${state.habits.map(h => `<li><span>${esc(h.label)}</span><button type="button" class="icon-btn subtle" data-act="del-habit" data-id="${h.id}" aria-label="Remove">${I.x}</button></li>`).join('')}</ul>
        <div class="add-row"><input id="new-habit" placeholder="e.g. Read 10 pages" maxlength="60"><button type="button" class="icon-btn solid" data-act="add-habit" aria-label="Add habit">${I.plus}</button></div>
      </fieldset>
      <label class="switch"><input type="checkbox" name="restTimer" ${s.restTimer ? 'checked' : ''}> Rest timer after each set</label>`}
      <button class="btn primary block big" type="submit">${welcome ? "Let's go" : 'Save'}</button>
    </form>
    ${welcome ? '' : `
    <div class="danger-zone">
      <h3>Program</h3>
      <p class="muted small">Current block started ${fmtDate(s.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}. Restarting begins week 1 today with new main lifts.</p>
      <button class="btn ghost" data-act="restart-block">Restart block today</button>
      <h3>Your data</h3>
      <p class="muted small">Everything is saved to your Claude account, privately, and is there on any device where you open this page.</p>
      <div class="row">
        <button class="btn ghost" data-act="export">Download backup</button>
        <label class="btn ghost">Restore backup<input type="file" accept="application/json,.json" data-input="import" hidden></label>
      </div>
      <h3>Bring over your old data</h3>
      <p class="muted small">On the old Daily Gym app, tap <b>Copy my data</b>, then paste it here.</p>
      <textarea id="paste-data" rows="3" placeholder="Paste your data here"></textarea>
      <button class="btn ghost block" data-act="paste-import">Import pasted data</button>
      <button class="btn danger-btn" data-act="reset">Erase everything</button>
    </div>`}`;
}

/* ---------- after render: chart hover etc. ---------- */

function afterRender() {
  const svg = document.querySelector('.chart');
  if (!svg || !chartPts.length) return;
  const tip = document.getElementById('chart-tip');
  const cross = document.getElementById('cross');
  const dot = document.getElementById('hover-dot');
  const move = ev => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    let near = chartPts[0];
    for (const c of chartPts) if (Math.abs(c.cx - p.x) < Math.abs(near.cx - p.x)) near = c;
    cross.setAttribute('x1', near.cx); cross.setAttribute('x2', near.cx); cross.style.display = '';
    dot.setAttribute('cx', near.cx); dot.setAttribute('cy', near.cy); dot.style.display = '';
    tip.hidden = false;
    tip.innerHTML = `<b>${fmtKg(near.v)} kg</b><span>${fmtDate(near.k)}</span>`;
    const box = svg.getBoundingClientRect();
    const px = (near.cx / svg.viewBox.baseVal.width) * box.width;
    tip.style.left = `${Math.min(box.width - 90, Math.max(0, px - 45))}px`;
  };
  const leave = () => { tip.hidden = true; cross.style.display = 'none'; dot.style.display = 'none'; };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
}

/* ---------- rest timer ---------- */

function startTimer(sec, label) {
  timer = { end: Date.now() + sec * 1000, total: sec, label, alerted: false };
  tick();
}

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(t => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.2, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch (e) { /* audio not available */ }
}

function tick() {
  const el = document.getElementById('timer');
  if (el) {
    if (!timer) { el.className = ''; el.innerHTML = ''; }
    else {
      const left = (timer.end - Date.now()) / 1000;
      if (left <= 0 && !timer.alerted) {
        timer.alerted = true;
        navigator.vibrate?.([200, 100, 200]);
        beep();
        setTimeout(() => { if (timer && timer.alerted) { timer = null; tick(); } }, 4000);
      }
      el.className = `show ${left <= 0 ? 'go' : ''}`;
      el.innerHTML = left > 0
        ? `<div class="timer-fill" style="width:${(left / timer.total) * 100}%"></div><span class="timer-label">Rest · ${esc(timer.label)}</span><b>${fmtClock(left)}</b><button data-act="timer-add">+30s</button><button data-act="timer-skip">Skip</button>`
        : `<span class="timer-label">Rest over</span><b>Next set!</b><button data-act="timer-skip">OK</button>`;
    }
  }
  const el2 = document.getElementById('elapsed');
  const w = state.days[curKey]?.workout;
  if (el2 && w?.started) el2.textContent = `⏱ ${fmtClock((Date.now() - w.started) / 1000)}`;
}

/* ---------- actions ---------- */

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = ''; }, 2600);
}

function curWorkout() { return day(curKey).workout; }

const ACTIONS = {
  tab(el) {
    const next = el.dataset.tab;
    if (next !== tab) { tab = next; render(); window.scrollTo(0, 0); } else render();
  },
  modal(el) { modal = { type: el.dataset.modal, key: el.dataset.key }; render(); },
  'close-modal'() {
    if (modal?.type === 'welcome') return;
    if (modal?.type === 'confirm') { answer(false); return; }
    modal = null; render();
  },
  'confirm-yes'() { answer(true); },
  'confirm-no'() { answer(false); },
  habit(el) { const d = day(curKey); d.habits[el.dataset.id] = !d.habits[el.dataset.id]; save(); render(); },
  task(el) { const t = day(curKey).tasks.find(x => x.id === el.dataset.id); if (t) t.done = !t.done; save(); render(); },
  'del-task'(el) { const d = day(curKey); d.tasks = d.tasks.filter(x => x.id !== el.dataset.id); save(); render(); },
  water(el) { const d = day(curKey); d.water = Math.max(0, d.water + Number(el.dataset.amt)); save(); render(); },
  'focus-weight'() { document.querySelector('[data-input="weight"]')?.focus(); },

  set(el) {
    const w = curWorkout();
    const e = w.exercises[+el.dataset.i];
    const s = e.sets[+el.dataset.j];
    s.done = !s.done;
    if (s.done) {
      // One tap logs "same as last time" if you left the boxes empty.
      const row = el.closest('.set-row');
      const [wi, ri] = row.querySelectorAll('input');
      if (s.w === '' && wi.placeholder !== '–') s.w = wi.placeholder;
      if (s.r === '' && /^\d+$/.test(ri.placeholder)) s.r = ri.placeholder;
      if (!w.started) w.started = Date.now();
      if (state.settings.restTimer && !w.finished) startTimer(e.rest, EXERCISES[e.id].name);
      navigator.vibrate?.(15);
    }
    save(); render();
  },
  'add-set'(el) { const e = curWorkout().exercises[+el.dataset.i]; e.sets.push({ w: '', r: '', done: false }); save(); render(); },
  'rm-set'(el) { const e = curWorkout().exercises[+el.dataset.i]; if (e.sets.length > 1) e.sets.pop(); save(); render(); },
  async 'rm-ex'(el) {
    const w = curWorkout();
    const e = w.exercises[+el.dataset.i];
    if (!await ask(`Remove ${EXERCISES[e.id].name} from today's workout?`, 'Remove', true)) return;
    w.exercises.splice(+el.dataset.i, 1); openInfo.clear(); save(); render();
  },
  info(el) { const i = +el.dataset.i; openInfo.has(i) ? openInfo.delete(i) : openInfo.add(i); render(); },
  swap(el) {
    const w = curWorkout();
    const i = +el.dataset.i;
    const e = w.exercises[i];
    const used = new Set(w.exercises.map(x => x.id));
    let pool = (SLOTS[e.slot] || []).filter(id => !used.has(id));
    if (!pool.length) pool = Object.keys(EXERCISES).filter(id => !used.has(id) && EXERCISES[id].muscle === EXERCISES[e.id].muscle);
    if (!pool.length) { toast('No other options for this one.'); return; }
    const id = pool[Math.floor(Math.random() * pool.length)];
    const blk = BLOCK[w.week - 1];
    const fresh = makeExercise(id, e.slot, e.baseSets, e.anchor, blk);
    fresh.sets = fresh.sets.map((s, j) => (e.sets[j]?.done ? { ...e.sets[j] } : s));
    w.exercises[i] = fresh;
    save(); render();
    toast(`Swapped to ${EXERCISES[id].name}`);
  },
  async finish() {
    const w = curWorkout();
    const done = w.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
    if (!done && !await ask("You haven't ticked any sets. Finish anyway?", 'Finish')) return;
    if (!w.started) w.started = Date.now();
    w.finished = Date.now();
    timer = null;
    save(); render(); window.scrollTo(0, 0);
  },
  reopen() { curWorkout().finished = null; save(); render(); },
  pick(el) {
    const type = el.dataset.type;
    day(curKey).workout = type === 'rest' ? buildRest() : buildSession(curKey, type);
    openInfo.clear(); save();
    tab = 'workout'; render(); window.scrollTo(0, 0);
  },
  async shuffle() {
    const d = day(curKey);
    if (!d.workout.type) { ACTIONS.switch(); return; }
    if (touched(d.workout) && !await ask('This replaces today\'s exercises, including sets you\'ve logged.', 'Replace')) return;
    d.shuffle = (d.shuffle || 0) + 1;
    d.workout = buildSession(curKey, d.workout.type, `#${d.shuffle}`);
    openInfo.clear(); save(); render(); toast('New exercises picked');
  },
  async switch() {
    const d = day(curKey);
    if (touched(d.workout) && !await ask('You\'ve logged progress today. Pick a different workout anyway?', 'Pick another')) return;
    d.workout = null; timer = null; openInfo.clear(); save(); render(); window.scrollTo(0, 0);
  },
  'rest-item'(el) {
    const w = curWorkout();
    w.done[el.dataset.id] = !w.done[el.dataset.id];
    if (RECOVERY.every(x => w.done[x.id])) w.finished = w.finished || Date.now();
    save(); render();
  },
  'finish-rest'() { curWorkout().finished = Date.now(); save(); render(); },
  'timer-add'() { if (timer) { timer.end += 30000; timer.total += 30; tick(); } },
  'timer-skip'() { timer = null; tick(); },

  meal(el) { const m = day(curKey).meals[+el.dataset.i]; m.eaten = !m.eaten; save(); render(); },
  'swap-meal'(el) {
    const m = day(curKey).meals[+el.dataset.i];
    const n = MEALS[m.cat].length;
    m.i = (m.i + 1 + Math.floor(Math.random() * (n - 1))) % n;
    save(); render();
  },
  'del-food'(el) { day(curKey).extra.splice(+el.dataset.i, 1); save(); render(); },
  'snap-clear-photo'() { if (snap.preview) URL.revokeObjectURL(snap.preview); snap.photo = null; snap.preview = null; render(); },
  'snap-clear'() { if (snap.preview) URL.revokeObjectURL(snap.preview); snap = freshSnap(); render(); },
  async 'snap-analyze'() {
    if (snap.busy) return;
    if (!snap.photo && !snap.desc.trim()) { toast('Add a photo or describe what you ate'); return; }
    snap.busy = true; snap.error = ''; render();
    try {
      const result = await analyseMeal({ photo: snap.photo?.blob, description: snap.desc });
      if (result) snap.result = result;
    } catch (e) {
      snap.error = e.message;
    }
    snap.busy = false; render();
  },
  'snap-add'() {
    const r = snap.result;
    const tot = snapTotals(r);
    day(curKey).extra.push({ name: r.title, kcal: tot.kcal, p: tot.p, detail: r.items.map(i => `${i.name} ${i.amount}`).join(', '), ai: true, thumb: snap.photo?.thumb });
    if (snap.preview) URL.revokeObjectURL(snap.preview);
    snap = freshSnap(); save(); render();
    toast(`Added ${tot.kcal} kcal, ${tot.p} g protein`);
  },
  'cal-adjust'(el) { state.calAdjust = (state.calAdjust || 0) + Number(el.dataset.amt); save(); render(); toast(`Calorie target is now ${targets().kcal} kcal`); },

  'add-habit'() {
    const inp = document.getElementById('new-habit');
    const label = inp.value.trim();
    if (!label) return;
    state.habits.push({ id: 'h_' + uid(), label });
    save(); render();
  },
  'del-habit'(el) { state.habits = state.habits.filter(h => h.id !== el.dataset.id); save(); render(); },
  async 'restart-block'() {
    if (!await ask('Start a new 6-week block from today? Week 1 begins with new main lifts.', 'Restart block')) return;
    state.settings.startDate = curKey; save(); toast('New block starts today'); render();
  },
  async export() {
    const downloads = await window.claude?.use?.('downloads');
    if (!downloads) { toast("Downloads aren't available here"); return; }
    try {
      await downloads.save({ filename: `daily-gym-backup-${curKey}.json`, data: JSON.stringify(state, null, 2) });
    } catch (e) {
      if (e?.code !== 'declined' && e?.code !== 'cancelled') toast("Couldn't save the backup");
    }
  },
  async reset() {
    if (!await ask('Erase all workouts, weights, meals and settings? This cannot be undone.', 'Erase everything', true)) return;
    await store.eraseAll();
    state = defaultState(); snap = freshSnap(); save(); modal = { type: 'welcome' }; tab = 'today'; render();
  },
  async 'paste-import'() {
    const txt = document.getElementById('paste-data')?.value.trim();
    if (!txt) { toast('Paste your data first'); return; }
    await importData(txt);
  },
};

// In-page confirmation (the viewer blocks the browser's confirm dialog).
let answerFn = null;
function ask(message, okLabel = 'Continue', danger = false) {
  return new Promise(resolve => {
    answerFn = resolve;
    modal = { type: 'confirm', message, okLabel, danger, prev: modal };
    render();
  });
}
function answer(ok) {
  const prev = modal?.prev || null;
  modal = prev; render();
  const fn = answerFn; answerFn = null;
  fn?.(ok);
}

async function importData(txt) {
  let data;
  try {
    data = JSON.parse(txt);
    if (!data.settings || !data.days) throw new Error('bad');
  } catch (e) {
    toast("That doesn't look like Daily Gym data");
    return;
  }
  const n = Object.keys(data.days).length;
  if (!await ask(`Replace everything here with this data (${n} day${n === 1 ? '' : 's'})?`, 'Replace')) return;
  state = fromSaved(data);
  state.settings.onboarded = true;
  modal = null; render(); toast('Importing…');
  await store.flush();
  render(); toast('Your data is here');
}

const FORMS = {
  task(form) {
    const text = form.text.value.trim();
    if (!text) return;
    day(curKey).tasks.push({ id: uid(), text, done: false });
    save(); render();
    document.querySelector('[data-form="task"] input')?.focus();
  },
  food(form) {
    const kcal = Math.round(num(form.kcal.value) || 0), p = Math.round(num(form.p.value) || 0);
    if (!kcal && !p) { toast('Add at least calories or protein'); return; }
    day(curKey).extra.push({ name: form.name.value.trim(), kcal, p });
    save(); render();
  },
  settings(form) {
    const s = state.settings;
    const f = new FormData(form);
    const n = (k, min, max) => { const v = num(f.get(k)); return v != null && v >= min && v <= max ? v : s[k]; };
    s.name = String(f.get('name') || '').trim();
    s.startWeight = n('startWeight', 30, 250);
    s.goalWeight = n('goalWeight', 30, 250);
    if (f.has('heightCm')) {
      s.heightCm = n('heightCm', 120, 230);
      s.age = n('age', 12, 100);
      s.sex = f.get('sex') === 'f' ? 'f' : 'm';
      s.activity = n('activity', 1.2, 2);
      s.surplus = n('surplus', 0, 1000);
      s.waterTarget = n('waterTarget', 0.5, 8);
    }
    s.weeklyGoal = n('weeklyGoal', 1, 7);
    s.sessionLength = LENGTHS[num(f.get('sessionLength'))] ? num(f.get('sessionLength')) : s.sessionLength;
    if (form.restTimer) s.restTimer = form.restTimer.checked;
    const firstRun = !s.onboarded;
    s.onboarded = true;
    if (firstRun) day(curKey).meals = null;
    save(); modal = null; render();
    toast(firstRun ? "All set. Here's today." : 'Saved');
  },
};

const INPUTS = {
  w(el) { curWorkout().exercises[+el.dataset.i].sets[+el.dataset.j].w = el.value.trim(); save(); },
  r(el) { curWorkout().exercises[+el.dataset.i].sets[+el.dataset.j].r = el.value.trim(); save(); },
  notes(el) { curWorkout().notes = el.value; save(); },
  'snap-desc'(el) { snap.desc = el.value; },
};

const CHANGES = {
  weight(el) {
    const v = num(el.value);
    day(curKey).weight = v != null && v > 20 && v < 300 ? Math.round(v * 10) / 10 : null;
    save(); render();
  },
  'snap-photo'(el) {
    const file = el.files[0];
    if (!file) return;
    preparePhoto(file)
      .then(photo => {
        if (snap.preview) URL.revokeObjectURL(snap.preview);
        snap.photo = photo; snap.preview = URL.createObjectURL(photo.blob); snap.result = null; snap.error = '';
        render();
      })
      .catch(e => toast(e.message));
  },
  'ai-kcal'(el) { snap.result.items[+el.dataset.i].kcal = Math.max(0, Math.round(num(el.value) || 0)); render(); },
  'ai-p'(el) { snap.result.items[+el.dataset.i].protein_g = Math.max(0, Math.round(num(el.value) || 0)); render(); },
  'add-ex'(el) {
    const id = el.value;
    if (!id) return;
    const w = curWorkout();
    const ex = EXERCISES[id];
    w.exercises.push(makeExercise(id, Object.keys(SLOTS).find(k => SLOTS[k].includes(id)) || '', ex.type === 'compound' ? 3 : 2, false, BLOCK[w.week - 1]));
    save(); render();
    toast(`Added ${ex.name}`);
  },
  import(el) {
    const file = el.files[0];
    if (!file) return;
    file.text().then(importData).catch(() => toast("Couldn't read that file"));
  },
};

/* ---------- wiring ---------- */

function init() {
  const root = document.getElementById('app');
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  root.addEventListener('submit', e => {
    const fn = FORMS[e.target.dataset.form];
    if (fn) { e.preventDefault(); fn(e.target); }
  });
  root.addEventListener('input', e => { const fn = INPUTS[e.target.dataset.input]; if (fn) fn(e.target); });
  root.addEventListener('change', e => { const fn = CHANGES[e.target.dataset.input]; if (fn) fn(e.target); });
  root.addEventListener('keydown', e => {
    // Enter in a set's weight box jumps to reps; in reps it ticks the set.
    if (e.key !== 'Enter' || !['w', 'r'].includes(e.target.dataset.input)) return;
    e.preventDefault();
    const row = e.target.closest('.set-row');
    if (e.target.dataset.input === 'w') row.querySelectorAll('input')[1].focus();
    else row.querySelector('.tick').click();
  });

  // New day while the app sat open in the background? Start fresh.
  const checkDay = () => { if (todayKey() !== curKey) { openInfo.clear(); timer = null; render(); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
  window.addEventListener('focus', checkDay);
  setInterval(() => { checkDay(); tick(); }, 500);

  // Save straight away when the page is hidden, so nothing is lost if it's closed.
  document.addEventListener('visibilitychange', () => { if (document.hidden) store.flush(); });
  window.addEventListener('pagehide', () => store.flush());

  render();
  start();
}

async function start() {
  const status = await store.connect({
    getState: () => state,
    onError: e => toast(e?.code === 'quota_exceeded' ? 'Storage is full. Some changes weren\'t saved.' : 'Couldn\'t save a change. Check your connection.'),
  });
  if (status !== 'ok') { boot = status; render(); return; }
  try {
    const saved = await store.loadAll(addDays(todayKey(), -400));
    state = fromSaved(saved && { ...(saved.meta || {}), days: saved.days });
  } catch (e) {
    boot = 'error'; render(); return;
  }
  mealCaps = await mealCapabilities();
  boot = 'ready';
  if (!state.settings.onboarded) modal = { type: 'welcome' };
  render();
}

init();
