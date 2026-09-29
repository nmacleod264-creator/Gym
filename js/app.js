import {
  EXERCISES, SLOTS, TYPE_DEFAULTS, SESSIONS, SPLITS, BLOCK, WARMUP, RECOVERY, MEALS, TIPS, GUIDE,
} from './data.js';

/* ---------- storage ---------- */

const KEY = 'dailygym.v1';

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
      trainingDays: [1, 2, 4, 5], // Mon Tue Thu Fri
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

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = defaultState();
      return { ...d, ...s, settings: { ...d.settings, ...s.settings } };
    }
  } catch (e) { /* fall through to a fresh state */ }
  return defaultState();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Could not save. Storage may be full or blocked.'); }
}

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

let state = load();
let tab = 'today';
let modal = null;
let timer = null;
let curKey = todayKey();
const openInfo = new Set();
let audioCtx = null;

function day(k) {
  if (!state.days[k]) state.days[k] = { habits: {}, tasks: [], water: 0, weight: null, workout: null, meals: null, extra: [] };
  return state.days[k];
}
function sortedKeys() { return Object.keys(state.days).sort(); }

/* ---------- program logic ---------- */

function splitSize() { return Math.max(2, Math.min(6, state.settings.trainingDays.length)); }

function blockInfo(k) {
  const d = Math.max(0, daysBetween(state.settings.startDate, k));
  const week = Math.floor((d % 42) / 7) + 1;
  return { number: Math.floor(d / 42) + 1, ...BLOCK[week - 1] };
}

function nextSessionIndex(k) {
  const n = splitSize();
  const keys = sortedKeys().filter(x => x < k).reverse();
  for (const x of keys) {
    const w = state.days[x].workout;
    if (w && w.kind === 'lift' && w.finished && w.split === n) return (w.idx + 1) % SPLITS[n].length;
  }
  return 0;
}

function previousSessionIds(session, k) {
  const keys = sortedKeys().filter(x => x < k).reverse();
  for (const x of keys) {
    const w = state.days[x].workout;
    if (w && w.session === session) return w.exercises.map(e => e.id);
  }
  return [];
}

function makeExercise(id, slot, baseSets, anchor, blk) {
  const ex = EXERCISES[id];
  let sets = baseSets;
  if ((blk.week === 4 || blk.week === 5) && ex.type === 'isolation') sets += 1;
  if (blk.week === 6) sets = Math.max(1, Math.ceil(baseSets / 2));
  const def = TYPE_DEFAULTS[ex.type];
  return {
    id, slot, baseSets, anchor: !!anchor,
    reps: id === 'plank' ? '30-60s' : def.reps,
    rest: def.rest,
    sets: Array.from({ length: sets }, () => ({ w: '', r: '', done: false })),
  };
}

function buildSession(k, salt = '') {
  const n = splitSize();
  const idx = nextSessionIndex(k);
  const session = SPLITS[n][idx];
  const tpl = SESSIONS[session];
  const blk = blockInfo(k);
  const r = rng(k + session + salt);
  const last = new Set(previousSessionIds(session, k));
  const used = new Set();
  const exercises = tpl.slots.map(([slot, sets, anchor]) => {
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
    kind: 'lift', session, split: n, idx, title: tpl.title, focus: tpl.focus,
    block: blk.number, week: blk.week, rir: blk.rir, exercises, notes: '', started: null, finished: null,
  };
}

function buildRest() {
  return { kind: 'rest', title: 'Recovery Day', focus: 'Walk, mobility and core', done: {}, finished: null };
}

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
  if (w) items.push({ id: 'workout', label: w.kind === 'rest' ? 'Recovery: walk + mobility' : `Workout: ${w.title}`, sub: w.finished ? 'Done' : w.kind === 'rest' ? 'Easy day' : `${w.exercises.length} exercises`, done: !!w.finished, auto: true });
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
  if (!d.workout) {
    const wd = parseKey(k).getDay();
    d.workout = state.settings.trainingDays.includes(wd) ? buildSession(k) : buildRest();
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
};

/* ---------- rendering ---------- */

const TABS = [
  ['today', 'Today', I.today],
  ['workout', 'Workout', I.lift],
  ['food', 'Food', I.food],
  ['progress', 'Progress', I.chart],
];

function render() {
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
  const setsDone = w.kind === 'lift' ? w.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0) : 0;
  const setsTotal = w.kind === 'lift' ? w.exercises.reduce((a, e) => a + e.sets.length, 0) : 0;
  const btn = w.finished ? `${I.check} Done, nice work` : setsDone ? `${I.play} Continue (${setsDone}/${setsTotal} sets)` : `${I.play} ${w.kind === 'rest' ? 'Open recovery plan' : 'Start workout'}`;

  return `
    <section class="hero">
      <div>
        <div class="eyebrow">${fmtDate(curKey, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>${greeting()}</h1>
        <p class="muted">Block ${blk.number} · Week ${blk.week} of 6${blk.week === 6 ? ' (deload)' : ''}</p>
      </div>
      ${ring(items.length ? done / items.length : 0, `<b>${done}</b>/${items.length}`)}
    </section>

    <section class="card workout-card ${w.finished ? 'is-done' : ''}">
      <div class="eyebrow">${w.kind === 'rest' ? 'Rest day' : "Today's training"}</div>
      <h2>${esc(w.title)}</h2>
      <p class="muted">${esc(w.focus)}</p>
      ${w.kind === 'lift' ? `<div class="chips"><span class="chip">${w.exercises.length} exercises</span><span class="chip">${setsTotal} sets</span><span class="chip">~${Math.round(setsTotal * 2.6 + 8)} min</span><span class="chip">${w.rir} reps in reserve</span></div>` : ''}
      <button class="btn ${w.finished ? 'ghost' : 'primary'} block" data-act="tab" data-tab="workout">${btn}</button>
    </section>

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
  return w.kind === 'rest' ? viewRest(w) : viewLift(w);
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
    <section class="card">
      <h3>Feel like training?</h3>
      <p class="muted">You can pull your next session forward. The rotation stays in order.</p>
      <button class="btn ghost block" data-act="train-anyway">${I.lift} Train today instead</button>
    </section>`;
}

