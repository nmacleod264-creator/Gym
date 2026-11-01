# Daily Gym

A daily training and nutrition app for going from **70 kg to 80 kg**. It runs inside Claude as an artifact:

**https://claude.ai/artifact/PFLo645pH12WorE9zezCrk**

- **Today**: a daily checklist (workout, protein, calories, water, weigh-in, your own habits) plus a to-do list. Unfinished to-dos roll over to the next day.
- **Workout**: pick what to train each day. The app suggests the most rested muscle groups, builds a session to fit your time, and tracks sets, weights and best lifts.
- **Food**: calorie and protein targets, a meal plan that changes every day, and **Snap a meal**: Claude estimates a meal's calories and protein from a photo and/or description, using your own Claude account. No API key.
- **Progress**: bodyweight chart with an ETA to your goal, a pace check that suggests calorie changes, streaks, best lifts and workout history.

Data is saved privately to your Claude account (the artifact's database, under your own user path), so it's the same on every device where you open the page.

## How the program works

- **You pick what to train each day**: Push, Pull, Legs, Upper, Lower, Arms & Shoulders, Full Body, or Recovery.
- The app tracks when each muscle group (chest, back, shoulders, arms, legs) was last worked and **suggests the most rested workout**. Anything that would hit muscles trained yesterday is flagged. A workout counts as soon as you tick a set, even if you never tap Finish.
- Sessions fit the length you choose in Settings: 30 min (4 exercises), 45 min (5) or 60 min (7).
- Each workout type's **main lift** stays the same for a 6-week block so you can measure strength. The other exercises rotate from pools of equivalent movements, and you can swap any of them.
- **6-week block**: effort ramps from 3 reps in reserve down to 1, then week 6 is a deload (half the sets).
- Reps: compounds 6-10, accessories 8-12, isolation 10-15. Training 5-6 days a week and alternating workouts hits each muscle about twice a week with 10-20 hard sets.
- Food targets: Mifflin-St Jeor maintenance + ~350 kcal surplus, ~2 g protein per kg. The aim is to gain ~0.25-0.5 kg/week.

The full reasoning is in the app (book icon, top right). Exercises, meals and tips are all plain data in `js/data.js`, so they're easy to edit.

## Files

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `js/` | The app, published to Claude as an artifact |
| `js/data.js` | Exercises, workout types, meals, tips: plain data, easy to edit |
| `js/store.js` | Saving and loading through the artifact database |
| `js/meal.js` | Meal photo analysis through the artifact `sample` capability |
| `legacy/` | The old GitHub Pages address: now a page that points to the new app and copies data from the old one |

## Updating the app

Changes are published from a Claude Code session with the Artifact tool. It publishes `index.html` with `styles.css` and the files in `js/` to the same URL, declaring the `db`, `user`, `sample` (with images) and `downloads` capabilities.

To try it locally, serve the folder (`npx http-server -c-1 .`). Outside Claude, the page shows an "Open Daily Gym in Claude" screen, because it needs Claude for storage.

*General fitness information, not medical advice.*
