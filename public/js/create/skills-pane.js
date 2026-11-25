// The tab Skills in the settings of one agent: which skills it has (a role, a procedure, styles), starting from the defaults of its agent type.
// Skills are made and managed in Settings; here they are only chosen. What the agent carries is a snapshot (see engine/skills.js).
import { h } from "../dom.js";
import { helpIcon } from "../help-popup.js";
import { cleanSkills } from "../engine/skills.js";
import { refreshEntries, selectionEntries, selectionOf } from "../skill-library.js";
import { pickerView, composedView } from "../skills-picker.js";

const same = (a, b) => JSON.stringify((a ?? []).map((e) => [e.id ?? e.name, e.kind, e.param ?? ""])) === JSON.stringify((b ?? []).map((e) => [e.id ?? e.name, e.kind, e.param ?? ""]));

// node: the agent; lib: the library now; startEntries: the entries a new agent of this type starts with;
// onSet(entries | null): the agent has these skills now (null: none).
export function skillsPane({ doc, t, node, lib, startEntries, onSet }) {
  const entries = refreshEntries(lib, node.skills);
  const { selection, extra } = selectionOf(lib, entries);
  const isDefault = same(entries, startEntries);
  const status = h(doc, "p", { class: "hint skills-status", "data-ui": "skills-status" }, isDefault ? t("skills.status.default") : t("skills.status.changed"));
  const back = h(doc, "button", { type: "button", "data-ui": "skills-reset", hidden: isDefault }, t("skills.reset"));
  back.addEventListener("click", () => onSet(startEntries.length > 0 ? startEntries : null));
  const picker = pickerView({
    doc,
    t,
    lib,
    selection,
    extra,
    idPrefix: `ed-skills-${node.id}`,
    onChange: (next, rest) => onSet(cleanSkills([...selectionEntries(lib, next), ...rest])),
  });
  return [
    h(doc, "p", { class: "hint" }, t("skills.paneIntro"), " ", h(doc, "a", { href: "#/settings/skills", "data-ui": "skills-manage" }, t("skills.manage")), " ", helpIcon({ doc, t, id: "create-skills", name: t("skills.heading") })),
    h(doc, "div", { class: "skills-status-row" }, status, back),
    picker,
    h(doc, "h4", {}, t("skills.composedHeading")),
    composedView({ doc, t, lib, selection, extra }),
  ];
}
