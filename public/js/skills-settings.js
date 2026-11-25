// Settings > Skills: the library of skills (the skills of the app and the skills a student made) and the default skills of each agent type.
// Skills are chosen for an agent on the Create page; here they are made and managed.
import { h } from "./dom.js";
import { AGENT_TYPES } from "./engine/catalog.js";
import { mayFormat } from "./engine/format.js";
import { SKILL_KINDS, SKILL_NAME_MAX, SKILL_TEXT_MAX } from "./engine/skills.js";
import { CULTURE_IDS, DEPTH_MAX, FOLDER_MAX, APP_SKILLS, selectionEntries, selectionOf } from "./skill-library.js";
import { skillName, pickerView, composedView, approxTokens } from "./skills-picker.js";

const KIND_FILTERS = ["all", ...SKILL_KINDS];
// The agent types that may have skills: those whose reply is free text in some pattern (see engine/skills.js and create/editor-view.js).
export const SKILL_AGENT_TYPES = Object.keys(AGENT_TYPES).filter((a) => AGENT_TYPES[a].patterns.some((p) => mayFormat(a, p)));

export function renderSkillsSettings({ doc, t, store }) {
  let tab = "library";
  let filter = "all";
  let selected = "critic";
  let draft = null;
  let message = "";
  const host = h(doc, "div", { class: "skills-body", "data-ui": "skills-body" });
  const root = h(doc, "div", { class: "skills-settings", "data-ui": "skills-settings" }, host);

  const draw = () => host.replaceChildren(...(tab === "defaults" ? defaultsView() : libraryView()));
  const subTabs = () =>
    h(doc, "div", { class: "ptabs", role: "tablist", "data-ui": "skills-tabs" }, ...["library", "defaults"].map((id) => {
      const b = h(doc, "button", { type: "button", class: "ptab", role: "tab", "aria-selected": String(tab === id), "data-ui": `skills-tab-${id}` }, t(`skills.tab.${id}`));
      b.addEventListener("click", () => {
        tab = id;
        draft = null;
        message = "";
        draw();
      });
      return b;
    }));

  // ---- the library
  function libraryView() {
    const lib = store.library();
    const all = lib.all();
    if (filter !== "all" && lib.get(selected) && lib.get(selected).kind !== filter) filter = lib.get(selected).kind;
    const current = lib.get(selected) ?? all[0];
    selected = current.id;
    const count = (k) => (k === "all" ? all.length : all.filter((s) => s.kind === k).length);

    const create = SKILL_KINDS.map((kind) => {
      const b = h(doc, "button", { type: "button", class: "primary", "data-ui": `skills-new-${kind}` }, t(`skills.new.${kind}`));
      b.addEventListener("click", () => makeSkill({ kind }));
      return b;
    });
    const legend = h(doc, "details", { class: "skills-legend", "data-ui": "skills-legend" }, h(doc, "summary", {}, t("skills.legend.title")), h(doc, "p", { class: "hint" }, t("skills.legend.intro")), ...SKILL_KINDS.map((k) => h(doc, "p", {}, h(doc, "b", {}, t(`skills.kind.${k}`)), ": ", t(`skills.legend.${k}`))), h(doc, "p", { class: "hint" }, t("skills.legend.example")));
    const filters = h(doc, "div", { class: "skill-filters", role: "group", "aria-label": t("skills.filter") }, ...KIND_FILTERS.map((k) => {
      const b = h(doc, "button", { type: "button", "aria-pressed": String(filter === k), "data-ui": `skills-filter-${k}` }, `${t(`skills.filter.${k}`)} ${count(k)}`);
      b.addEventListener("click", () => {
        filter = k;
        draft = null;
        message = "";
        const first = k === "all" ? current : all.find((s) => s.kind === k);
        if (first) selected = first.id;
        draw();
      });
      return b;
    }));
    const list = h(doc, "div", { class: "skill-list", "data-ui": "skills-list" });
    const ok = (s) => filter === "all" || s.kind === filter;
    const apps = APP_SKILLS.filter(ok);
    if (apps.length > 0) list.append(h(doc, "h4", { class: "skill-folder" }, t("skills.group.app")), ...apps.map((s) => item(lib, s, 0)));
    const mine = lib.users().filter(ok);
    const folders = [...new Set(mine.map((u) => u.folder))].sort();
    for (const f of folders) list.append(h(doc, "h4", { class: "skill-folder" }, f ? t("skills.group.mineIn", { folder: f }) : t("skills.group.mine")), ...mine.filter((u) => u.folder === f).map((s) => item(lib, s, Math.min(2, lib.depth(s) - 1))));
    if (apps.length === 0 && mine.length === 0) list.append(h(doc, "p", { class: "hint" }, t("skills.listEmpty")));
    return [
      subTabs(),
      h(doc, "p", {}, t("skills.intro")),
      h(doc, "div", { class: "skill-create" }, ...create),
      legend,
      filters,
      ...(message ? [h(doc, "p", { class: "notice", role: "status", "data-ui": "skills-message" }, message)] : []),
      h(doc, "div", { class: "skills-layout" }, list, h(doc, "div", { class: "skill-editor", "data-ui": "skills-editor" }, ...(lib.isApp(current) ? appView(lib, current) : userView(lib, current)))),
    ];
  }

  function item(lib, skill, level) {
    const b = h(doc, "button", { type: "button", class: `skill-item level-${level}`, "aria-pressed": String(skill.id === selected), "data-ui": `skill-item-${skill.id}` }, h(doc, "span", { class: "skill-item-name" }, skillName(t, lib, skill)), ...(!lib.isApp(skill) && lib.parentChanged(skill) ? [h(doc, "span", { class: "skill-chip warn", title: t("skills.parentChangedShort") }, "!")] : []), h(doc, "span", { class: `skill-chip kind-${skill.kind}`, title: t(`skills.kindHelp.${skill.kind}`) }, t(`skills.kind.${skill.kind}`)));
    b.addEventListener("click", () => {
      selected = skill.id;
      draft = null;
      message = "";
      draw();
    });
    return b;
  }

  const usageOf = (id) => {
    const defaults = store.defaults();
    return SKILL_AGENT_TYPES.filter((a) => [defaults[a]?.role, defaults[a]?.postup, ...(defaults[a]?.styles ?? [])].includes(id));
  };
  const usageChip = (id) => {
    const used = usageOf(id);
    return h(doc, "span", { class: "skill-chip", "data-ui": "skill-usage" }, used.length > 0 ? t("skills.usedBy", { agents: used.map((a) => t(`agent.${a}.label`)).join(", ") }) : t("skills.usedByNone"));
  };

  function makeSkill(base) {
    const lib = store.library();
    const parent = base.parent ? lib.get(base.parent) : undefined;
    const kind = base.kind ?? parent?.kind ?? "styl";
    const name = parent ? t("skills.extendedName", { name: skillName(t, lib, parent) }).slice(0, SKILL_NAME_MAX) : t(`skills.newName.${kind}`);
    const saved = store.add({ name, kind, folder: base.folder ?? "", parent: parent ? parent.id : "", ...(parent && lib.isApp(parent) ? { parentVersion: parent.cur } : {}), ...(parent && lib.hasCulture(parent) ? { param: lib.cultureOf(parent) } : {}), text: "" });
    if (!saved) {
      message = t("skills.createFailed");
    } else {
      selected = saved.id;
      filter = saved.kind;
      message = "";
    }
    draft = null;
    draw();
  }

  function appView(lib, skill) {
    const sel = { role: "", postup: "", styles: [], params: {} };
    if (skill.kind === "role") sel.role = skill.id;
    else if (skill.kind === "postup") sel.postup = skill.id;
    else sel.styles = [skill.id];
    const extend = h(doc, "button", { type: "button", class: "primary", "data-ui": "skill-extend" }, t("skills.extend"));
    extend.addEventListener("click", () => makeSkill({ parent: skill.id }));
    return [
      h(doc, "h3", {}, skillName(t, lib, skill), " ", h(doc, "span", { class: `skill-chip kind-${skill.kind}` }, t(`skills.kind.${skill.kind}`)), " ", h(doc, "span", { class: "skill-chip" }, t("skills.appVersion", { v: skill.cur }))),
      h(doc, "p", { class: "hint" }, t(`skills.app.${skill.id}.help`)),
      h(doc, "p", { class: "hint" }, t("skills.appReadonly")),
      ...(skill.culture ? [h(doc, "p", { class: "hint" }, t("skills.cultureList", { list: CULTURE_IDS.map((c) => t(`skills.culture.${c}`)).join(", ") })), h(doc, "p", { class: "hint" }, t("skills.cultureNote"))] : []),
      h(doc, "h4", {}, t("skills.composedHeading")),
      composedView({ doc, t, lib, selection: sel }),
      h(doc, "div", { class: "skill-actions" }, extend, usageChip(skill.id)),
    ];
  }

  function userView(lib, skill) {
    if (!draft || draft.id !== skill.id) draft = { ...skill };
    const d = draft;
    const parent = d.parent ? lib.get(d.parent) : undefined;
    const draftLib = () => store.libraryWith(d);
    const preview = h(doc, "div", { class: "skill-preview", "data-ui": "skill-preview" });
    const paintPreview = () => {
      const dl = draftLib();
      const sel = { role: "", postup: "", styles: [], params: {} };
      const me = dl.get(d.id);
      if (me) {
        if (me.kind === "role") sel.role = me.id;
        else if (me.kind === "postup") sel.postup = me.id;
        else sel.styles = [me.id];
        if (me.param) sel.params[me.id] = me.param;
      }
      preview.replaceChildren(composedView({ doc, t, lib: dl, selection: sel }));
    };

    const name = h(doc, "input", { id: "skill-name", type: "text", maxlength: SKILL_NAME_MAX, value: d.name, "data-ui": "skill-name" });
    name.addEventListener("input", () => {
      d.name = name.value;
    });
    const kindHelp = h(doc, "p", { class: "hint", "data-ui": "skill-kind-help" }, t(`skills.kindHelp.${d.kind}`));
    const kind = h(doc, "select", { id: "skill-kind", "data-ui": "skill-kind" }, ...SKILL_KINDS.map((k) => h(doc, "option", { value: k, selected: k === d.kind }, `${t(`skills.kind.${k}`)}: ${t(`skills.kindShort.${k}`)}`)));
    kind.addEventListener("change", () => {
      d.kind = kind.value;
      kindHelp.textContent = t(`skills.kindHelp.${d.kind}`);
      text.placeholder = t(`skills.example.${d.kind}`);
    });
    const folders = [...new Set(lib.users().map((u) => u.folder).filter(Boolean))];
    const folder = h(doc, "input", { id: "skill-folder", type: "text", list: "skill-folders", maxlength: FOLDER_MAX, value: d.folder, placeholder: t("skills.folderPlaceholder"), "data-ui": "skill-folder" });
    folder.addEventListener("input", () => {
      d.folder = folder.value;
    });
    const parentSelect = h(doc, "select", { id: "skill-parent", "data-ui": "skill-parent" }, h(doc, "option", { value: "" }, t("skills.parentNone")), ...lib.parentOptions(skill).map((p) => h(doc, "option", { value: p.id, selected: p.id === d.parent }, `${lib.isApp(p) ? `${t("skills.appTag")}: ` : ""}${skillName(t, lib, p)}`)));
    parentSelect.addEventListener("change", () => {
      d.parent = parentSelect.value;
      const p = d.parent ? lib.get(d.parent) : undefined;
      if (p && lib.isApp(p)) d.parentVersion = p.cur;
      else delete d.parentVersion;
      const probe = store.libraryWith(d);
      if (p && probe.hasCulture(probe.get(d.id))) d.param = d.param ?? probe.cultureOf(p);
      else delete d.param;
      drawEditorOnly();
    });
    const cultureField = (() => {
      const probe = store.libraryWith(d);
      const me = probe.get(d.id);
      if (!me || !probe.hasCulture(me)) return "";
      const select = h(doc, "select", { id: "skill-culture", "data-ui": "skill-culture" }, ...CULTURE_IDS.map((c) => h(doc, "option", { value: c, selected: c === (d.param ?? probe.cultureOf(me)) }, t(`skills.culture.${c}`))));
      select.addEventListener("change", () => {
        d.param = select.value;
        paintPreview();
      });
      return h(doc, "div", { class: "field" }, h(doc, "label", { for: "skill-culture" }, t("skills.culture.label")), select);
    })();
    const text = h(doc, "textarea", { id: "skill-text", rows: 6, maxlength: SKILL_TEXT_MAX, placeholder: t(`skills.example.${d.kind}`), "data-ui": "skill-text" });
    text.value = d.text;
    text.addEventListener("input", () => {
      d.text = text.value;
      paintPreview();
      counter.textContent = t("skills.textCount", { n: text.value.length, max: SKILL_TEXT_MAX });
    });
    const counter = h(doc, "p", { class: "hint" }, t("skills.textCount", { n: d.text.length, max: SKILL_TEXT_MAX }));

    // A newer version of the app skill this one extends: the student decides when to move to it.
    const banner = [];
    if (parent && lib.isApp(parent) && Number.isInteger(skill.parentVersion) && skill.parentVersion !== parent.cur) {
      const box = h(doc, "div", { class: "notice skill-parent-changed", "data-ui": "skill-parent-changed" }, h(doc, "b", {}, t("skills.parentChanged", { name: skillName(t, lib, parent), from: skill.parentVersion, to: parent.cur })), " ", t("skills.parentChangedBody", { v: skill.parentVersion }));
      const diffHost = h(doc, "div", {});
      const show = h(doc, "button", { type: "button", "data-ui": "skill-parent-diff" }, t("skills.showDiff"));
      show.addEventListener("click", () => {
        diffHost.replaceChildren(h(doc, "div", { class: "skill-diff" }, h(doc, "pre", {}, `v${skill.parentVersion}\n${parent.versions[skill.parentVersion] ?? ""}`), h(doc, "pre", {}, `v${parent.cur}\n${parent.versions[parent.cur]}`)));
      });
      const accept = h(doc, "button", { type: "button", class: "primary", "data-ui": "skill-parent-accept" }, t("skills.accept", { v: parent.cur }));
      accept.addEventListener("click", () => {
        store.update({ ...skill, parentVersion: parent.cur });
        draft = null;
        message = t("skills.accepted", { v: parent.cur });
        draw();
      });
      box.append(h(doc, "div", { class: "skill-actions" }, show, accept), diffHost);
      banner.push(box);
    }

    const save = h(doc, "button", { type: "button", class: "primary", "data-ui": "skill-save" }, t("skills.save"));
    save.addEventListener("click", () => {
      if (d.name.trim() === "") {
        message = t("skills.nameNeeded");
        draw();
        return;
      }
      const saved = store.update(d);
      message = saved ? t("skills.saved") : t("skills.saveFailed");
      draft = null;
      draw();
    });
    const extend = h(doc, "button", { type: "button", "data-ui": "skill-extend" }, t("skills.extendThis"));
    extend.addEventListener("click", () => makeSkill({ parent: skill.id }));
    const remove = h(doc, "button", { type: "button", class: "danger", "data-ui": "skill-delete" }, t("skills.delete"));
    remove.addEventListener("click", () => {
      if (lib.children(skill.id).length > 0) {
        message = t("skills.deleteHasChildren", { n: lib.children(skill.id).length });
        draw();
        return;
      }
      if (!doc.defaultView.confirm(t("skills.deleteConfirm", { name: skill.name }))) return;
      store.remove(skill.id);
      selected = "critic";
      filter = "all";
      draft = null;
      message = t("skills.deleted");
      draw();
    });
    const drawEditorOnly = () => {
      const keep = { ...d };
      draft = keep;
      draw();
    };
    const out = [
      h(doc, "h3", {}, t("skills.mineHeading")),
      ...banner,
      h(doc, "div", { class: "field" }, h(doc, "label", { for: "skill-name" }, t("skills.name")), name),
      h(doc, "div", { class: "field" }, h(doc, "label", { for: "skill-kind" }, t("skills.kind")), kind, kindHelp),
      h(doc, "div", { class: "field" }, h(doc, "label", { for: "skill-folder" }, t("skills.folder")), folder, h(doc, "datalist", { id: "skill-folders" }, ...folders.map((f) => h(doc, "option", { value: f })))),
      h(doc, "div", { class: "field" }, h(doc, "label", { for: "skill-parent" }, t("skills.parent", { max: DEPTH_MAX })), parentSelect),
      ...(cultureField ? [cultureField] : []),
      h(doc, "div", { class: "field" }, h(doc, "label", { for: "skill-text" }, t("skills.text")), text, counter),
      h(doc, "h4", {}, t("skills.composedHeading")),
      preview,
      h(doc, "div", { class: "skill-actions" }, save, extend, remove, usageChip(skill.id)),
    ];
    paintPreview();
    return out;
  }

  // ---- the default skills of each agent type
  function defaultsView() {
    const lib = store.library();
    const defaults = store.defaults();
    return [
      subTabs(),
      h(doc, "p", {}, t("skills.defaults.intro")),
      h(doc, "div", { class: "skill-defaults", "data-ui": "skills-defaults" }, ...SKILL_AGENT_TYPES.map((type) => {
        const { selection, extra } = selectionOf(lib, selectionEntries(lib, defaults[type]));
        const card = h(doc, "div", { class: "skill-default-card", "data-ui": `skills-default-${type}` });
        const paint = (sel) => {
          card.replaceChildren(
            h(doc, "h3", {}, t(`agent.${type}.label`)),
            h(doc, "p", { class: "hint" }, t(`agent.${type}.help`)),
            pickerView({ doc, t, lib: store.library(), selection: sel, extra, idPrefix: `sk-def-${type}`, onChange: (next) => {
              store.setDefaults(type, next);
              paint(next);
            } }),
            h(doc, "p", { class: "hint", "data-ui": `skills-default-tokens-${type}` }, t("skills.tokens", { n: approxTokens(selectionEntries(store.library(), sel).map((e) => e.text).join(" ")) })),
          );
        };
        paint(selection);
        return card;
      })),
    ];
  }

  draw();
  return root;
}
