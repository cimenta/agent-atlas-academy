import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+$/;

export function writeVersionFile(packageJsonPath, outPath) {
  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (typeof version !== "string" || !SEMVER.test(version)) {
    throw new Error(`Version "${version}" is not semantic (MAJOR.MINOR.PATCH)`);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ version }));
  return version;
}

export async function runBuild(appDir) {
  const version = writeVersionFile(
    join(appDir, "package.json"),
    join(appDir, "public", "version.json"),
  );
  console.log(`Built version ${version}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  await runBuild(join(dirname(fileURLToPath(import.meta.url)), ".."));
}
