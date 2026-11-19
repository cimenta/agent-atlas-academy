// The schema of the reply an agent must give, for providers that can force a shape (see anthropic.js and gemini.js).
// Null when the agent's reply has no fixed shape. The schemas are loose where the program reads leniently: they only
// require what every valid reply holds.
import { validFormat, mayFormat, formatSchema } from "./format.js";

const str = { type: "string" };
const strings = { type: "array", items: { type: "string" } };
const object = (properties, required) => ({ type: "object", properties, required });

const SCHEMAS = {
  handoff: object({ action: { type: "string", enum: ["handoff", "finish"] }, to: str, note: str, answer: str }, ["action"]),
  supervisor: object(
    { action: { type: "string", enum: ["call", "finish", "create"] }, worker: str, instruction: str, calls: { type: "array", items: object({ worker: str, instruction: str }, ["worker", "instruction"]) }, answer: str, name: str, instructions: str },
    ["action"],
  ),
  evaluator: object({ verdict: { type: "string", enum: ["accept", "revise"] }, feedback: str }, ["verdict"]),
  router: object({ route: str, reason: str }, ["route", "reason"]),
  tally: object({ answer: str, agree: strings, note: str }, ["answer", "agree"]),
  splitter: object({ parts: strings }, ["parts"]),
  planner: object({ steps: strings }, ["steps"]),
};

export function replySchemaFor(node, design, { judging = false } = {}) {
  if (judging) return SCHEMAS.evaluator;
  if (design?.pattern === "handoff") return SCHEMAS.handoff;
  if (node.agent === "supervisor") return SCHEMAS.supervisor;
  if (node.agent === "evaluator") return SCHEMAS.evaluator;
  if (node.agent === "router") return SCHEMAS.router;
  if (node.agent === "tally") return SCHEMAS.tally;
  if (node.agent === "splitter") return SCHEMAS.splitter;
  // A planner that may create agents answers in a richer shape (steps may be objects), so it is not forced.
  if (node.agent === "planner" && design?.pattern === "planexec") return node.creates ? null : SCHEMAS.planner;
  if (validFormat(node.format) && mayFormat(node.agent, design?.pattern)) return formatSchema(node.format);
  return null;
}