function viewLift(w) {
  const setsDone = w.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  const setsTotal = w.exercises.reduce((a, e) => a + e.sets.length, 0);
  const blk = BLOCK[w.week - 1];
  return `
    ${w.finished ? summaryCard(w) : ''}
    <section class="card">
      <div class="eyebrow">${fmtDate(curKey)} · Block ${w.block}, week ${w.week}</div>
      <h2>${esc(w.title)}</h2>
      <p class="muted">${esc(w.focus)}</p>
      <div class="chips">
        <span class="chip">${setsDone}/${setsTotal} sets</span>
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
        <button class="btn ghost" data-act="shuffle">${I.swap} New variation</button>
        <button class="btn ghost" data-act="make-rest">Make it a rest day</button>
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
      <h3>Ate something else?</h3>
      <form class="quick-add" data-form="food">
        <input name="name" placeholder="What was it?" maxlength="60" autocomplete="off">
        <input name="kcal" type="number" inputmode="numeric" placeholder="kcal" min="0" max="5000">
        <input name="p" type="number" inputmode="numeric" placeholder="protein g" min="0" max="300">
        <button class="icon-btn solid" aria-label="Add food">${I.plus}</button>
      </form>
      <ul class="checklist">${(d.extra || []).map((x, i) => `
        <li class="check-item done">
          <div class="ci-body"><div class="ci-label">${esc(x.name || 'Food')}</div><div class="ci-sub">${x.kcal || 0} kcal · ${x.p || 0} g protein</div></div>
          <button class="icon-btn subtle" data-act="del-food" data-i="${i}" aria-label="Delete">${I.x}</button>
        </li>`).join('')}</ul>
    </section>
    <section class="card tip">
      <div class="eyebrow">Struggling to eat enough?</div>
      <p>Drink calories (milk, shakes), add olive oil or peanut butter to meals, and eat every 3-4 hours. A mass shake is an easy 800 kcal.</p>
    </section>`;
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
    const lifted = w && w.kind === 'lift' && w.finished;
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
  const weekLifts = sortedKeys().filter(k => k >= mondayKey && k <= curKey && state.days[k].workout?.kind === 'lift' && state.days[k].workout.finished).length;
  const history = sortedKeys().reverse().filter(k => state.days[k].workout?.kind === 'lift' && state.days[k].workout.finished);

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
        <div><b>${weekLifts}/${s.trainingDays.length}</b><span>workouts this week</span></div>
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
  } else if (modal.type === 'settings' || modal.type === 'welcome') {
    body = settingsForm(modal.type === 'welcome');
  }
  return `<div class="modal-bg" data-act="close-modal"></div>
    <div class="modal" role="dialog" aria-modal="true">
      ${modal.type === 'welcome' ? '' : `<button class="icon-btn subtle close" data-act="close-modal" aria-label="Close">${I.x}</button>`}
      ${body}
    </div>`;
}

