// Meal analysis with Claude: photo and/or description in, itemised nutrition estimate out.
// Calls the API straight from the phone with the user's own key (stored only on the device).

const KEY_STORE = 'dailygym.apikey';
const MODEL = 'claude-opus-5-5';

export function getApiKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORE, key);
    else localStorage.removeItem(KEY_STORE);
  } catch (e) { /* storage blocked */ }
}

// Shrink the photo before sending: faster upload, lower cost, same accuracy.
export function resizeImage(file, maxSide = 1280) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image. Try a different photo.")); };
    img.src = url;
  });
}

const SYSTEM = `You estimate the nutrition of one meal or snack for someone tracking calories and protein while trying to gain muscle. You get a photo, a short description, or both.

How to estimate:
- The description is the most reliable source. Weights and volumes the person states were measured, so use them exactly. Use the photo for what the description leaves out: other things on the plate, and how big unweighed portions look.
- Starchy foods change weight when cooked. Oats, rice, pasta, couscous, noodles, lentils and quinoa roughly double to triple. Meat and fish lose about a quarter of their weight. When a weight is given without saying dry/raw or cooked, decide which is likelier from context (people usually weigh oats and pasta dry; a weighed portion of rice from a pot is usually cooked) and state that assumption.
- For portions judged from the photo, use visual references (a dinner plate is about 26 cm, bowls, cutlery, hands, packaging) and typical portion sizes.
- Use standard nutrition values (USDA, UK CoFID or the product label when you recognise a brand). Count cooking oil, butter, sauces, dressings, cheese and toppings that are visible or mentioned, since missing these is the most common reason estimates come out low. Don't add anything that isn't visible or described.
- kcal_low and kcal_high bracket the plausible total for the whole meal: narrow when everything was weighed, wider when portions were judged from the photo.
- confidence: "high" when the main items were weighed or are standard packaged portions, "medium" when the foods are clear but portions were judged, "low" when you're unsure what the food is or how much there is.
- assumptions: short, specific notes the person can check and correct, such as "80 g oats taken as dry weight". Most important first, at most 4.
- question: only when one missing fact would change the total by more than about 15% (dry vs cooked weight, whether a drink is sugary, how many slices), ask it in one short sentence. Otherwise use an empty string.
- If the photo shows no food or drink and none is described, set is_food to false and leave items empty.
- Use metric amounts and short item names ("Rolled oats", "Whole milk"). title is a short name for the whole meal.`;

const NUM = { type: 'number' };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_food', 'title', 'items', 'kcal_low', 'kcal_high', 'confidence', 'assumptions', 'question'],
  properties: {
    is_food: { type: 'boolean' },
    title: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
        properties: { name: { type: 'string' }, amount: { type: 'string' }, kcal: NUM, protein_g: NUM, carbs_g: NUM, fat_g: NUM },
      },
    },
    kcal_low: NUM,
    kcal_high: NUM,
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    assumptions: { type: 'array', items: { type: 'string' } },
    question: { type: 'string' },
  },
};

let sdk = null;
async function loadSdk() {
  // Loaded on first use so the rest of the app never waits for it.
  if (!sdk) sdk = (await import('./vendor/anthropic-sdk.js')).default;
  return sdk;
}

export async function analyzeMeal({ apiKey, image, description }) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 120_000 });

  const content = [];
  if (image) {
    const [, mediaType, data] = image.match(/^data:(image\/[a-z]+);base64,(.*)$/) || [];
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
  }
  content.push({
    type: 'text',
    text: description.trim()
      ? `What I ate: ${description.trim()}`
      : 'No description. Estimate from the photo.',
  });

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If the model declines, the API re-runs the request on its recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    throw new Error(friendlyError(Anthropic, err));
  }

  if (response.stop_reason === 'refusal') throw new Error("Claude couldn't analyse this one. Try a different photo or just describe it.");
  if (response.stop_reason === 'max_tokens') throw new Error('The answer got cut off. Please try again.');

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('Got an unreadable answer. Please try again.'); }

  const r = n => Math.max(0, Math.round(Number(n) || 0));
  data.items = data.items.map(i => ({ ...i, kcal: r(i.kcal), protein_g: r(i.protein_g), carbs_g: r(i.carbs_g), fat_g: r(i.fat_g) }));
  data.kcal_low = r(data.kcal_low);
  data.kcal_high = r(data.kcal_high);
  return data;
}

function friendlyError(Anthropic, err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Your API key was rejected. Check it in Settings.';
  if (err instanceof Anthropic.PermissionDeniedError) return "Your API key isn't allowed to use this model.";
  if (err instanceof Anthropic.RateLimitError) return 'Too many requests right now. Wait a minute and try again.';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'That took too long. Check your connection and try again.';
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Are you online?";
  if (err instanceof Anthropic.BadRequestError) {
    const msg = err.error?.error?.message || err.message || '';
    if (/credit balance/i.test(msg)) return 'Your Anthropic account is out of credit. Top up at console.anthropic.com.';
    return `Request rejected: ${msg}`;
  }
  if (err instanceof Anthropic.APIError) return `Claude had a problem (${err.status ?? 'error'}). Try again in a moment.`;
  return err?.message || 'Something went wrong.';
}
