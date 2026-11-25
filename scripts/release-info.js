// Prints where the project stands before a release: the version in package.json, the last release tag with the message of the commit that made it,
// and the message of the last commit (the one test.bat made). Run by release.bat at its start; it changes nothing.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    return `(git ${args[0]} failed: ${String(e.stderr || e.message).trim().split("\n")[0]})`;
  }
}

// The newest version tag, found by sorting the tags, not by walking the history (describe finds none when the tags are not on the path).
export const lastTag = () => git(["tag", "--list", "v[0-9]*", "--sort=-v:refname"]).split(/\r?\n/)[0] || "";

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const tag = lastTag();
console.log(`Current version: ${version}`);
console.log(`Last release: ${tag || "none yet"}`);
if (tag) console.log(`  ${git(["log", "-1", "--format=%s", `${tag}^{commit}`])}`);
console.log("Last test commit:");
console.log(`  ${git(["log", "-1", "--format=%s"])}`);
