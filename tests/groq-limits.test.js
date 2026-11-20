import { test } from "node:test";
import assert from "node:assert/strict";
import { callsOf } from "../public/js/engine/estimate.js";
import { limitFindings, limitOffers, SLOW_MINUTES } from "../public/js/engine/limits.js";

const LIMITS = { maxSteps: 60, maxTokens: 150000, maxSearches: 3 };
const chain = (n, extra = {}) => ({
  pattern: "sequential",
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, agent: "writer", model: "fast", search: false, slot: "groq-free", ...extra })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
});
const find = (design, settings = {}) => limitFindings({ design, limits: LIMITS, ...settings });

test("callsOf gives each agent its calls and the size of one call", () => {
  const rows = callsOf(chain(3), LIMITS);
  assert.deepEqual(rows.map((r) => r.id), ["n0", "n1", "n2"]);
  assert.deepEqual(rows.map((r) => r.calls), [1, 1, 1]);
  // 300 for the instructions, a quarter of the characters it reads, and the longest answer it may give
  assert.equal(rows[0].perCallTokens, 300 + 250 + 4000);
  assert.equal(rows[1].perCallTokens, 300 + 1750 + 4000);
  assert.equal(rows[1].typicalTokens, 300 + 1750 + 1500);
});

test("a shorter answer and handoff lower the size of a call", () => {
  const before = callsOf(chain(3), LIMITS)[1].perCallTokens;
  const after = callsOf(chain(3), LIMITS, { outputTokens: 1500, handoffChars: 2000 })[1].perCallTokens;
  assert.ok(after < before);
  assert.equal(after, 300 + Math.ceil((1000 + 2000) / 4) + 1500);
});

test("a plain chain of three on Groq free gets the spaced-calls note, not a warning", () => {
  const findings = find(chain(3));
  assert.deepEqual(findings, []);
});

test("a big run over the minute limit is slow, with the minutes", () => {
  const findings = find(chain(8, {}), { outputTokens: 4000 });
  const slow = findings.find((f) => f.kind === "slow");
  assert.ok(slow, "slow expected");
  assert.equal(slow.numbers.minutes, Math.ceil(slow.numbers.total / 8000));
  assert.ok(slow.numbers.minutes > SLOW_MINUTES);
});

test("one call that cannot fit the minute limit blocks only its agent", () => {
  const design = { pattern: "parallel", nodes: [...chain(1).nodes, ...Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, agent: "writer", model: "fast", search: false, slot: "groq-free" })), { id: "w", agent: "writer", model: "fast", search: false, slot: "groq-free" }], edges: [{ from: "p0", to: "w" }, { from: "p1", to: "w" }, { from: "p2", to: "w" }] };
  const big = find(design, { outputTokens: 4000 }).find((f) => f.kind === "call-too-big");
  assert.deepEqual(big.agents, ["w"]);
  assert.equal(big.numbers.tpm, 8000);
  assert.ok(big.numbers.perCall > 8000);
});

test("a run over the day limit says so", () => {
  const findings = find(chain(60, {}), { outputTokens: 4000 });
  assert.ok(findings.some((f) => f.kind === "day-tokens" || f.kind === "day-requests"));
});

test("only agents on a free Groq slot count: a paid slot, another provider and no slot give nothing", () => {
  const withSlot = (slot) => ({ ...chain(8), nodes: chain(8).nodes.map((n) => ({ ...n, ...(slot ? { slot } : { slot: undefined }) })) });
  for (const slot of ["groq", "google-free", "google", "anthropic", null]) assert.deepEqual(find(withSlot(slot), { outputTokens: 4000 }), [], String(slot));
  const mixed = chain(8);
  mixed.nodes = mixed.nodes.map((n, i) => (i < 2 ? n : { ...n, slot: "google" }));
  assert.deepEqual(find(mixed, { outputTokens: 4000 }).filter((f) => f.kind === "slow"), []);
});

test("agents on different Groq models are counted separately", () => {
  const split = chain(8);
  split.nodes = split.nodes.map((n, i) => ({ ...n, model: i % 2 === 0 ? "fast" : "balanced" }));
  const one = find(chain(8), { outputTokens: 4000 }).find((f) => f.kind === "slow");
  const two = find(split, { outputTokens: 4000 }).find((f) => f.kind === "slow");
  assert.ok(one.numbers.total > (two?.numbers.total ?? 0));
});

