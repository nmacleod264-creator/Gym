// Static content: exercise library, session templates, meals, tips.
// Everything here is plain data so it's easy to tweak by hand.

// type: compound = big multi-joint lift, accessory = secondary multi-joint, isolation = single joint
export const EXERCISES = {
  // Chest
  bench:          { name: 'Barbell Bench Press', muscle: 'Chest', type: 'compound', cue: 'Shoulder blades pinched, feet planted, bar to lower chest, press up and slightly back.' },
  dbBench:        { name: 'Dumbbell Bench Press', muscle: 'Chest', type: 'compound', cue: 'Lower until a deep stretch in the chest, elbows ~45° from your body.' },
  machinePress:   { name: 'Machine Chest Press', muscle: 'Chest', type: 'compound', cue: 'Seat so handles line up mid-chest. Control the negative for 2-3 seconds.' },
  smithBench:     { name: 'Smith Machine Bench Press', muscle: 'Chest', type: 'compound', cue: 'Bar touches lower chest. Great for pushing close to failure safely.' },
  inclineDb:      { name: 'Incline Dumbbell Press', muscle: 'Upper chest', type: 'compound', cue: 'Bench at 30°. Press up and in, deep stretch at the bottom.' },
  inclineBar:     { name: 'Incline Barbell Press', muscle: 'Upper chest', type: 'compound', cue: 'Bench at 30°. Bar touches just under the collarbone.' },
  inclineSmith:   { name: 'Incline Smith Press', muscle: 'Upper chest', type: 'compound', cue: 'Bench at 30°. Keep your shoulder blades back the whole time.' },
  inclineMachine: { name: 'Incline Machine Press', muscle: 'Upper chest', type: 'compound', cue: 'Controlled negative, full stretch, don\'t lock out hard.' },
  cableFly:       { name: 'Cable Fly', muscle: 'Chest', type: 'isolation', cue: 'Slight bend in the elbows, hug a big tree, squeeze for a second.' },
  pecDeck:        { name: 'Pec Deck', muscle: 'Chest', type: 'isolation', cue: 'Big stretch at the back, squeeze together without shrugging.' },
  lowHighFly:     { name: 'Low-to-High Cable Fly', muscle: 'Upper chest', type: 'isolation', cue: 'Cables low, sweep up to eye level. Hits the upper chest.' },
  dips:           { name: 'Dips', muscle: 'Chest / Triceps', type: 'accessory', cue: 'Lean forward slightly, go down until shoulders are just below elbows. Add weight when 15+ reps is easy.' },
  pushups:        { name: 'Deficit Push-ups', muscle: 'Chest', type: 'accessory', cue: 'Hands on plates or handles so the chest sinks deeper than your hands.' },

  // Back
  pullup:         { name: 'Pull-ups', muscle: 'Lats', type: 'compound', cue: 'Full hang at the bottom, drive elbows to your ribs. Use a band or assisted machine if needed.' },
  chinup:         { name: 'Chin-ups', muscle: 'Lats / Biceps', type: 'compound', cue: 'Palms facing you, chest to the bar, full stretch at the bottom.' },
  pulldown:       { name: 'Lat Pulldown', muscle: 'Lats', type: 'compound', cue: 'Pull to upper chest, lean back slightly, control the bar up.' },
  neutralPulldown:{ name: 'Neutral-Grip Pulldown', muscle: 'Lats', type: 'compound', cue: 'Close neutral handle, elbows drive down and back.' },
  singleArmPd:    { name: 'Single-Arm Cable Pulldown', muscle: 'Lats', type: 'accessory', cue: 'Reach up for a stretch, pull the elbow down to your hip.' },
  bbRow:          { name: 'Barbell Row', muscle: 'Upper back', type: 'compound', cue: 'Hinge to ~45°, pull the bar to your belly button, no jerking.' },
  csRow:          { name: 'Chest-Supported DB Row', muscle: 'Upper back', type: 'compound', cue: 'Chest on an incline bench, pull elbows back and squeeze.' },
  cableRow:       { name: 'Seated Cable Row', muscle: 'Upper back', type: 'compound', cue: 'Tall chest, pull to your stomach, let the shoulders stretch forward.' },
  tbarRow:        { name: 'T-Bar Row', muscle: 'Upper back', type: 'compound', cue: 'Chest up, pull the handle to your chest, pause briefly.' },
  dbRow:          { name: 'Single-Arm DB Row', muscle: 'Lats', type: 'accessory', cue: 'Knee and hand on the bench, row the dumbbell to your hip.' },
  machineRow:     { name: 'Machine Row', muscle: 'Upper back', type: 'compound', cue: 'Chest on the pad, full stretch forward, squeeze back.' },
  shrug:          { name: 'Dumbbell Shrugs', muscle: 'Traps', type: 'isolation', cue: 'Straight up to the ears, pause, slow down.' },

  // Shoulders
  ohp:            { name: 'Standing Overhead Press', muscle: 'Shoulders', type: 'compound', cue: 'Squeeze glutes, press the bar up in a straight line, head through at the top.' },
  seatedDbPress:  { name: 'Seated DB Shoulder Press', muscle: 'Shoulders', type: 'compound', cue: 'Back supported, lower to ear level, press up.' },
  machineOhp:     { name: 'Machine Shoulder Press', muscle: 'Shoulders', type: 'compound', cue: 'Handles start at shoulder height, smooth reps.' },
  arnold:         { name: 'Arnold Press', muscle: 'Shoulders', type: 'compound', cue: 'Start palms facing you, rotate out as you press.' },
  latRaise:       { name: 'Dumbbell Lateral Raise', muscle: 'Side delts', type: 'isolation', cue: 'Lead with the elbows, raise to shoulder height, slow on the way down.' },
  cableLat:       { name: 'Cable Lateral Raise', muscle: 'Side delts', type: 'isolation', cue: 'Cable behind you, constant tension, stop at shoulder height.' },
  machineLat:     { name: 'Machine Lateral Raise', muscle: 'Side delts', type: 'isolation', cue: 'Elbows on the pads, raise out to the side.' },
  leanLat:        { name: 'Lean-Away Lateral Raise', muscle: 'Side delts', type: 'isolation', cue: 'Hold a post and lean away, raise one dumbbell at a time.' },
  facePull:       { name: 'Face Pulls', muscle: 'Rear delts', type: 'isolation', cue: 'Rope at face height, pull apart towards your ears, thumbs back.' },
  reversePec:     { name: 'Reverse Pec Deck', muscle: 'Rear delts', type: 'isolation', cue: 'Arms long, sweep back, don\'t squeeze the shoulder blades too hard.' },
  rearDbFly:      { name: 'Rear Delt DB Fly', muscle: 'Rear delts', type: 'isolation', cue: 'Bent over, light weight, raise out wide with pinkies up.' },
  cableRearFly:   { name: 'Cable Rear Delt Fly', muscle: 'Rear delts', type: 'isolation', cue: 'Cross the cables, pull out wide at shoulder height.' },

  // Arms
  bbCurl:         { name: 'Barbell Curl', muscle: 'Biceps', type: 'isolation', cue: 'Elbows pinned at your sides, no swinging.' },
  ezCurl:         { name: 'EZ-Bar Curl', muscle: 'Biceps', type: 'isolation', cue: 'Easier on the wrists. Full stretch at the bottom.' },
  inclineCurl:    { name: 'Incline Dumbbell Curl', muscle: 'Biceps', type: 'isolation', cue: 'Bench at 45°, arms hang back for a big stretch.' },
  hammerCurl:     { name: 'Hammer Curl', muscle: 'Biceps / Forearms', type: 'isolation', cue: 'Palms facing each other, curl without swinging.' },
  preacherCurl:   { name: 'Preacher Curl', muscle: 'Biceps', type: 'isolation', cue: 'Armpits tight to the pad, lower all the way down under control.' },
  cableCurl:      { name: 'Cable Curl', muscle: 'Biceps', type: 'isolation', cue: 'Constant tension, squeeze hard at the top.' },
  pushdown:       { name: 'Rope Pushdown', muscle: 'Triceps', type: 'isolation', cue: 'Elbows tucked, spread the rope at the bottom.' },
  barPushdown:    { name: 'Straight-Bar Pushdown', muscle: 'Triceps', type: 'isolation', cue: 'Elbows still, lock out fully.' },
  ohCableExt:     { name: 'Overhead Cable Extension', muscle: 'Triceps', type: 'isolation', cue: 'Face away from the cable, deep stretch behind the head. Best for the long head.' },
  skullCrusher:   { name: 'EZ-Bar Skull Crushers', muscle: 'Triceps', type: 'isolation', cue: 'Lower to your forehead or just behind, elbows stay pointing up.' },
  cgBench:        { name: 'Close-Grip Bench Press', muscle: 'Triceps', type: 'accessory', cue: 'Hands shoulder width, elbows tucked, touch lower chest.' },
  dbOhExt:        { name: 'DB Overhead Extension', muscle: 'Triceps', type: 'isolation', cue: 'One dumbbell held with both hands, lower behind your head.' },

  // Legs
  squat:          { name: 'Back Squat', muscle: 'Quads / Glutes', type: 'compound', cue: 'Brace hard, sit down between your hips, knees track over toes, hit at least parallel.' },
  frontSquat:     { name: 'Front Squat', muscle: 'Quads', type: 'compound', cue: 'Elbows high, stay upright, sit deep.' },
  hackSquat:      { name: 'Hack Squat', muscle: 'Quads', type: 'compound', cue: 'Feet mid-platform, go deep, drive through the whole foot.' },
  smithSquat:     { name: 'Smith Machine Squat', muscle: 'Quads', type: 'compound', cue: 'Feet slightly forward, sit straight down.' },
  legPress:       { name: 'Leg Press', muscle: 'Quads / Glutes', type: 'compound', cue: 'Lower until knees near your chest without your lower back rolling up.' },
  gobletSquat:    { name: 'Goblet Squat', muscle: 'Quads', type: 'accessory', cue: 'Dumbbell at your chest, elbows inside knees at the bottom.' },
  rdl:            { name: 'Romanian Deadlift', muscle: 'Hamstrings / Glutes', type: 'compound', cue: 'Soft knees, push hips back, bar slides down the thighs until a big hamstring stretch.' },
  deadlift:       { name: 'Deadlift', muscle: 'Back / Hamstrings', type: 'compound', cue: 'Bar over mid-foot, brace, push the floor away, lock out with glutes.' },
  trapBar:        { name: 'Trap Bar Deadlift', muscle: 'Legs / Back', type: 'compound', cue: 'Sit a bit lower than a normal deadlift, stand up tall.' },
  dbRdl:          { name: 'Dumbbell RDL', muscle: 'Hamstrings', type: 'accessory', cue: 'Dumbbells close to your legs, hips back, flat back.' },
  goodMorning:    { name: 'Good Morning', muscle: 'Hamstrings', type: 'accessory', cue: 'Light bar on your back, hinge like a bow. Go light.' },
  backExt:        { name: '45° Back Extension', muscle: 'Glutes / Hamstrings', type: 'accessory', cue: 'Round slightly at the bottom, squeeze glutes to come up.' },
  bss:            { name: 'Bulgarian Split Squat', muscle: 'Quads / Glutes', type: 'accessory', cue: 'Back foot on a bench, drop the back knee straight down. Brutal but worth it.' },
  lunges:         { name: 'Walking Lunges', muscle: 'Quads / Glutes', type: 'accessory', cue: 'Long steps, back knee gently touches the floor.' },
  reverseLunge:   { name: 'Reverse Lunge', muscle: 'Glutes / Quads', type: 'accessory', cue: 'Step back, drop straight down, drive through the front heel.' },
  stepUp:         { name: 'Dumbbell Step-ups', muscle: 'Quads / Glutes', type: 'accessory', cue: 'Knee-height box, drive up with the front leg only.' },
  legExt:         { name: 'Leg Extension', muscle: 'Quads', type: 'isolation', cue: 'Pause at the top, slow on the way down.' },
  singleLegExt:   { name: 'Single-Leg Extension', muscle: 'Quads', type: 'isolation', cue: 'One leg at a time, lean back slightly for more stretch.' },
  lyingCurl:      { name: 'Lying Leg Curl', muscle: 'Hamstrings', type: 'isolation', cue: 'Hips pressed into the pad, curl all the way.' },
  seatedCurl:     { name: 'Seated Leg Curl', muscle: 'Hamstrings', type: 'isolation', cue: 'Lean forward slightly for a better stretch.' },
  nordic:         { name: 'Nordic Curl (assisted)', muscle: 'Hamstrings', type: 'isolation', cue: 'Anchor your feet, lower slowly, push off the floor to come back up.' },
  hipThrust:      { name: 'Barbell Hip Thrust', muscle: 'Glutes', type: 'accessory', cue: 'Upper back on a bench, chin tucked, squeeze glutes hard at the top.' },
  gluteBridge:    { name: 'Glute Bridge', muscle: 'Glutes', type: 'isolation', cue: 'On the floor, drive hips up and pause.' },
  cableKick:      { name: 'Cable Kickback', muscle: 'Glutes', type: 'isolation', cue: 'Kick back and slightly out, don\'t arch your lower back.' },
  standCalf:      { name: 'Standing Calf Raise', muscle: 'Calves', type: 'isolation', cue: 'Full stretch at the bottom with a 2 sec pause, all the way up.' },
  seatedCalf:     { name: 'Seated Calf Raise', muscle: 'Calves', type: 'isolation', cue: 'Pause in the stretch, no bouncing.' },
  lpCalf:         { name: 'Leg Press Calf Press', muscle: 'Calves', type: 'isolation', cue: 'Balls of feet on the edge of the platform, deep stretch.' },
  slCalf:         { name: 'Single-Leg DB Calf Raise', muscle: 'Calves', type: 'isolation', cue: 'Stand on a step, dumbbell in one hand, full range.' },

  // Core
  hangingRaise:   { name: 'Hanging Leg Raise', muscle: 'Abs', type: 'isolation', cue: 'Curl the pelvis up, don\'t just swing the legs.' },
  cableCrunch:    { name: 'Cable Crunch', muscle: 'Abs', type: 'isolation', cue: 'Kneel, crunch your ribs towards your hips.' },
  abWheel:        { name: 'Ab Wheel Rollout', muscle: 'Abs', type: 'isolation', cue: 'Roll out as far as you can with a flat back.' },
  plank:          { name: 'Plank (seconds)', muscle: 'Core', type: 'isolation', cue: 'Squeeze glutes and abs. Log seconds in the reps box.' },
  deadBug:        { name: 'Dead Bug', muscle: 'Core', type: 'isolation', cue: 'Lower back glued to the floor, opposite arm and leg extend.' },
  pallof:         { name: 'Pallof Press', muscle: 'Core', type: 'isolation', cue: 'Stand side-on to a cable, press out and resist the twist.' },
};

