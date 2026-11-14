// The color of a provider, chosen in Settings. A model tag in a replay uses it, so a different provider is easy
// to see; a stronger model of the same provider gets a darker shade, a lighter one a paler shade.
import { MODELS, GOOGLE_MODELS } from "./engine/catalog.js";

export const DEFAULT_PROVIDER_COLORS = { anthropic: "#d97757", google: "#4285f4" };
export const COLOR_CHOICES = ["#d97757", "#4285f4", "#2e9e6b", "#8b5cf6", "#d4537e", "#c28a00"];
const HEX = /^#[0-9a-fA-F]{6}$/;

export const isColor = (value) => typeof value === "string" && HEX.test(value);

// The colors to use: the saved ones where valid, else the defaults.
export function mergeProviderColors(saved) {
  const out = { ...DEFAULT_PROVIDER_COLORS };
  for (const id of Object.keys(out)) if (isColor(saved?.[id])) out[id] = saved[id].toLowerCase();
  return out;
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
// amount > 0 mixes with white, amount < 0 mixes with black.
const shade = (hex, amount) => toHex(channels(hex).map((c) => (amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Cheap models are paler, the middle one is the provider color itself, the strongest is darker.
const TIER_SHADE = { fast: 0.5, balanced: 0, strong: -0.35 };

// Which provider and tier a model id belongs to, or null for an unknown id.
export function modelInfo(modelId) {
  for (const [provider, models] of [["anthropic", MODELS], ["google", GOOGLE_MODELS]]) {
    const found = models.find((m) => m.id === modelId);
    if (found) return { provider, tier: found.key };
  }
  return null;
}

// { background, color } for the tag of a model id, or null when the model is not known.
export function modelTagColors(modelId, colors) {
  const info = modelInfo(modelId);
  if (!info) return null;
  const base = mergeProviderColors(colors)[info.provider];
  const background = shade(base, TIER_SHADE[info.tier] ?? 0);
  return { background, color: luminance(background) > 0.4 ? "#1f1f1f" : "#ffffff" };
}

// Colors a tag element in place (set through the style object, which the page security policy allows).
export function paintModelTag(element, modelId, colors) {
  const painted = modelTagColors(modelId, colors);
  if (!painted || !element.style) return;
  element.style.background = painted.background;
  element.style.color = painted.color;
  element.style.borderColor = painted.background;
}
