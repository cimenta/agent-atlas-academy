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
  evaluator: "",
  judge: "Verdict: both sides made fair points, and on balance the first argument was stronger.",
  free: "Here is my contribution, written in my own style.",
};

// The note a mock agent leaves when it may write to the notebook.
const NOTES = {
  planner: "The plan has three steps: find the facts, weigh them, write the answer.",
  researcher: "The sources agree on the basics of the task.",
  critic: "One claim still needs a source.",
  writer: "The final text is short and follows the plan.",
  free: "A note from this agent for the others.",
};

function firstUserText(messages) {
  const first = (messages ?? []).find((m) => m.role === "user");
  return typeof first?.content === "string" ? first.content : "";
}

// evaluatorAcceptsAt: the verdict (counted from 1) at which the mock evaluator accepts; 0 means it never accepts.
export function createMockCall({ delayMs = 0, evaluatorAcceptsAt = 2 } = {}) {
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

    // The shared notebook: an agent that may write adds a note, and one that read notes says how many.
    const MARK = "\n\nNotebook:\n";
    const lastInput = [...messages].reverse().find((m) => m.role === "user");
    const seen = typeof lastInput?.content === "string" && lastInput.content.includes(MARK) ? (lastInput.content.split(MARK).pop().match(/^- /gm) ?? []).length : 0;
    const withMemory = (text) =>
      `${text}${seen > 0 ? ` (Used ${seen} ${seen === 1 ? "note" : "notes"} from the notebook.)` : ""}${String(body?.system ?? "").includes("<note>") ? `\n\n<note>${NOTES[role] ?? NOTES.free}</note>` : ""}`;

    if (String(body?.system ?? "").startsWith("You shorten text")) {
      // The extra call of condensing: the mock keeps the start of the text.
      const material = typeof firstUserText(messages) === "string" ? firstUserText(messages) : "";
      return reply([{ type: "text", text: `${material.replace(/\s+/g, " ").slice(0, 200).trim()}...` }]);
    }
    if (String(body?.system ?? "").includes("one of several voters")) {
      // In a voting run every mock voter gives the same answer, so the mock tally can say that all of them agree.
      return reply([{ type: "text", text: "The sky is blue because air scatters blue light more than red light." }]);
    }
    if (role === "tally") {
      // The mock tally says that every voter agrees, so a mock run always has a full majority.
      const ids = [...(typeof firstUserText(messages) === "string" ? firstUserText(messages) : "").matchAll(/^--- (\S+) ---$/gm)].map((m) => m[1]);
      return reply([{ type: "text", text: JSON.stringify({ answer: "Final answer: the voters gave the same answer, and this is it.", agree: ids, note: "" }) }]);
    }
    if (role === "splitter") {
      // The mock splitter always makes three parts.
      return reply([{ type: "text", text: JSON.stringify({ parts: ["Part 1: collect the key facts.", "Part 2: weigh the facts against each other.", "Part 3: note what is still open."] }) }]);
    }
    if (role === "planner" && String(body?.system ?? "").includes('"steps"')) {
      // The mock planner always makes a plan of three steps.
      return reply([{ type: "text", text: JSON.stringify({ steps: ["Collect the key facts.", "Weigh the facts.", "Write the final answer."] }) }]);
    }
    if (role === "worker") {
      const part = /Your part:\n(.*)/.exec(typeof lastInput?.content === "string" ? lastInput.content : "")?.[1] ?? "its part";
      return reply([{ type: "text", text: `Result for "${part}": done in a few clear sentences.` }]);
    }
    if (role === "reducer") return reply([{ type: "text", text: "Final answer: the results of the workers were merged into one short, clear answer." }]);
    if (role === "executor") {
      const step = /Now do step (\d+)/.exec(typeof lastInput?.content === "string" ? lastInput.content : "")?.[1] ?? "1";
      return reply([{ type: "text", text: `Step ${step} done: the result is short and builds on the steps before it.` }]);
    }
    if (role === "router") {
      // The mock router always chooses the first specialist in the list, so a mock run ends the same way each time.
      const first = [...messages].reverse().find((m) => m.role === "user");
      const target = /You may route to:\s*([^\s,(]+)/.exec(typeof first?.content === "string" ? first.content : "")?.[1] ?? "";
      return reply([{ type: "text", text: JSON.stringify({ route: target, reason: "This specialist fits the task best." }) }]);
    }
    if (String(body?.system ?? "").includes('"action":"handoff"')) {
      // A handoff run: the first time an agent is activated it hands over to the first agent it may, then it finishes.
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const target = /You may hand over to:\s*([^\s,(]+)/.exec(typeof lastUser?.content === "string" ? lastUser.content : "")?.[1];
      const answered = messages.some((m) => m.role === "assistant");
      const text =
        target && !answered
          ? JSON.stringify({ action: "handoff", to: target, note: `${TEXT[role] ?? TEXT.free} Please take it from here and carry the task one step further.` })
          : JSON.stringify({ action: "finish", answer: `Final answer: the work of the agents was put together into one short, clear answer (finished by ${role}).` });
      return reply([{ type: "text", text }]);
    }
    if (role === "writer" && messages.filter((m) => m.role === "user").length > 1) {
      // A revised draft: it differs from the one before, as a real revision would.
      return reply([{ type: "text", text: `${TEXT.writer} (revision ${messages.filter((m) => m.role === "user").length - 1})` }]);
    }
    if (role === "evaluator") {
      const given = messages.filter((m) => m.role === "assistant").length + 1;
      const text =
        evaluatorAcceptsAt > 0 && given >= evaluatorAcceptsAt
          ? JSON.stringify({ verdict: "accept" })
          : JSON.stringify({ verdict: "revise", feedback: `Round ${given}: add one concrete example and cut one general sentence.` });
      return reply([{ type: "text", text }]);
    }
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
          { type: "text", text: withMemory(TEXT.researcher) },
        ],
        { server_tool_use: { web_search_requests: 1 } },
      );
    }
    return reply([{ type: "text", text: withMemory(TEXT[role] ?? TEXT.free) }]);
  };
}
