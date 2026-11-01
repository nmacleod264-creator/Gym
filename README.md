# Daily Gym

A phone app (installable web app) that gives you a fresh plan every day to go from **70 kg to 80 kg**:

- **Today**: a daily checklist (workout, protein, calories, water, weigh-in, your own habits) plus a to-do list. Unfinished to-dos roll over to the next day.
- **Workout**: a new session every day, built from a research-based lean-bulk program. You can log weight and reps (optional), see what you did last time, get "add weight" suggestions, and there's a rest timer.
- **Food**: daily calorie and protein targets, a meal plan that changes every day, and a quick-add for anything else.
- **Snap a meal** (optional): take a photo and/or describe what you ate, and Claude estimates calories and protein item by item. It shows its assumptions (e.g. "80 g oats taken as dry weight"), a likely range and a confidence level, asks a follow-up question when one detail would change the answer a lot, and lets you edit the numbers before adding them.
- **Progress**: bodyweight chart with an ETA to your goal, a pace check that suggests calorie changes, streaks, best lifts and workout history.

Everything is stored on your phone. There's no account and no server. Use **Settings → Export backup** now and then.

## How the program works

- **You pick what to train each day**: Push, Pull, Legs, Upper, Lower, Arms & Shoulders, Full Body, or Recovery.
- The app tracks when each muscle group (chest, back, shoulders, arms, legs) was last worked and **suggests the most rested workout**. Anything that would hit muscles trained yesterday is flagged. A workout counts as soon as you tick a set, even if you never tap Finish.
- Sessions fit the length you choose in Settings: 30 min (4 exercises), 45 min (5) or 60 min (7).
- Each workout type's **main lift** stays the same for a 6-week block so you can measure strength. The other exercises rotate from pools of equivalent movements, and you can swap any of them.
- **6-week block**: effort ramps from 3 reps in reserve down to 1, then week 6 is a deload (half the sets).
- Reps: compounds 6-10, accessories 8-12, isolation 10-15. Training 5-6 days a week and alternating workouts hits each muscle about twice a week with 10-20 hard sets.
- Food targets: Mifflin-St Jeor maintenance + ~350 kcal surplus, ~2 g protein per kg. The aim is to gain ~0.25-0.5 kg/week.

The full reasoning is in the app (book icon, top right). Exercises, meals and tips are all plain data in `js/data.js`, so they're easy to edit.

## Meal photos (optional)

1. Create an API key at https://console.anthropic.com/settings/keys and add some credit. Setting a monthly spend limit there is a good idea.
2. In the app: **Settings → Meal photos (AI)** → paste the key → Save.

Each analysis is one request to Claude (`claude-opus-5-5`) sent straight from your phone. It costs a few cents. The key is stored only on your phone and is not included in backups. Estimates are best when you include weights, and say whether grains were weighed dry or cooked. Portions judged from a photo alone can be off by 20-30%.

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