function settingsForm(welcome) {
  const s = state.settings;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `
    ${welcome ? `<div class="eyebrow">Welcome</div><h2>Let's set up your plan</h2><p class="muted">A new workout every day, a daily checklist, and a meal plan to get you from ${fmtKg(s.startWeight)} to ${fmtKg(s.goalWeight)} kg. You can change all of this later.</p>` : '<h2>Settings</h2>'}
    <form data-form="settings" class="settings">
      <label>Your name<input name="name" value="${esc(s.name)}" maxlength="30" placeholder="Optional"></label>
      <div class="grid2">
        <label>Current weight (kg)<input name="startWeight" type="number" step="0.1" inputmode="decimal" value="${s.startWeight}"></label>
        <label>Goal weight (kg)<input name="goalWeight" type="number" step="0.1" inputmode="decimal" value="${s.goalWeight}"></label>
      </div>
      <fieldset>
        <legend>Training days</legend>
        <div class="day-chips">${order.map(i => `<label class="day-chip"><input type="checkbox" name="td" value="${i}" ${s.trainingDays.includes(i) ? 'checked' : ''}><span>${days[i]}</span></label>`).join('')}</div>
        <p class="muted small">2-3 days: full body. 4: upper/lower. 5: upper/lower + push/pull/legs. 6: push/pull/legs twice. 4 is a great place to start.</p>
      </fieldset>
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
      <p class="muted small">Everything is stored on this phone only. Back it up now and then.</p>
      <div class="row">
        <button class="btn ghost" data-act="export">Export backup</button>
        <label class="btn ghost">Import backup<input type="file" accept="application/json" data-input="import" hidden></label>
      </div>
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
  'close-modal'() { if (modal?.type === 'welcome') return; modal = null; render(); },
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
  'rm-ex'(el) {
    const w = curWorkout();
    const e = w.exercises[+el.dataset.i];
    if (!confirm(`Remove ${EXERCISES[e.id].name}?`)) return;
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
  finish() {
    const w = curWorkout();
    const done = w.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
    if (!done && !confirm("You haven't ticked any sets. Finish anyway?")) return;
    if (!w.started) w.started = Date.now();
    w.finished = Date.now();
    timer = null;
    save(); render(); window.scrollTo(0, 0);
  },
  reopen() { curWorkout().finished = null; save(); render(); },
  shuffle() {
    const d = day(curKey);
    const touched = d.workout.exercises.some(e => e.sets.some(s => s.done));
    if (touched && !confirm('This replaces today\'s workout, including sets you\'ve logged. Continue?')) return;
    d.shuffle = (d.shuffle || 0) + 1;
    d.workout = buildSession(curKey, `#${d.shuffle}`);
    openInfo.clear(); save(); render(); toast('Fresh variation generated');
  },
  'make-rest'() {
    const d = day(curKey);
    const touched = d.workout.exercises?.some(e => e.sets.some(s => s.done));
    if (touched && !confirm('You have logged sets today. Replace with a rest day?')) return;
    d.workout = buildRest(); timer = null; save(); render();
  },
  'train-anyway'() { const d = day(curKey); d.workout = buildSession(curKey); save(); render(); window.scrollTo(0, 0); },
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
  'cal-adjust'(el) { state.calAdjust = (state.calAdjust || 0) + Number(el.dataset.amt); save(); render(); toast(`Calorie target is now ${targets().kcal} kcal`); },

  'add-habit'() {
    const inp = document.getElementById('new-habit');
    const label = inp.value.trim();
    if (!label) return;
    state.habits.push({ id: 'h_' + uid(), label });
    save(); render();
  },
  'del-habit'(el) { state.habits = state.habits.filter(h => h.id !== el.dataset.id); save(); render(); },
  'restart-block'() {
    if (!confirm('Start a new 6-week block from today?')) return;
    state.settings.startDate = curKey; save(); toast('New block starts today'); render();
  },
  export() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daily-gym-backup-${curKey}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  reset() {
    if (!confirm('Erase all workouts, weights and settings? This cannot be undone.')) return;
    state = defaultState(); save(); modal = { type: 'welcome' }; tab = 'today'; render();
  },
};

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
    const oldDays = s.trainingDays.join();
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
    s.trainingDays = f.getAll('td').map(Number).sort();
    if (form.restTimer) s.restTimer = form.restTimer.checked;
    const firstRun = !s.onboarded;
    s.onboarded = true;
    // If the schedule changed and today's session hasn't been started, rebuild it.
    const d = day(curKey);
    const untouched = d.workout && !d.workout.finished && !(d.workout.exercises || []).some(e => e.sets.some(x => x.done)) && !Object.values(d.workout.done || {}).some(Boolean);
    if (untouched && (firstRun || oldDays !== s.trainingDays.join())) d.workout = null;
    if (firstRun) d.meals = null;
    save(); modal = null; render();
    toast(firstRun ? "All set. Here's today." : 'Saved');
  },
};

const INPUTS = {
  w(el) { curWorkout().exercises[+el.dataset.i].sets[+el.dataset.j].w = el.value.trim(); save(); },
  r(el) { curWorkout().exercises[+el.dataset.i].sets[+el.dataset.j].r = el.value.trim(); save(); },
  notes(el) { curWorkout().notes = el.value; save(); },
};

const CHANGES = {
  weight(el) {
    const v = num(el.value);
    day(curKey).weight = v != null && v > 20 && v < 300 ? Math.round(v * 10) / 10 : null;
    save(); render();
  },
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
    file.text().then(txt => {
      const data = JSON.parse(txt);
      if (!data.settings || !data.days) throw new Error('bad file');
      if (!confirm('Replace everything on this phone with this backup?')) return;
      state = { ...defaultState(), ...data, settings: { ...defaultState().settings, ...data.settings } };
      save(); modal = null; render(); toast('Backup restored');
    }).catch(() => toast("That file doesn't look like a Daily Gym backup"));
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

  if (!state.settings.onboarded) modal = { type: 'welcome' };
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