// Slots are "movement jobs". Each session picks one exercise per slot.
export const SLOTS = {
  chestHeavy:  ['bench', 'dbBench', 'machinePress', 'smithBench'],
  incline:     ['inclineDb', 'inclineBar', 'inclineSmith', 'inclineMachine'],
  chestIso:    ['cableFly', 'pecDeck', 'lowHighFly', 'dips', 'pushups'],
  vertPull:    ['pullup', 'chinup', 'pulldown', 'neutralPulldown', 'singleArmPd'],
  row:         ['bbRow', 'csRow', 'cableRow', 'tbarRow', 'dbRow', 'machineRow'],
  press:       ['ohp', 'seatedDbPress', 'machineOhp', 'arnold'],
  lateral:     ['latRaise', 'cableLat', 'machineLat', 'leanLat'],
  rearDelt:    ['facePull', 'reversePec', 'rearDbFly', 'cableRearFly'],
  biceps:      ['bbCurl', 'ezCurl', 'inclineCurl', 'hammerCurl', 'preacherCurl', 'cableCurl'],
  triceps:     ['pushdown', 'barPushdown', 'ohCableExt', 'skullCrusher', 'cgBench', 'dbOhExt'],
  squat:       ['squat', 'frontSquat', 'hackSquat', 'smithSquat'],
  squatMachine:['legPress', 'hackSquat', 'gobletSquat', 'smithSquat'],
  hinge:       ['rdl', 'deadlift', 'trapBar'],
  hingeLight:  ['dbRdl', 'goodMorning', 'backExt', 'rdl'],
  singleLeg:   ['bss', 'lunges', 'reverseLunge', 'stepUp'],
  quadIso:     ['legExt', 'singleLegExt'],
  hamIso:      ['lyingCurl', 'seatedCurl', 'nordic'],
  glute:       ['hipThrust', 'gluteBridge', 'cableKick', 'backExt'],
  calves:      ['standCalf', 'seatedCalf', 'lpCalf', 'slCalf'],
  core:        ['hangingRaise', 'cableCrunch', 'abWheel', 'plank', 'deadBug', 'pallof'],
  shrug:       ['shrug'],
};

