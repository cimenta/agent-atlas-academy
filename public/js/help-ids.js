// Which section of Help explains a warning of a run. A limit names its own setting.
const LIMIT_HELP = { steps: "harness-steps", tokens: "harness-tokens", searches: "harness-searches", cost: "harness-cost", repeat: "harness-repeat" };

export function warningHelp(event) {
  if (event?.webSearchOff) return "harness-web-search";
  if (event?.handoff) return "harness-handoff";
  if (event?.retry) return "harness-retries";
  if (event?.truncated) return "harness-output";
  const limit = String(event?.limit ?? "").replace(/^agent_/, "");
  return LIMIT_HELP[limit] ?? "replay-warnings";
}

// Every id warningHelp can return (a test checks each one exists in Help).
export const WARNING_HELP_IDS = [...Object.values(LIMIT_HELP), "harness-web-search", "harness-handoff", "harness-retries", "harness-output", "replay-warnings"];
