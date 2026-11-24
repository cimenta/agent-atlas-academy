// The recommended path of the Library, drawn: the four goals, the filter bar, the legend, the Continue box and the steps by level.
// Pure drawing: the rules are in library-path.js, the marks of done steps come in as a Set of "<goal>:<runId>".
import { h } from "./dom.js";
import { GOALS, LEVELS, goalLevels, nextStep, stepOf, levelOf, kindOf } from "./library-path.js";

// The level as dots (the same icon as on the card in the list).
export function levelDots(doc, t, level) {
  return h(doc, "span", { class: `lv-dots l${level}`, "data-ui": "run-level", role: "img", "aria-label": t("path.level.label", { level: t(`path.level.${level}`) }), title: t(`path.level.${level}`) }, ...[1, 2, 3].map((n) => h(doc, "i", { class: n <= level ? "on" : undefined })));
}

export function stepIcon(doc, t, n, done, goal) {
  return h(doc, "span", { class: `step-icon${done ? " done" : ""}`, "data-ui": "run-step", role: "img", "aria-label": t(done ? "path.stepDone" : "path.step", { n }), title: t("path.stepTip", { n, goal: goal ? t(`path.goal.${goal}`) : "" }) }, done ? `✓ ${n}` : String(n));
}

// The checkbox that limits the lists to one topic of the path, and below it the bar with the chosen tags (only while a tag is chosen), shared by the tabs Recommended path and Tags.
export function drawFilterBar({ doc, t, tags, goal, onlyGoal, tagLabel, onRemove, onClear, onOnlyGoal }) {
  const chips = tags.map((tag) => {
    const chip = h(doc, "button", { type: "button", class: "tag-chip", "data-ui": "tag-chip", "aria-label": t("path.removeTag", { tag: tagLabel(tag) }), title: t("path.removeTag", { tag: tagLabel(tag) }) }, `${tagLabel(tag)} ×`);
    chip.addEventListener("click", () => onRemove(tag));
    return chip;
  });
  const clear = tags.length > 0 ? h(doc, "button", { type: "button", class: "small", "data-ui": "tags-clear" }, t("path.clearTags")) : "";
  if (clear) clear.addEventListener("click", () => onClear());
  const only = h(doc, "input", { type: "checkbox", "data-ui": "only-goal", checked: onlyGoal });
  only.addEventListener("change", (event) => onOnlyGoal(Boolean(event?.target?.checked ?? only.checked)));
  // The checkbox row is always there; the blue frame with the chosen tags only while a tag is chosen.
  const row = h(doc, "label", { class: "only-goal", "data-ui": "only-goal-row" }, only, t("path.onlyGoal", { goal: t(`path.goal.${goal}`) }));
  const frame = tags.length > 0 ? h(doc, "div", { class: "fbar", "data-ui": "filter-chips" }, h(doc, "span", {}, t("path.filterTags")), ...chips, clear) : "";
  return h(doc, "div", { class: "fbox", "data-ui": "filter-bar" }, row, ...(frame ? [frame] : []));
}