// Rep targets and rest (seconds) by exercise type.
export const TYPE_DEFAULTS = {
  compound:  { reps: '6-10', rest: 150 },
  accessory: { reps: '8-12', rest: 120 },
  isolation: { reps: '10-15', rest: 75 },
};

// A slot entry: [slot, sets, anchor?]. The anchor is the session's main lift:
// it stays the same for a whole 6-week block so you can see yourself get stronger.
// Everything else rotates each session so no two days feel the same.
export const SESSIONS = {
  upperA: { title: 'Upper A', focus: 'Chest, back, shoulders, arms', slots: [['chestHeavy', 3, true], ['row', 3], ['press', 3], ['vertPull', 3], ['lateral', 3], ['biceps', 2], ['triceps', 2]] },
  upperB: { title: 'Upper B', focus: 'Back-first upper day', slots: [['vertPull', 3, true], ['incline', 3], ['row', 3], ['chestIso', 2], ['lateral', 3], ['rearDelt', 2], ['triceps', 2], ['biceps', 2]] },
  lowerA: { title: 'Lower A', focus: 'Quad-focused legs', slots: [['squat', 3, true], ['hingeLight', 3], ['singleLeg', 2], ['hamIso', 3], ['calves', 3], ['core', 2]] },
  lowerB: { title: 'Lower B', focus: 'Hinge-focused legs', slots: [['hinge', 3, true], ['squatMachine', 3], ['quadIso', 3], ['hamIso', 3], ['glute', 2], ['calves', 3], ['core', 2]] },
  push:   { title: 'Push', focus: 'Chest, shoulders, triceps', slots: [['chestHeavy', 3, true], ['press', 3], ['incline', 3], ['chestIso', 2], ['lateral', 3], ['triceps', 3]] },
  pull:   { title: 'Pull', focus: 'Back, rear delts, biceps', slots: [['vertPull', 3, true], ['row', 3], ['row', 2], ['rearDelt', 3], ['shrug', 2], ['biceps', 3]] },
  legs:   { title: 'Legs', focus: 'Quads, hamstrings, glutes, calves', slots: [['squat', 3, true], ['hinge', 3], ['singleLeg', 2], ['quadIso', 2], ['hamIso', 3], ['calves', 3]] },
  fullA:  { title: 'Full Body A', focus: 'Squat + bench day', slots: [['squat', 3, true], ['chestHeavy', 3], ['row', 3], ['lateral', 3], ['hamIso', 2], ['biceps', 2]] },
  fullB:  { title: 'Full Body B', focus: 'Hinge + press day', slots: [['hinge', 3, true], ['press', 3], ['vertPull', 3], ['quadIso', 2], ['triceps', 2], ['core', 2]] },
  fullC:  { title: 'Full Body C', focus: 'Legs + upper chest day', slots: [['squatMachine', 3, true], ['incline', 3], ['row', 3], ['rearDelt', 2], ['calves', 3], ['biceps', 2]] },
};

