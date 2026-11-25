// The parts of the skills screens that Settings and the agent settings share: the name of a skill as people read it, the choice of skills
// (a role, a procedure and styles, with a culture where a skill has one) and the composed text a model gets. Builds DOM, keeps no state:
// the caller holds the choice and is told when it changes.
import { h } from "./dom.js";
import { CULTURE_IDS } from "./skill-library.js";
import { SKILLS_MAX } from "./engine/skills.js";

// The name of a skill: an app skill has its name in the locale file, a skill of a student has its own.
export const skillName = (t, lib, skill) => (lib.isApp(skill) ? t(`skills.app.${skill.id}.name`) : skill.name);

// A rough count of the tokens of a text (a token is about four characters; other scripts take more). Only for the "about N tokens" shown.
export function approxTokens(text) {
  let n = 0;
  for (const ch of String(text)) n += ch.charCodeAt(0) < 128 ? 0.25 : 1.1;
  return Math.round(n);
}

function segmentLabel(t, lib, seg, skill) {
  if (seg.type === "app") return t("skills.seg.app", { name: skillName(t, lib, lib.get(seg.id) ?? skill), version: seg.version });
  if (seg.type === "culture") return t("skills.seg.culture", { value: t(`skills.culture.${seg.value}`) });
  return t("skills.seg.user", { name: seg.name });
}

// The composed text of the chosen skills as parts, each with where it comes from, and the token estimate.
// extra: entries of skills that are not in this library (a shared definition), shown as they are.
export function composedView({ doc, t, lib, selection, extra = [] }) {
  const parts = [];
  const ids = [selection.role, selection.postup, ...selection.styles].filter(Boolean);
  for (const id of ids) {
    const skill = lib.get(id);
    if (!skill) continue;
    for (const seg of lib.segments(skill, selection.params?.[id])) parts.push({ cls: seg.type, label: segmentLabel(t, lib, seg, skill), text: seg.text });
  }
  for (const entry of extra) parts.push({ cls: "user", label: t("skills.seg.shared", { name: entry.name }), text: entry.text });
  if (parts.length === 0) return h(doc, "p", { class: "hint", "data-ui": "skills-none" }, t("skills.noneChosen"));
  const tokens = approxTokens(parts.map((p) => p.text).join(" "));
  return h(
    doc,
    "div",
    { class: "skills-composed", "data-ui": "skills-composed" },
    ...parts.map((p) => h(doc, "div", { class: `skill-seg seg-${p.cls}` }, h(doc, "small", {}, p.label), h(doc, "span", {}, p.text))),
    h(doc, "p", { class: "hint", "data-ui": "skills-tokens" }, t("skills.tokens", { n: tokens })),
  );
}

// The choice of skills. selection: { role, postup, styles, params } of skill ids; onChange(selection, extra) is called with the new choice.
export function pickerView({ doc, t, lib, selection, extra = [], onChange, idPrefix = "sk" }) {
  const sel = { role: selection.role, postup: selection.postup, styles: [...selection.styles], params: { ...selection.params } };
  let rest = [...extra];
  const total = () => (sel.role ? 1 : 0) + (sel.postup ? 1 : 0) + sel.styles.length + rest.length;
  const fire = () => onChange({ role: sel.role, postup: sel.postup, styles: [...sel.styles], params: { ...sel.params } }, [...rest]);
  const optionFor = (skill) => `${skillName(t, lib, skill)}${lib.isApp(skill) ? ` (${t("skills.appTag")})` : ""}`;
  const kindSelect = (kind, key) => {
    const select = h(doc, "select", { id: `${idPrefix}-${key}`, "data-ui": `skills-${key}` }, h(doc, "option", { value: "" }, t("skills.none")), ...lib.all().filter((s) => s.kind === kind).map((s) => h(doc, "option", { value: s.id, selected: s.id === sel[key] }, optionFor(s))));
    select.addEventListener("change", () => {
      sel[key] = select.value;
      fire();
    });
    return h(doc, "div", { class: "field" }, h(doc, "label", { for: `${idPrefix}-${key}` }, t(`skills.pick.${key}`), " ", h(doc, "span", { class: "hint" }, t(`skills.pickHint.${key}`))), select);
  };
  const styles = lib.all().filter((s) => s.kind === "styl");
  const styleBoxes = styles.map((s) => {
    const on = sel.styles.includes(s.id);
    const box = h(doc, "input", { type: "checkbox", id: `${idPrefix}-style-${s.id}`, checked: on, disabled: !on && total() >= SKILLS_MAX, "data-ui": `skills-style-${s.id}` });
    box.addEventListener("change", () => {
      sel.styles = box.checked ? [...new Set([...sel.styles, s.id])] : sel.styles.filter((x) => x !== s.id);
      fire();
    });
    return h(doc, "div", { class: "field checkbox" }, box, h(doc, "label", { for: `${idPrefix}-style-${s.id}` }, optionFor(s)));
  });
  const cultures = [sel.role, sel.postup, ...sel.styles]
    .filter(Boolean)
    .map((id) => lib.get(id))
    .filter((s) => s && lib.hasCulture(s))
    .map((s) => {
      const select = h(doc, "select", { id: `${idPrefix}-culture-${s.id}`, "data-ui": `skills-culture-${s.id}` }, ...CULTURE_IDS.map((c) => h(doc, "option", { value: c, selected: c === (sel.params[s.id] ?? lib.cultureOf(s)) }, t(`skills.culture.${c}`))));
      select.addEventListener("change", () => {
        sel.params[s.id] = select.value;
        fire();
      });
      return h(doc, "div", { class: "field" }, h(doc, "label", { for: `${idPrefix}-culture-${s.id}` }, t("skills.culture.for", { name: skillName(t, lib, s) })), select);
    });
  const extras = rest.map((entry, i) => {
    const remove = h(doc, "button", { type: "button", "data-ui": `skills-extra-remove-${i}` }, t("skills.extraRemove"));
    remove.addEventListener("click", () => {
      rest = rest.filter((_, j) => j !== i);
      fire();
    });
    return h(doc, "div", { class: "skill-extra" }, h(doc, "span", {}, t("skills.extra", { name: entry.name, kind: t(`skills.kind.${entry.kind}`) })), remove);
  });
  return h(
    doc,
    "div",
    { class: "skills-picker", "data-ui": "skills-picker" },
    kindSelect("role", "role"),
    kindSelect("postup", "postup"),
    h(doc, "div", { class: "skills-styles" }, h(doc, "div", { class: "hint" }, t("skills.pick.styles"), " ", t("skills.pickHint.styles")), ...styleBoxes),
    ...cultures,
    ...extras,
    ...(total() >= SKILLS_MAX ? [h(doc, "p", { class: "hint", "data-ui": "skills-full" }, t("skills.full", { max: SKILLS_MAX }))] : []),
  );
}
