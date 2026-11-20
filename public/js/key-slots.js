// A key slot is a place for one API key. The providers and their slots are listed in the registry (engine/providers.js):
// Anthropic has one slot; Gemini has two, one for a key on Google's free tier and one for a paid key.
import { SLOTS as REGISTRY_SLOTS, SLOT_IDS as REGISTRY_SLOT_IDS, freeLimitsOf } from "./engine/providers.js";

export const SLOTS = REGISTRY_SLOTS;
export const SLOT_IDS = REGISTRY_SLOT_IDS;

const find = (id) => SLOTS.find((s) => s.id === id);
export const isSlot = (id) => find(id) !== undefined;
export const slotProvider = (id) => find(id)?.provider ?? "anthropic";
export const slotIsFree = (id) => find(id)?.free === true;
// The locale key of the name of a slot and of the small text under it (null: none).
export const slotLabelKey = (id) => find(id)?.labelKey ?? null;
export const slotSubKey = (id) => find(id)?.subKey ?? null;
// The free-plan limits of a slot, or null.
export const slotFreeLimits = (id) => freeLimitsOf(id);
