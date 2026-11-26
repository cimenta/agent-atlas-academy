// Asks a yes or no question for test.bat and release.bat.
//   node scripts/confirm.js "Go ahead? [Y/n] "      exit code 0 = go on, 1 = cancel
//   node scripts/confirm.js "Do it? " --default-no   Enter alone means no, only y or yes is yes
// Enter alone means yes, y or yes is yes, anything else is no, and Ctrl+C, a closed input or any error cancels
// (the batch command set /p took Ctrl+C as an empty answer, which meant yes).
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export const isYes = (answer, { defaultYes = true } = {}) => (defaultYes ? ["", "y", "yes"] : ["y", "yes"]).includes(String(answer ?? "").trim().toLowerCase());

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answered = false;
  rl.on("SIGINT", () => {
    console.log("^C");
    process.exit(1);
  });
  rl.on("close", () => {
    if (!answered) process.exit(1);
  });
  rl.question(process.argv[2] ?? "Go ahead? [Y/n] ", (answer) => {
    answered = true;
    rl.close();
    process.exit(isYes(answer, { defaultYes: !process.argv.includes("--default-no") }) ? 0 : 1);
  });
}
