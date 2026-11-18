// Reads a reply that is a JSON list of 2 to 6 texts under one key ({"parts":[...]} or {"steps":[...]}).
// Returns the trimmed texts, or null when the reply is not valid. A list that is too long is invalid, never cut.
import { candidates } from "./supervisor.js";

export const LIST_MIN = 2;
export const LIST_MAX = 6;

export function parseListReply(text, key) {
  if (typeof text !== "string" || text.trim() === "") return null;
  for (const candidate of candidates(text)) {
    let data;
    try {
      data = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (data === null || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data[key])) continue;
    const items = data[key];
    if (items.length < LIST_MIN || items.length > LIST_MAX) continue;
    if (!items.every((x) => typeof x === "string" && x.trim() !== "")) continue;
    return items.map((x) => x.trim());
  }
  return null;
}
