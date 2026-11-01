// Keeps the app's state in the Claude artifact database, private to the signed-in person:
//   data/users/<id>/app            settings, habits, calorie adjustment
//   data/users/<id>/app/days/<key> one document per day
// Writes are batched: only documents whose content changed are written.

let db = null;
let base = '';
const saved = new Map(); // doc path -> JSON last written
let timer = null;
let running = null;
let again = false;
let getState = () => null;
let onError = () => {};

export async function connect(opts) {
  getState = opts.getState;
  onError = opts.onError;
  if (!window.claude?.use) return 'outside';
  const [d, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  if (!d || !user) return 'unavailable';
  const id = await user.id();
  if (!id) return 'signed-out';
  db = d;
  base = `data/users/${id}/app`;
  return 'ok';
}

const clone = v => JSON.parse(JSON.stringify(v));

// Returns {meta, days} or null when nothing has been saved yet.
export async function loadAll(fromKey) {
  const [metaSnap, daySnap] = await Promise.all([
    db.doc(base).get(),
    db.collection(`${base}/days`).where('k', '>=', fromKey).get(),
  ]);
  const days = {};
  for (const doc of daySnap.docs) {
    const { k, ...day } = clone(doc.data());
    days[doc.id] = day;
    saved.set(`${base}/days/${doc.id}`, JSON.stringify(day));
  }
  if (!metaSnap.exists) return Object.keys(days).length ? { meta: null, days } : null;
  const meta = clone(metaSnap.data());
  saved.set(base, JSON.stringify(meta));
  return { meta, days };
}

function metaOf(state) {
  return { settings: state.settings, habits: state.habits, calAdjust: state.calAdjust || 0 };
}

export function scheduleSave() {
  if (!db) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 700);
}

export async function flush() {
  clearTimeout(timer);
  if (!db) return;
  if (running) { again = true; return running; }
  running = (async () => {
    const state = getState();
    const writes = [];
    const meta = metaOf(state);
    if (saved.get(base) !== JSON.stringify(meta)) writes.push([base, meta]);
    for (const [k, day] of Object.entries(state.days)) {
      const path = `${base}/days/${k}`;
      if (saved.get(path) !== JSON.stringify(day)) writes.push([path, day, k]);
    }
    // A few at a time: each document is written once, and in order.
    for (let i = 0; i < writes.length; i += 4) {
      await Promise.all(writes.slice(i, i + 4).map(async ([path, body, k]) => {
        const json = JSON.stringify(body);
        try {
          await db.doc(path).set(k ? { ...clone(body), k } : clone(body));
          saved.set(path, json);
        } catch (e) {
          onError(e);
        }
      }));
    }
  })();
  try { await running; } finally {
    running = null;
    if (again) { again = false; await flush(); }
  }
}

// Removes every saved day and the settings document.
export async function eraseAll() {
  if (!db) return;
  clearTimeout(timer);
  const paths = [...saved.keys()];
  for (let i = 0; i < paths.length; i += 4) {
    await Promise.all(paths.slice(i, i + 4).map(p => db.doc(p).delete().catch(onError)));
  }
  saved.clear();
}