// Which sessions rotate depending on how many days a week you train.
export const SPLITS = {
  2: ['fullA', 'fullB'],
  3: ['fullA', 'fullB', 'fullC'],
  4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
  5: ['upperA', 'lowerA', 'push', 'pull', 'legs'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
};

// 6-week block. RIR = reps in reserve (how many more reps you could have done).
export const BLOCK = [
  { week: 1, rir: 3, note: 'Settle in. Leave ~3 reps in the tank and nail your form.' },
  { week: 2, rir: 2, note: 'Push a bit harder. ~2 reps in the tank.' },
  { week: 3, rir: 2, note: 'Beat last week: +1 rep or +2.5 kg on anything you can.' },
  { week: 4, rir: 1, note: 'Hard week. ~1 rep in the tank. Extra set on isolation work.' },
  { week: 5, rir: 1, note: 'Hardest week. Last set of each exercise can go to failure (not on squats/deadlifts).' },
  { week: 6, rir: 4, note: 'Deload. Half the sets, lighter effort. Let your body catch up and grow.' },
];

export const WARMUP = [
  '5 min easy cardio (bike, rower or incline walk)',
  'Arm circles, leg swings, hip openers (1 min)',
  'Main lift: 2-3 ramp-up sets (e.g. bar × 10, 50% × 6, 75% × 3)',
];

export const RECOVERY = [
  { id: 'walk', label: '30-45 min walk', detail: 'Easy pace. Helps recovery and appetite.' },
  { id: 'cat', label: 'Cat-cow × 10', detail: 'On all fours, slowly arch and round your back.' },
  { id: 'hip', label: 'Hip flexor stretch 45s / side', detail: 'Half-kneeling, squeeze the back glute.' },
  { id: 'pigeon', label: 'Pigeon stretch 45s / side', detail: 'Or figure-4 stretch lying on your back.' },
  { id: 'thoracic', label: 'Open books × 8 / side', detail: 'Lying on your side, rotate your top arm open.' },
  { id: 'hang', label: 'Dead hang 3 × 30s', detail: 'Decompresses the spine and builds grip.' },
  { id: 'coreCircuit', label: 'Core: 3 rounds of dead bug × 10 + side plank 30s/side', detail: 'Optional but good.' },
];

// kcal / protein (g) are rough estimates for a typical portion.
export const MEALS = {
  breakfast: [
    { name: 'PB banana oats + whey', kcal: 750, p: 45, detail: '80g oats, 300ml milk, 1 banana, 1 tbsp peanut butter, 1 scoop whey' },
    { name: 'Eggs on toast + avocado', kcal: 680, p: 32, detail: '4 scrambled eggs, 2 slices toast, half an avocado' },
    { name: 'Greek yoghurt bowl', kcal: 600, p: 38, detail: '300g Greek yoghurt, 60g granola, berries, honey' },
    { name: 'Breakfast burrito', kcal: 720, p: 40, detail: '3 eggs, cheese, beans, salsa in a large wrap' },
    { name: 'Overnight protein oats', kcal: 620, p: 42, detail: '80g oats, milk, 1 scoop whey, chia seeds, berries' },
    { name: 'Bagel, cream cheese & salmon', kcal: 640, p: 32, detail: '1 bagel, cream cheese, 100g smoked salmon + glass of OJ' },
    { name: 'Protein pancakes', kcal: 650, p: 45, detail: '2 eggs, 1 banana, 60g oats, 1 scoop whey, maple syrup' },
  ],
  lunch: [
    { name: 'Chicken, rice & veg', kcal: 750, p: 55, detail: '200g chicken, 1.5 cups cooked rice, veg, olive oil' },
    { name: 'Tuna pasta', kcal: 720, p: 48, detail: '100g dry pasta, 1 tin tuna, sweetcorn, light mayo' },
    { name: 'Beef burrito bowl', kcal: 850, p: 50, detail: '150g lean mince, rice, beans, cheese, salsa' },
    { name: '2 chicken wraps', kcal: 720, p: 50, detail: 'Chicken, cheese, salad, sauce in 2 wraps' },
    { name: 'Turkey & cheese sandwiches', kcal: 700, p: 45, detail: '2 sandwiches + a piece of fruit' },
    { name: 'Salmon, potatoes & greens', kcal: 700, p: 42, detail: '1 salmon fillet, 300g potatoes, green beans' },
    { name: 'Chicken Caesar pasta salad', kcal: 760, p: 50, detail: '100g dry pasta, 150g chicken, parmesan, dressing' },
  ],
  dinner: [
    { name: 'Spaghetti bolognese', kcal: 850, p: 50, detail: '150g lean mince, 100g dry spaghetti, tomato sauce, parmesan' },
    { name: 'Chicken stir-fry noodles', kcal: 800, p: 50, detail: '200g chicken, noodles, veg, soy & honey' },
    { name: 'Steak, potatoes & veg', kcal: 850, p: 55, detail: '200g steak, roast potatoes, veg' },
    { name: 'Chicken curry & rice', kcal: 850, p: 50, detail: '200g chicken, curry sauce, 1.5 cups rice' },
    { name: 'Homemade burgers & wedges', kcal: 950, p: 55, detail: '2 lean beef patties, buns, cheese, potato wedges' },
    { name: 'Salmon teriyaki & rice', kcal: 800, p: 45, detail: 'Salmon fillet, teriyaki sauce, rice, broccoli' },
    { name: 'Chilli con carne & rice', kcal: 820, p: 50, detail: '150g mince, kidney beans, rice, sour cream' },
    { name: 'Chicken fajitas', kcal: 800, p: 52, detail: '200g chicken, peppers, 3 wraps, cheese, salsa' },
  ],
  snack: [
    { name: 'Whey shake + banana', kcal: 400, p: 35, detail: '1 scoop whey, 300ml milk, 1 banana' },
    { name: 'Peanut butter toast', kcal: 400, p: 14, detail: '2 slices toast, 2 tbsp peanut butter' },
    { name: 'Greek yoghurt, honey & nuts', kcal: 350, p: 22, detail: '200g Greek yoghurt, honey, handful of nuts' },
    { name: 'Cottage cheese & crackers', kcal: 300, p: 25, detail: '200g cottage cheese, crackers' },
    { name: 'Protein bar + glass of milk', kcal: 420, p: 30, detail: 'Any bar with 20g+ protein' },
    { name: 'Rice cakes, PB & jam', kcal: 320, p: 9, detail: '3 rice cakes, peanut butter, jam' },
    { name: '3 boiled eggs + fruit', kcal: 300, p: 19, detail: 'Easy to prep in advance' },
    { name: 'Trail mix + fruit', kcal: 380, p: 10, detail: 'Big handful of nuts & raisins, apple' },
    { name: 'Mass shake', kcal: 800, p: 45, detail: 'Blend: 50g oats, 400ml whole milk, 1 banana, 1 tbsp PB, 1 scoop whey' },
  ],
};

export const TIPS = [
  'Progressive overload is the whole game: over time, add reps or weight to the same lifts.',
  'Aim for 0.25-0.35 kg of weight gain per week. Faster than ~0.5 kg/week is mostly fat.',
  'Protein: about 1.6-2.2 g per kg of bodyweight per day. For you that\'s roughly 140 g.',
  'Sleep is when you grow. 7-9 hours makes a real difference to strength and muscle gain.',
  'Creatine monohydrate, 3-5 g a day, every day, is the best-researched supplement for muscle gain.',
  'Train each muscle about twice a week with roughly 10-20 hard sets per week.',
  'Leave 1-3 reps in the tank on most sets. You don\'t need to go to failure to grow.',
  'Struggling to eat enough? Drink some of your calories: milk, shakes, smoothies.',
  'Weigh yourself in the morning after the toilet, before food. Watch the weekly average, not single days.',
  'Controlled lowering (2-3 seconds) and a full stretch at the bottom help muscle growth.',
  'Missed a session? Just do the next one. The app keeps your rotation in order.',
  'Deload weeks are part of the plan, not a step back.',
  'Rest 2-3 minutes on big lifts. Short rest on heavy compounds costs you reps.',
  'Eating 4-5 times a day makes hitting a calorie surplus much easier.',
  'If your weight hasn\'t moved in 2 weeks, add ~150-200 kcal a day.',
];

export const GUIDE = [
  { h: 'The goal', b: 'Go from ~70 kg to 80 kg by building muscle, not just adding fat. That means a lean bulk: a small calorie surplus, lots of protein, and hard, consistent training with progressive overload.' },
  { h: 'How fast', b: 'Research on lean bulking suggests gaining about 0.25-0.5% of bodyweight per week (for you roughly 0.2-0.35 kg/week). At that pace 10 kg takes around 7-12 months. Beginners can sit at the faster end.' },
  { h: 'Training', b: 'Each muscle is hit about twice a week with around 10-20 hard sets per week. This is the range where most studies show the best growth. Compound lifts use 6-10 reps, accessories 8-12, isolation 10-15. Rest 2-3 minutes on heavy lifts.' },
  { h: 'Why the workout changes daily', b: 'Your main lift for each session stays the same for a 6-week block so you can track strength. Every other exercise rotates from a pool of equivalent movements. That keeps it fresh, hits muscles from different angles, and stops the gym getting boring, while still covering every muscle properly.' },
  { h: 'The 6-week block', b: 'Weeks 1-5 build effort (reps in reserve goes from 3 down to 1). Week 6 is a deload: fewer sets, lighter effort. Then a new block starts with new main lifts.' },
  { h: 'Progressive overload', b: 'The app shows what you did last time. When you hit the top of the rep range on every set, add weight next time (usually 2.5 kg on upper body, 5 kg on lower). Weights are optional to log, but logging makes the suggestions work.' },
  { h: 'Food', b: 'Calories: maintenance + ~300-400 kcal. Protein: ~2 g/kg. Fat: ~25% of calories. The rest from carbs, which fuel training. If the weekly average weight stalls for 2 weeks, eat ~150-200 kcal more.' },
  { h: 'Recovery', b: 'Sleep 7-9 hours. Rest days include a walk and mobility work. Take creatine monohydrate (3-5 g/day). Drink around 3 litres of water.' },
  { h: 'Disclaimer', b: 'This is general fitness information, not medical advice. If you have an injury or health condition, check with a professional first.' },
];
