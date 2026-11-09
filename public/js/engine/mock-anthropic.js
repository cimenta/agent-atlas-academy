// A stand-in for the Messages API so every pattern can be run without a key.
// It answers by the "Role: <agent type>" line at the top of the system prompt.
import { AnthropicError } from "./anthropic.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TEXT = {
  planner: "Plan: 1. Find the key facts. 2. Weigh them. 3. Write a short answer.",
  researcher: "Findings: the main facts were collected and the sources agree on the basics.",
  critic: "Review: the argument is clear, but one claim needs a source and one step is missing.",
  writer: "Final answer: here is a short, clear answer that follows the plan and the review.",
  combiner: "Combined answer: the separate findings agree, and together they give one clear answer.",
  debater: "My position: the main point holds, because the evidence points one way and the risks are small.",
  judge: "Verdict: both sides made fair points, and on balance the first argument was stronger.",
  free: "Here is my contribution, written in my own style.",
};

function firstUserText(messages) {
  const first = (messages ?? []).find((m) => m.role === "user");
  return typeof first?.content === "string" ? first.content : "";
}

export function createMockCall({ delayMs = 0 } = {}) {
  return async function call(body, { signal } = {}) {
    if (signal?.aborted) throw new AnthropicError("The request was cancelled");
    if (delayMs) await sleep(delayMs);
    if (signal?.aborted) throw new AnthropicError("The request was cancelled");
    const role = /^Role: (\w+)/.exec(String(body?.system ?? ""))?.[1] ?? "free";
    const messages = body?.messages ?? [];
    const usage = {
      input_tokens: 80 + Math.ceil(JSON.stringify(messages).length / 4),
      output_tokens: 60,
    };
    const reply = (content, extraUsage = {}) => ({
      content,
      stop_reason: "end_turn",
      usage: { ...usage, ...extraUsage },
    });

    if (role === "supervisor") {
      const workers = (/Workers: (.+)/.exec(firstUserText(messages))?.[1] ?? "").split(",").map((w) => w.trim()).filter(Boolean);
      const done = messages.filter((m) => m.role === "assistant").length;
      const text =
        done < workers.length
          ? JSON.stringify({ action: "call", worker: workers[done], instruction: "Do your part of the task." })
          : JSON.stringify({ action: "finish", answer: "Final answer: the workers' results were put together into one answer." });
      return reply([{ type: "text", text }]);
    }
    if (role === "researcher" && Array.isArray(body.tools) && body.tools.length > 0) {
      return reply(
        [
          { type: "server_tool_use", id: "srvtoolu_mock", name: "web_search", input: { query: "main facts about the task" } },
          {
            type: "web_search_tool_result",
            tool_use_id: "srvtoolu_mock",
            content: [{ type: "web_search_result", title: "Example source", url: "https://example.org/source" }],
          },
          { type: "text", text: TEXT.researcher },
        ],
        { server_tool_use: { web_search_requests: 1 } },
      );
    }
    return reply([{ type: "text", text: TEXT[role] ?? TEXT.free }]);
  };
}
