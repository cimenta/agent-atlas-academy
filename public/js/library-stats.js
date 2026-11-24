// The table "Runs by goal and level" of the About page: how many runs the Library has, how long they take to replay and how long a student needs
// to study them. Pure numbers from runs/index.json (level, paths, runSeconds, studyMinutes), so the table never gets out of date.
import { h } from "./dom.js";
import { GOALS, LEVELS, levelOf, stepOf } from "./library-path.js";

const sum = (items, key) => items.reduce((total, item) => total + (Number.isFinite(item?.[key]) && item[key] > 0 ? item[key] : 0), 0);

// { goals: [{ id, runs, levels: [n1, n2, n3], seconds, minutes }], total: { runs, seconds, minutes } }.
// A run on the path of two goals is counted in both rows, so the rows add up to more than the total, which counts every run once.
export function libraryStats(items) {
  const list = Array.isArray(items) ? items : [];
  const goals = GOALS.map((id) => {
    const runs = list.filter((item) => stepOf(item, id) > 0 && levelOf(item) > 0);
    return { id, runs: runs.length, levels: LEVELS.map((level) => runs.filter((item) => levelOf(item) === level).length), seconds: sum(runs, "runSeconds"), minutes: sum(runs, "studyMinutes") };
  });
  return { goals, total: { runs: list.length, seconds: sum(list, "runSeconds"), minutes: sum(list, "studyMinutes") } };
}

// 12 min, 1 h 05 min; under a minute is "<1 min".
export function formatMinutes(minutes) {
  const m = Math.round(minutes);
  if (m < 1) return "<1 min";
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

export function statsTable({ doc, t, items }) {
  const stats = libraryStats(items);
  const cell = (tag, text, attrs = {}) => h(doc, tag, { class: "num", ...attrs }, text);
  const study = h(doc, "th", { class: "num", tabindex: "0", "data-ui": "stats-study-head", "data-hover-title": t("about.stats.studyTitle"), "data-hover-text": t("about.stats.studyHint"), "data-hover-hint": t("about.stats.studyMore") }, t("about.stats.study"));
  const head = h(doc, "tr", {}, h(doc, "th", {}, t("about.stats.goal")), cell("th", t("about.stats.runs")), ...LEVELS.map((level) => cell("th", t(`path.level.${level}`))), cell("th", t("about.stats.replay")), study);
  const row = (name, runs, levels, seconds, minutes, attrs = {}) => h(doc, "tr", attrs, h(doc, "td", {}, name), cell("td", String(runs)), ...(levels ?? [null, null, null]).map((n) => cell("td", n === null ? "" : String(n))), cell("td", formatMinutes(seconds / 60)), cell("td", formatMinutes(minutes), { "data-ui": "stats-study" }));
  const body = stats.goals.map((g) => row(t(`path.goal.${g.id}`), g.runs, g.levels, g.seconds, g.minutes, { "data-goal": g.id }));
  const foot = row(t("about.stats.total"), stats.total.runs, null, stats.total.seconds, stats.total.minutes, { "data-ui": "stats-total" });
  return h(doc, "table", { class: "libstats", "data-ui": "library-stats" }, h(doc, "thead", {}, head), h(doc, "tbody", {}, ...body), h(doc, "tfoot", {}, foot));
}
