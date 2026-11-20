import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryActions, listKey } from "../public/js/library-keys.js";

const ev = (key) => {
  const e = { key, prevented: false, preventDefault() { e.prevented = true; } };
  return e;
};
const ids = ["a", "b", "c"];
function listSetup(at) {
  const log = [];
  const opts = { ids, at, selectAt: (i) => log.push(["select", ids[i]]), tickAt: (i) => log.push(["tick", ids[i]]), loadAt: (i) => log.push(["load", ids[i]]), switchTab: () => log.push(["switch"]), leave: () => log.push(["leave"]) };
  return { opts, log };
}

test("Down and Up move the selection by one card and stop at the ends, and the detail follows through selectAt", () => {
  const { opts, log } = listSetup(0);
  assert.equal(listKey(ev("ArrowDown"), opts), true);
  assert.equal(listKey(ev("ArrowUp"), opts), true);
  const end = listSetup(2);
  listKey(ev("ArrowDown"), end.opts);
  assert.deepEqual(log, [["select", "b"], ["select", "a"]]);
  assert.deepEqual(end.log, [["select", "c"]]);
});

test("with no card focused Down goes to the first card", () => {
  const { opts, log } = listSetup(-1);
  listKey(ev("ArrowDown"), opts);
  assert.deepEqual(log, [["select", "a"]]);
});

test("Space ticks the focused card, Enter loads it, Left and Right switch the lists, Escape leaves, and the default action is stopped", () => {
  const { opts, log } = listSetup(1);
  const space = ev(" ");
  assert.equal(listKey(space, opts), true);
  assert.equal(space.prevented, true);
  listKey(ev("Enter"), opts);
  listKey(ev("ArrowLeft"), opts);
  listKey(ev("ArrowRight"), opts);
  listKey(ev("Escape"), opts);
  assert.deepEqual(log, [["tick", "b"], ["load", "b"], ["switch"], ["switch"], ["leave"]]);
});

test("Space and Enter with no card focused, an empty list and other keys are left alone", () => {
  const { opts, log } = listSetup(-1);
  assert.equal(listKey(ev(" "), opts), false);
  assert.equal(listKey(ev("Enter"), opts), false);
  assert.equal(listKey(ev("x"), opts), false);
  assert.equal(listKey(ev("ArrowDown"), { ...opts, ids: [] }), false);
  assert.deepEqual(log, []);
});

function actionsSetup(over = {}) {
  const log = [];
  const state = {
    selectedId: () => "g1",
    isOwn: (id) => id === "m1",
    hasDefinition: () => true,
    ticked: () => [],
    mineIds: () => [],
    load: (id) => log.push(["load", id]),
    compare: () => log.push(["compare"]),
    exportRuns: (list) => log.push(["export", list]),
    useInCreate: (id) => log.push(["use", id]),
    editDescription: (id) => log.push(["edit", id]),
    remove: (id) => log.push(["remove", id]),
    ...over,
  };
  return { actions: libraryActions(state), log };
}

test("Delete on a library card does nothing and says so, on your own card it deletes", () => {
  const gallery = actionsSetup();
  assert.equal(gallery.actions.remove(), false);
  assert.deepEqual(gallery.log, []);
  const own = actionsSetup({ selectedId: () => "m1" });
  assert.equal(own.actions.remove(), true);
  assert.deepEqual(own.log, [["remove", "m1"]]);
});

test("compare needs two ticked runs, export needs a ticked run, export all needs a run of your own", () => {
  const none = actionsSetup();
  assert.equal(none.actions.compare(), false);
  assert.equal(none.actions.exportTicked(), false);
  assert.equal(none.actions.exportAllMine(), false);
  const one = actionsSetup({ ticked: () => ["a"], mineIds: () => ["m1", "m2"] });
  assert.equal(one.actions.compare(), false);
  assert.equal(one.actions.exportTicked(), true);
  assert.equal(one.actions.exportAllMine(), true);
  const two = actionsSetup({ ticked: () => ["a", "b"] });
  assert.equal(two.actions.compare(), true);
  assert.deepEqual(two.log, [["compare"]]);
  assert.deepEqual(one.log, [["export", ["a"]], ["export", ["m1", "m2"]]]);
});

test("load, use in Create and edit description need a chosen run; use needs a definition; edit needs your own run", () => {
  const none = actionsSetup({ selectedId: () => null });
  assert.equal(none.actions.load(), false);
  assert.equal(none.actions.useInCreate(), false);
  assert.equal(none.actions.editDescription(), false);
  const noDef = actionsSetup({ hasDefinition: () => false });
  assert.equal(noDef.actions.useInCreate(), false);
  const gallery = actionsSetup();
  assert.equal(gallery.actions.editDescription(), false);
  assert.equal(gallery.actions.load(), true);
  assert.equal(gallery.actions.useInCreate(), true);
  const own = actionsSetup({ selectedId: () => "m1" });
  assert.equal(own.actions.editDescription(), true);
  assert.deepEqual(gallery.log, [["load", "g1"], ["use", "g1"]]);
});