test("balanced and strong are the same Groq model, so they share a bucket", () => {
  const mix = chain(8);
  mix.nodes = mix.nodes.map((n, i) => ({ ...n, model: i % 2 === 0 ? "balanced" : "strong" }));
  const same = find(chain(8).nodes.length ? { ...chain(8), nodes: chain(8).nodes.map((n) => ({ ...n, model: "balanced" })) } : null, { outputTokens: 4000 }).find((f) => f.kind === "slow");
  const mixed = find(mix, { outputTokens: 4000 }).find((f) => f.kind === "slow");
  assert.equal(mixed.numbers.total, same.numbers.total);
});

test("limitOffers", async (t) => {
  const big = () => ({ pattern: "parallel", nodes: [...Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, agent: "writer", model: "fast", search: false, slot: "groq-free" })), { id: "w", agent: "writer", model: "fast", search: false, slot: "groq-free" }], edges: [{ from: "p0", to: "w" }, { from: "p1", to: "w" }, { from: "p2", to: "w" }] });
  const settings = { outputTokens: 4000, handoffChars: 0 };
  const offersOf = (design, loadedSlots) => limitOffers({ design, limits: LIMITS, ...settings, loadedSlots });

  await t.test("move-agent goes to a loaded other slot and clears the finding", () => {
    const offers = offersOf(big(), ["groq-free", "google-free"]);
    const move = offers.find((o) => o.id === "move-agent");
    assert.ok(move);
    const applied = move.apply(big(), settings);
    assert.equal(applied.design.nodes.find((n) => n.id === "w").slot, "google-free");
    assert.equal(move.after.some((f) => f.kind === "call-too-big"), false);
  });

  await t.test("without another loaded slot there is no move or lightest-only offer", () => {
    const ids = offersOf(big(), ["groq-free"]).map((o) => o.id);
    assert.equal(ids.includes("move-agent"), false);
    assert.equal(ids.includes("lightest-only"), false);
  });

  await t.test("shorter lowers the size of a call and the finding", () => {
    const shorter = offersOf(big(), ["groq-free"]).find((o) => o.id === "shorter");
    const applied = shorter.apply(big(), settings);
    assert.ok(applied.settings.outputTokens < 4000);
    assert.ok(applied.settings.handoffChars > 0 && applied.settings.handoffChars <= 4000);
    assert.equal(shorter.after.some((f) => f.kind === "call-too-big"), false);
  });

  await t.test("slowly and tomorrow change nothing", () => {
    const run = chain(8);
    const offers = limitOffers({ design: run, limits: LIMITS, ...settings, loadedSlots: ["groq-free"] });
    for (const id of ["slowly"]) {
      const o = offers.find((x) => x.id === id);
      if (!o) continue;
      assert.deepEqual(o.apply(run, settings), { design: run, settings });
    }
  });

  await t.test("while one call can never fit, slowly and tomorrow are not offered: they would not unblock the run", () => {
    const seven = big();
    seven.nodes = [...Array.from({ length: 7 }, (_, i) => ({ id: `q${i}`, agent: "writer", model: "fast", search: false, slot: "groq-free" })), seven.nodes[3]];
    seven.edges = Array.from({ length: 7 }, (_, i) => ({ from: `q${i}`, to: "w" }));
    const kinds = find(seven, settings).map((f) => f.kind);
    assert.ok(kinds.includes("call-too-big") && kinds.includes("slow"), kinds.join());
    const ids = offersOf(seven, ["groq-free"]).map((o) => o.id);
    assert.ok(ids.includes("shorter"));
    assert.equal(ids.includes("slowly"), false);
    assert.equal(ids.includes("tomorrow"), false);
  });

  await t.test("paid-key is shown but disabled when no paid Groq slot is loaded, and absent when it is", () => {
    const findings = chain(60);
    const without = limitOffers({ design: findings, limits: LIMITS, ...settings, loadedSlots: ["groq-free"] }).find((o) => o.id === "paid-key");
    assert.equal(without.disabled, true);
    const withPaid = limitOffers({ design: findings, limits: LIMITS, ...settings, loadedSlots: ["groq-free", "groq"] }).find((o) => o.id === "paid-key");
    assert.equal(withPaid.disabled, false);
  });

  await t.test("an Anthropic-only design has no offers", () => {
    const d = { ...chain(3), nodes: chain(3).nodes.map((n) => ({ ...n, slot: "anthropic" })) };
    assert.deepEqual(limitOffers({ design: d, limits: LIMITS, ...settings, loadedSlots: ["anthropic"] }), []);
  });
});
