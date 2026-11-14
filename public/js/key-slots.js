// A key slot is a place for one API key. Anthropic has one; Gemini has two, one for a key on Google's free tier and
// one for a paid key, so both can be saved side by side. "google" is the paid slot (it is where a Gemini key was
// always kept); "google-free" is the free one.
export const SLOTS = [
  { id: "anthropic", provider: "anthropic", free: false },
  { id: "google-free", provider: "google", free: true },
  { id: "google", provider: "google", free: false },
];
export const SLOT_IDS = SLOTS.map((s) => s.id);

const find = (id) => SLOTS.find((s) => s.id === id);
export const isSlot = (id) => find(id) !== undefined;
export const slotProvider = (id) => find(id)?.provider ?? "anthropic";
export const slotIsFree = (id) => find(id)?.free === true;
