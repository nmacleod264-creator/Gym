// Meal analysis through the viewer's own Claude account (the artifact `sample` capability).
// No API key: each analysis uses the person's normal Claude usage.

let samplePromise = null;
function getSample() {
  if (!samplePromise) samplePromise = window.claude?.use ? window.claude.use('sample') : Promise.resolve(null);
  return samplePromise;
}

// {text, images}: whether this view can analyse descriptions, and photos.
export async function capabilities() {
  const sample = await getSample();
  if (!sample) return { text: false, images: false };
  const limits = await sample.limits().catch(() => null);
  return { text: true, images: !!limits?.images };
}

// Shrinks a photo: a JPEG for Claude and a small thumbnail to keep in the log.
export function preparePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const draw = (maxSide) => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c;
      };
      const thumb = draw(240).toDataURL('image/jpeg', 0.6);
      draw(1280).toBlob(blob => {
        URL.revokeObjectURL(url);
        blob ? resolve({ blob, thumb }) : reject(new Error("Couldn't read that photo. Try a different one."));
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that photo. Try a different one.")); };
    img.src = url;
  });
}

const INSTRUCTIONS = `You estimate the nutrition of one meal or snack for someone tracking calories and protein while trying to gain muscle. You get a photo, a short description, or both.

How to estimate:
- The description is the most reliable source. Weights and volumes the person states were measured, so use them exactly. Use the photo for what the description leaves out: other things on the plate, and how big unweighed portions look.
- If a kitchen scale is in the photo and its display is readable, treat that reading as a measured weight of the food on it. Assume the scale was zeroed with any plate or bowl already on it, and say so. Food on a scale before cooking (raw meat, dry pasta) was weighed raw or dry, so use raw/dry nutrition values. If the display is too blurry to read with confidence, say what you think it shows and ask.
- Starchy foods change weight when cooked. Oats, rice, pasta, couscous, noodles, lentils and quinoa roughly double to triple. Meat and fish lose about a quarter of their weight. When a weight is given without saying dry/raw or cooked, decide which is likelier from context (people usually weigh oats and pasta dry; a weighed portion of rice from a pot is usually cooked) and state that assumption.
- For portions judged from the photo, use visual references (a dinner plate is about 26 cm, bowls, cutlery, hands, packaging) and typical portion sizes.
- Use standard nutrition values (USDA, UK CoFID or the product label when you recognise a brand). Count cooking oil, butter, sauces, dressings, cheese and toppings that are visible or mentioned, since missing these is the most common reason estimates come out low. Don't add anything that isn't visible or described.
- kcal_low and kcal_high bracket the plausible total for the whole meal: narrow when everything was weighed, wider when portions were judged from the photo.
- confidence: "high" when the main items were weighed or are standard packaged portions, "medium" when the foods are clear but portions were judged, "low" when you're unsure what the food is or how much there is.
- assumptions: short, specific notes the person can check and correct, such as "80 g oats taken as dry weight". Most important first, at most 4.
- question: only when one missing fact would change the total by more than about 15% (dry vs cooked weight, skin on or off, whether a drink is sugary), ask it in one short sentence. Otherwise an empty string.
- If the photo shows no food or drink and none is described, set is_food to false and leave items empty.
- Use metric amounts and short item names ("Rolled oats", "Whole milk"). title is a short name for the whole meal.

Reply with only one JSON object in exactly this shape:
{"is_food": true, "title": "Oats with banana", "items": [{"name": "Rolled oats", "amount": "80 g dry", "kcal": 303, "protein_g": 11, "carbs_g": 54, "fat_g": 6}], "kcal_low": 280, "kcal_high": 330, "confidence": "high", "assumptions": ["80 g oats taken as dry weight"], "question": ""}`;

const MESSAGES = {
  not_granted: 'Claude is not allowed to analyse meals on this page. Allow it in the page\'s permissions, then try again.',
  sampling_disabled: 'Claude is not available for meal analysis on this account.',
  images_unavailable: 'Photos can\'t be sent from here. Remove the photo and describe the meal instead.',
  image_rejected: 'That photo couldn\'t be used. Try a different one.',
  rate_limited: 'You\'ve reached a Claude usage limit for now. Try again later.',
  session_expired: 'You\'ve been signed out of Claude. Sign in again, then try again.',
  refused: 'Claude couldn\'t analyse this one. Try a different photo or describe it instead.',
  prompt_too_large: 'The description is too long. Shorten it and try again.',
};

export async function analyseMeal({ photo, description }) {
  const sample = await getSample();
  if (!sample) throw new Error('Meal analysis only works when this app is opened in Claude.');
  const desc = description.trim();
  const prompt = `${INSTRUCTIONS}\n\n${desc ? `What I ate: ${desc}` : 'No description. Estimate from the photo.'}${photo ? '\nThe attached photo shows the meal.' : ''}`;
  const opts = { modelTier: 'default', cache: false };
  if (photo) opts.images = [photo];

  let data;
  try {
    data = await sample.json(prompt, opts);
  } catch (e) {
    if (e?.code === 'cancelled') return null;
    throw new Error(MESSAGES[e?.code] || 'Something went wrong getting the estimate. Try again.');
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) throw new Error('Got an unreadable answer. Try again.');
  const r = n => Math.max(0, Math.round(Number(n) || 0));
  return {
    is_food: data.is_food !== false,
    title: String(data.title || 'Meal').slice(0, 60),
    items: data.items.slice(0, 20).map(i => ({
      name: String(i.name || 'Item'), amount: String(i.amount || ''),
      kcal: r(i.kcal), protein_g: r(i.protein_g), carbs_g: r(i.carbs_g), fat_g: r(i.fat_g),
    })),
    kcal_low: r(data.kcal_low),
    kcal_high: r(data.kcal_high),
    confidence: ['high', 'medium', 'low'].includes(data.confidence) ? data.confidence : 'medium',
    assumptions: (Array.isArray(data.assumptions) ? data.assumptions : []).slice(0, 4).map(String),
    question: String(data.question || ''),
  };
}
