// The Harness lab page: pick a recorded run, set limits, see where the run would stop. No provider is called.
import { h } from "./dom.js";
import { getJson, setTitle } from "./pages.js";
import { labSteps, labTotals, labRanges, simulate } from "./harness-lab-model.js";
import { REPEAT_STOP } from "./engine/catalog.js";

const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

// params: { run, steps, tokens, repeat } from the address; a run of the visitor's own is added to the list and chosen, with the limits preset.
export async function renderLab(ctx, params = {}) {
  const { doc, t } = ctx;
  setTitle(ctx, t("lab.title"));
  const root = h(doc, "div", { class: "lab", "data-ui": "harness-lab" });
  ctx.main.replaceChildren(root);

  let index = [];
  try {
    index = (await getJson(ctx, "/runs/index.json")).runs ?? [];
  } catch {
    index = [];
  }
  if (ctx.isStale()) return;
  if (index.length === 0) {
    root.replaceChildren(h(doc, "h1", {}, t("lab.title")), h(doc, "p", { class: "notice", role: "alert" }, t("lab.loadFailed")));
    return;
  }

  const cache = new Map();
  // A run of the visitor's own (kept in this browser), when the address names one.
  let own = null;
  if (params.run && !index.some((r) => r.id === params.run)) {
    try {
      own = (await ctx.runStore?.get(params.run)) ?? null;
    } catch {
      own = null;
    }
    if (ctx.isStale()) return;
    if (own) cache.set(own.id, labSteps(own));
  }
  const loadSteps = async (id) => {
    if (!cache.has(id)) cache.set(id, labSteps(await getJson(ctx, `/runs/${id}.json`)));
    return cache.get(id);
  };

  const runSelect = h(doc, "select", { id: "lab-run", "data-ui": "lab-run" });
  if (own) runSelect.append(h(doc, "option", { value: own.id }, t("lab.yourRun", { title: clip(String(own.title ?? own.task ?? own.id).split(/\r?\n/)[0], 60) })));
  for (const r of index) runSelect.append(h(doc, "option", { value: r.id }, `${t(`pattern.${r.pattern}`)}: ${clip(r.title, 60)}`));
  const runInfo = h(doc, "p", { class: "hint", "data-ui": "lab-run-info" });

  const slider = (id, label) => {
    const input = h(doc, "input", { id: `lab-${id}`, type: "range", "data-ui": `lab-${id}` });
    const value = h(doc, "b", { class: "lab-value", "data-ui": `lab-${id}-value` });
    return { input, value, row: h(doc, "div", { class: "lab-row" }, h(doc, "label", { for: `lab-${id}` }, label), input, value) };
  };
  const stepsSlider = slider("steps", t("lab.steps"));
  const tokensSlider = slider("tokens", t("lab.tokens"));
  const timeSlider = slider("time", t("lab.time"));
  const repeatSelect = h(doc, "select", { id: "lab-repeat", "data-ui": "lab-repeat" }, h(doc, "option", { value: "0" }, t("lab.repeatOff")), ...[2, 3, 4].map((n) => h(doc, "option", { value: String(n), selected: n === REPEAT_STOP.default }, t("lab.repeatTimes", { n }))));

  const stepList = h(doc, "div", { class: "lab-steps", "data-ui": "lab-steps" });
  const tokenBar = h(doc, "i", {});
  const timeBar = h(doc, "i", {});
  const tokenText = h(doc, "b", { class: "lab-value" });
  const timeText = h(doc, "b", { class: "lab-value" });
  const verdict = h(doc, "p", { class: "lab-verdict", "data-ui": "lab-verdict", role: "status", "aria-live": "polite" });
  const meter = (label, bar, text) => h(doc, "div", { class: "lab-row" }, h(doc, "span", { class: "lab-label" }, label), h(doc, "div", { class: "lab-bar" }, bar), text);

  const useButton = h(doc, "button", { type: "button", "data-ui": "lab-use" }, t("lab.use"));
  const resetButton = h(doc, "button", { type: "button", "data-ui": "lab-reset" }, t("lab.reset"));
  const saved = h(doc, "span", { class: "hint", role: "status", "data-ui": "lab-saved" });

  let steps = [];
  let ranges = null;
  const limits = () => ({ maxSteps: Number(stepsSlider.input.value), maxTokens: Number(tokensSlider.input.value), timeSec: Number(timeSlider.input.value), repeatStop: Number(repeatSelect.value) });

  function draw() {
    const l = limits();
    stepsSlider.value.textContent = String(l.maxSteps);
    tokensSlider.value.textContent = l.maxTokens.toLocaleString(ctx.lang);
    timeSlider.value.textContent = `${l.timeSec} s`;
    const result = simulate(steps, l);
    stepList.replaceChildren(
      ...steps.map((s, i) =>
        h(doc, "div", { class: `lab-step ${result.rows[i]}`, "data-status": result.rows[i] }, h(doc, "span", { class: "chip" }, String(i + 1)), h(doc, "span", { class: "lab-agent" }, s.agent), h(doc, "span", {}, t("lab.stepTokens", { n: s.tokens.toLocaleString(ctx.lang) })), h(doc, "span", { class: "hint" }, t("lab.stepTime", { s: Math.round(s.ms / 1000) }))),
      ),
    );
    tokenBar.style.width = `${Math.min(100, (result.used.tokens / l.maxTokens) * 100)}%`;
    timeBar.style.width = `${Math.min(100, (result.used.sec / l.timeSec) * 100)}%`;
    tokenText.textContent = result.used.tokens.toLocaleString(ctx.lang);
    timeText.textContent = `${Math.round(result.used.sec)} s`;
    if (result.finished) verdict.textContent = t("lab.finished", { used: result.used.tokens.toLocaleString(ctx.lang), max: l.maxTokens.toLocaleString(ctx.lang) });
    else verdict.textContent = t("lab.stopped", { n: result.stop.index + 1, why: t(`lab.why.${result.stop.reason}`, { value: result.stop.reason === "tokens" ? result.stop.value.toLocaleString(ctx.lang) : result.stop.value }) });
    verdict.setAttribute("data-outcome", result.finished ? "finished" : "stopped");
    saved.textContent = "";
  }

  // fromSettings: the sliders start at the limits of Settings, Harness (kept inside the range of the slider); otherwise wide open.
  // The time of a whole run cannot be set in Settings, so it always starts wide open.
  function setRanges(fromSettings = false) {
    const mine = ctx.settings?.get();
    const start = { steps: mine?.limits?.maxSteps, tokens: mine?.limits?.maxTokens };
    for (const [name, s] of [["steps", stepsSlider], ["tokens", tokensSlider], ["time", timeSlider]]) {
      const r = ranges[name];
      s.input.min = String(r.min);
      s.input.max = String(r.max);
      s.input.step = String(r.step);
      const wanted = fromSettings && Number.isFinite(start[name]) ? Math.round(start[name] / r.step) * r.step : r.max;
      s.input.value = String(Math.min(r.max, Math.max(r.min, wanted)));
    }
    repeatSelect.value = String(fromSettings && mine ? mine.repeatStop : REPEAT_STOP.default);
  }

  // The limits of the address (kept inside the range of each slider) replace the ones Settings give, once.
  let preset = params.steps !== undefined || params.tokens !== undefined || params.repeat !== undefined ? params : null;
  const place = (slider, name, wanted) => {
    const r = ranges[name];
    slider.input.value = String(Math.min(r.max, Math.max(r.min, Math.round(wanted / r.step) * r.step)));
  };
  async function choose(id) {
    steps = await loadSteps(id);
    if (ctx.isStale()) return;
    const totals = labTotals(steps);
    runInfo.textContent = t("lab.runInfo", { steps: totals.steps, tokens: totals.tokens.toLocaleString(ctx.lang), time: totals.sec });
    ranges = labRanges(steps);
    setRanges(true);
    if (preset) {
      if (preset.steps !== undefined) place(stepsSlider, "steps", preset.steps);
      if (preset.tokens !== undefined) place(tokensSlider, "tokens", preset.tokens);
      if ([0, 2, 3, 4].includes(preset.repeat)) repeatSelect.value = String(preset.repeat);
      preset = null;
    }
    draw();
  }

  runSelect.addEventListener("change", () => choose(runSelect.value));
  for (const control of [stepsSlider.input, tokensSlider.input, timeSlider.input, repeatSelect]) control.addEventListener("input", draw);
  resetButton.addEventListener("click", () => {
    setRanges();
    draw();
  });
  // The step and token limits and the repeat setting are the same ones as in Settings, Harness. The time of a whole run is fixed.
  useButton.addEventListener("click", () => {
    const l = limits();
    const current = ctx.settings.get().limits;
    ctx.settings.setLimits({ ...current, maxSteps: l.maxSteps, maxTokens: l.maxTokens });
    ctx.settings.setRepeatStop(l.repeatStop);
    const after = ctx.settings.get();
    saved.textContent = t("lab.used", { steps: after.limits.maxSteps, tokens: after.limits.maxTokens.toLocaleString(ctx.lang), repeat: after.repeatStop === 0 ? t("lab.repeatOff") : t("lab.repeatTimes", { n: after.repeatStop }) });
  });

  root.replaceChildren(
    h(doc, "h1", {}, t("lab.title")),
    h(doc, "p", {}, t("lab.intro")),
    h(doc, "div", { class: "lab-pick" }, h(doc, "label", { for: "lab-run" }, t("lab.run")), runSelect),
    runInfo,
    h(
      doc,
      "div",
      { class: "lab-cols" },
      h(doc, "section", { class: "lab-card" }, h(doc, "h2", {}, t("lab.setLimits")), stepsSlider.row, tokensSlider.row, timeSlider.row, h(doc, "div", { class: "lab-row" }, h(doc, "label", { for: "lab-repeat" }, t("lab.repeat")), repeatSelect), h(doc, "p", { class: "hint", "data-ui": "lab-from-settings" }, t("lab.fromSettings")), h(doc, "p", { class: "hint" }, t("lab.note"))),
      h(doc, "section", { class: "lab-card" }, h(doc, "h2", {}, t("lab.seeStop")), stepList, meter(t("lab.tokens"), tokenBar, tokenText), meter(t("lab.time"), timeBar, timeText), verdict),
    ),
    h(doc, "div", { class: "lab-actions" }, useButton, resetButton, saved),
    h(doc, "p", { class: "hint" }, t("lab.goal")),
    h(doc, "p", {}, h(doc, "a", { href: "#/learn/harness" }, t("lab.back"))),
  );
  if (own) runSelect.value = own.id;
  else if (params.run && index.some((r) => r.id === params.run)) runSelect.value = params.run;
  await choose(runSelect.value);
}
