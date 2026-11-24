import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptTitle, hoverInfoOf, splitTitle } from "../public/js/hover.js";

const el = (attrs = {}, text = "") => {
  const a = { ...attrs };
  return { textContent: text, getAttribute: (k) => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, removeAttribute: (k) => { delete a[k]; }, a };
};

test("splitTitle makes a title and a text from Name: what it does, and keeps short and long texts whole", () => {
  assert.deepEqual(splitTitle("Share: sends the run to the library"), { title: "Share", text: "sends the run to the library" });
  assert.deepEqual(splitTitle("Delete"), { title: "Delete" });
  assert.deepEqual(splitTitle("This is a long sentence with no colon that explains what the button does"), { text: "This is a long sentence with no colon that explains what the button does" });
  assert.deepEqual(splitTitle("  "), { title: "" });
});

test("a native title is adopted: the card text is kept, the browser tooltip is removed and an icon button keeps its name", () => {
  const button = el({ title: "Export: saves the run as a file" });
  adoptTitle(button);
  assert.equal(button.a.title, undefined);
  assert.equal(button.a["data-hover-title"], "Export");
  assert.equal(button.a["data-hover-text"], "saves the run as a file");
  assert.equal(button.a["aria-label"], "Export: saves the run as a file");
  const labelled = el({ title: "Close", "aria-label": "Close dialog" });
  adoptTitle(labelled);
  assert.equal(labelled.a["aria-label"], "Close dialog");
  const worded = el({ title: "Load" }, "Load");
  adoptTitle(worded);
  assert.equal(worded.a["aria-label"], undefined);
  const own = el({ title: "Other", "data-hover-title": "Mine" });
  adoptTitle(own);
  assert.equal(own.a["data-hover-title"], "Mine");
});

test("hoverInfoOf reads the data-hover attributes, ignores a broken row list and returns null for an element with nothing to say", () => {
  const info = hoverInfoOf(el({ "data-hover-title": "Writer", "data-hover-badge": "Agent 2 of 2", "data-hover-text": "Writes it.", "data-hover-hint": "Click", "data-hover-rows": JSON.stringify([["Model", "Fast"], ["bad"]]) }));
  assert.deepEqual(info, { title: "Writer", badge: "Agent 2 of 2", text: "Writes it.", hint: "Click", rows: [["Model", "Fast"]] });
  assert.deepEqual(hoverInfoOf(el({ "data-hover-title": "X", "data-hover-rows": "{nope" })).rows, undefined);
  assert.equal(hoverInfoOf(el({})), null);
});
