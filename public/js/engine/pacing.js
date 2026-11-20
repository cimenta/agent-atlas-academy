// Spaces the calls to a provider whose free account has limits: one at a time, with a gap after each, so a burst of parallel agents
// does not meet the minute limit all at once. A failing call does not block the ones behind it.
export function createGate({ gapMs, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let last = Promise.resolve();
  let first = true;
  return {
    run(fn) {
      const turn = last.then(async () => {
        if (!first && gapMs > 0) await sleep(gapMs);
        first = false;
        return fn();
      });
      last = turn.catch(() => {});
      return turn;
    },
  };
}