// items: the runs of the library (index entries). done: Set of "<goal>:<runId>". teachesOf(item): the one line of what the run teaches.
export function drawPath({ doc, t, items, goal, tags, done, tagLabel, teachesOf, filterBar, onGoal, onToggleDone, onOpen }) {
  const levels = goalLevels(items, goal, tags);
  const all = goalLevels(items, goal);
  const total = LEVELS.reduce((n, l) => n + all[l].length, 0);
  const shown = LEVELS.reduce((n, l) => n + levels[l].length, 0);
  const doneIn = (g) => LEVELS.reduce((n, l) => n + goalLevels(items, g)[l].filter((r) => done.has(`${g}:${r.id}`)).length, 0);
  const totalIn = (g) => LEVELS.reduce((n, l) => n + goalLevels(items, g)[l].length, 0);

  const goals = h(
    doc,
    "div",
    { class: "path-goals", role: "group", "aria-label": t("path.title") },
    ...GOALS.map((g) => {
      const count = totalIn(g);
      const button = h(
        doc,
        "button",
        { type: "button", class: "path-goal", "data-ui": "path-goal", "data-goal": g, "aria-pressed": String(g === goal) },
        h(doc, "b", {}, t(`path.goal.${g}`)),
        h(doc, "span", {}, t(`path.goalSub.${g}`)),
        h(doc, "div", { class: "pbar" }, h(doc, "i", { style: `width:${count > 0 ? Math.round((doneIn(g) / count) * 100) : 0}%` })),
      );
      button.addEventListener("click", () => onGoal(g));
      return button;
    }),
  );

  const legend = h(doc, "div", { class: "legend", "data-ui": "path-legend", "aria-label": t("path.legend") }, ...LEVELS.map((l) => h(doc, "span", {}, levelDots(doc, t, l), t(`path.level.${l}`))), h(doc, "span", {}, stepIcon(doc, t, 1, false, goal), t("path.step", { n: "" }).trim()));

  const anyDone = done.size > 0;
  const next = nextStep(items, goal, done, tags);
  const parts = [goals, filterBar, legend];
  if (anyDone && next) {
    const go = h(doc, "button", { type: "button", "data-ui": "path-continue" }, t("path.continue"));
    go.addEventListener("click", () => onOpen(next.id));
    parts.push(h(doc, "div", { class: "path-next", "data-ui": "path-next" }, h(doc, "div", {}, h(doc, "b", {}, t("path.continueTitle", { title: next.title })), h(doc, "small", {}, teachesOf(next) || "")), go));
  } else if (!next && shown > 0) {
    parts.push(h(doc, "p", { class: "notice", "data-ui": "path-all-done" }, t("path.allDone")));
  }
  if (total === 0) parts.push(h(doc, "p", { class: "notice", "data-ui": "path-empty" }, t("path.empty")));
  else if (shown === 0) parts.push(h(doc, "p", { class: "notice", "data-ui": "path-empty" }, t("path.emptyFilter")));

  for (const level of LEVELS) {
    const list = levels[level];
    if (list.length === 0) continue;
    parts.push(h(doc, "div", { class: "path-level", "data-ui": "path-level" }, levelDots(doc, t, level), h(doc, "h3", {}, t(`path.level.${level}`)), h(doc, "small", {}, t("path.progress", { done: list.filter((r) => done.has(`${goal}:${r.id}`)).length, total: list.length }))));
    parts.push(
      h(
        doc,
        "ol",
        { class: "path-steps" },
        ...list.map((item) => {
          const isDone = done.has(`${goal}:${item.id}`);
          const kind = kindOf(item);
          const open = h(doc, "button", { type: "button", class: "primary open", "data-ui": "step-open" }, t("path.open"));
          open.addEventListener("click", () => onOpen(item.id));
          const mark = h(doc, "button", { type: "button", "data-ui": "step-done" }, t(isDone ? "path.undo" : "path.done"));
          mark.addEventListener("click", () => onToggleDone(goal, item.id, !isDone));
          return h(
            doc,
            "li",
            { class: `path-step${isDone ? " done" : ""}`, "data-ui": "path-step", "data-run": item.id },
            h(doc, "div", {}, h(doc, "div", { class: "pt" }, item.title), h(doc, "div", { class: "pd" }, teachesOf(item) || ""), h(doc, "div", { class: "pchips" }, h(doc, "span", { class: `type-chip type-${item.pattern}` }, t(`pattern.${item.pattern}`)), kind ? h(doc, "span", { class: `chip-kind ${kind}`, title: t(`path.kindTip.${kind}`) }, t(`path.kind.${kind}`)) : "")),
            h(doc, "div", { class: "pright" }, h(doc, "div", { class: "prow" }, levelDots(doc, t, levelOf(item)), stepIcon(doc, t, stepOf(item, goal), isDone, goal), open), mark),
          );
        }),
      ),
    );
  }

  const summary = tags.length > 0 ? t("path.summaryFiltered", { goal: t(`path.goal.${goal}`), done: doneIn(goal), total, shown }) : t("path.summary", { goal: t(`path.goal.${goal}`), done: doneIn(goal), total });
  return h(doc, "div", { class: "path", "data-ui": "path" }, h(doc, "h2", { class: "tag-title" }, t("path.title")), h(doc, "p", { class: "muted" }, total === 0 ? t("path.hint") : summary), ...parts);
}
