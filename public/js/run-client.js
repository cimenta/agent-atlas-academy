// Starts a live run on the server and turns the server-sent events back into run events.
export class RunStartError extends Error {
  constructor(code, errors) {
    super(`The run could not start: ${code}`);
    this.name = "RunStartError";
    this.code = code;
    if (errors) this.errors = errors;
  }
}

function synthesizeDone(outcome, events) {
  const usage = { input: 0, output: 0, searches: 0, steps: 0 };
  for (const e of events) {
    if (e.type === "agent_output") {
      usage.input += Number(e.tokens?.input) || 0;
      usage.output += Number(e.tokens?.output) || 0;
      usage.steps += 1;
    }
    if (e.type === "tool_call") usage.searches += 1;
  }
  return { type: "done", outcome, usage, finalText: "", t: events.at(-1)?.t ?? 0 };
}

function parseBlock(block) {
  for (const line of block.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const value = JSON.parse(line.slice(5).trim());
      if (value && typeof value === "object" && typeof value.type === "string") return value;
    } catch {
      // not an event; skip it
    }
  }
  return null;
}

export function startRun({ design, task, limits, language, apiKey, keys, provider = "anthropic", fetchFn = fetch, onEvent }) {
  const controller = new AbortController();
  const events = [];
  let stopped = false;
  let finished = false;

  const deliver = (event) => {
    events.push(event);
    if (event.type === "done") finished = true;
    onEvent(event);
  };

  const done = (async () => {
    let response;
    try {
      response = await fetchFn("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ design, task, limits, language, apiKey, ...(keys ? { keys } : {}), provider }),
        signal: controller.signal,
      });
    } catch (error) {
      if (stopped) {
        deliver(synthesizeDone("stopped_user", events));
        return { outcome: "stopped_user" };
      }
      throw new RunStartError("network");
    }
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        // not JSON
      }
      throw new RunStartError(typeof payload?.error === "string" ? payload.error : "server", payload?.errors);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const event = parseBlock(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 2);
          if (event && !finished) deliver(event);
        }
      }
      const rest = parseBlock(buffer);
      if (rest && !finished) deliver(rest);
    } catch {
      // aborted or cut off: handled below
    }
    if (!finished) deliver(synthesizeDone(stopped ? "stopped_user" : "interrupted", events));
    return { outcome: events.at(-1).outcome };
  })();

  return {
    done,
    stop() {
      stopped = true;
      controller.abort();
    },
  };
}
