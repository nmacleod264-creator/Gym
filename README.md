# Daily Gym

A phone app (installable web app) that gives you a fresh plan every day to go from **70 kg to 80 kg**:

- **Today**: a daily checklist (workout, protein, calories, water, weigh-in, your own habits) plus a to-do list. Unfinished to-dos roll over to the next day.
- **Workout**: a new session every day, built from a research-based lean-bulk program. You can log weight and reps (optional), see what you did last time, get "add weight" suggestions, and there's a rest timer.
- **Food**: daily calorie and protein targets, a meal plan that changes every day, and a quick-add for anything else.
- **Progress**: bodyweight chart with an ETA to your goal, a pace check that suggests calorie changes, streaks, best lifts and workout history.

Everything is stored on your phone. There's no account and no server. Use **Settings → Export backup** now and then.

## How the program works

| Training days | Split |
|---|---|
| 2-3 | Full body A / B / C |
| 4 (default: Mon, Tue, Thu, Fri) | Upper / Lower × 2 |
| 5 | Upper, Lower, Push, Pull, Legs |
| 6 | Push / Pull / Legs × 2 |

- Each session's **main lift** stays the same for a 6-week block so you can measure strength. Every other exercise rotates daily from a pool of equivalent movements.
- **6-week block**: effort ramps from 3 reps in reserve down to 1, then week 6 is a deload.
- **Missed a day?** The rotation doesn't skip. You get the session you missed next time.
- Non-training days are recovery days (walk, mobility, core). You can tap "Train today instead".
- Volume sits around 10-20 hard sets per muscle per week. Compounds use 6-10 reps, accessories 8-12, isolation 10-15.
- Food targets: Mifflin-St Jeor maintenance + ~350 kcal surplus, ~2 g protein per kg. The aim is to gain ~0.25-0.5 kg/week.

The full reasoning is in the app (book icon, top right). Exercises, meals and tips are all plain data in `js/data.js`, so they're easy to edit.

## Putting it on your phone

The app has to be served from an `https://` address before a phone will install it.

**Option A: GitHub Pages** (the workflow in `.github/workflows/pages.yml` is already set up)
1. GitHub Pages is free for public repos. A private repo needs GitHub Pro. So either make the repo public (it holds no personal data, since your data stays on your phone) or upgrade.
2. Go to repo **Settings → Pages → Build and deployment → Source** and pick **GitHub Actions**.
3. Push to the default branch (or re-run the workflow). The site URL shows up in the Actions run.

**Option B: Netlify Drop** (no settings needed): drag this folder onto https://app.netlify.com/drop.

Then install it:
- **iPhone (Safari)**: open the URL → Share → **Add to Home Screen**.
- **Android (Chrome)**: open the URL → ⋮ menu → **Install app** / **Add to Home screen**.

It opens full screen like a normal app and works offline.

## Running locally

```sh
npx http-server -c-1 .
```

No build step. Plain HTML, CSS and JavaScript modules.

> If you edit files, bump `VERSION` in `sw.js` so installed copies pick up the change.

*General fitness information, not medical advice.*
