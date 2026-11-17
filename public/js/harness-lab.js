// The Harness lab page: pick a recorded run, set limits, see where the run would stop. No provider is called.
import { h } from "./dom.js";
import { getJson, setTitle } from "./pages.js";
import { labSteps, labTotals, labRanges, simulate } from "./harness-lab-model.js";
import { REPEAT_STOP } from "./engine/catalog.js";

const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export async function renderLab(ctx) {
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
  const loadSteps = async (id) => {
    if (!cache.has(id)) cache.set(id, labSteps(await getJson(ctx, `/runs/${id}.json`)));
    return cache.get(id);
  };

  const runSelect = h(doc, "select", { id: "lab-run", "data-ui": "lab-run" });
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

  function setRanges() {
    for (const [name, s] of [["steps", stepsSlider], ["tokens", tokensSlider], ["time", timeSlider]]) {
      const r = ranges[name];
      s.input.min = String(r.min);
      s.input.max = String(r.max);
      s.input.step = String(r.step);
      s.input.value = String(r.max);
    }
    repeatSelect.value = String(REPEAT_STOP.default);
  }

  async function choose(id) {
    steps = await loadSteps(id);
    if (ctx.isStale()) return;
    const totals = labTotals(steps);
    runInfo.textContent = t("lab.runInfo", { steps: totals.steps, tokens: totals.tokens.toLocaleString(ctx.lang), time: totals.sec });
    ranges = labRanges(steps);
    setRanges();
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
      h(doc, "section", { class: "lab-card" }, h(doc, "h2", {}, t("lab.setLimits")), stepsSlider.row, tokensSlider.row, timeSlider.row, h(doc, "div", { class: "lab-row" }, h(doc, "label", { for: "lab-repeat" }, t("lab.repeat")), repeatSelect), h(doc, "p", { class: "hint" }, t("lab.note"))),
      h(doc, "section", { class: "lab-card" }, h(doc, "h2", {}, t("lab.seeStop")), stepList, meter(t("lab.tokens"), tokenBar, tokenText), meter(t("lab.time"), timeBar, timeText), verdict),
    ),
    h(doc, "div", { class: "lab-actions" }, useButton, resetButton, saved),
    h(doc, "p", { class: "hint" }, t("lab.goal")),
    h(doc, "p", {}, h(doc, "a", { href: "#/learn/harness" }, t("lab.back"))),
  );
  await choose(runSelect.value);
}
