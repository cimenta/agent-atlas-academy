import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseFrontMatter } from "../public/js/markdown.js";

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

export function buildArticleIndexes(articlesDir) {
  for (const lang of readdirSync(articlesDir)) {
    const langDir = join(articlesDir, lang);
    if (!statSync(langDir).isDirectory()) continue;
    const items = [];
    for (const file of readdirSync(langDir).filter((f) => f.endsWith(".md"))) {
      const { meta } = parseFrontMatter(readFileSync(join(langDir, file), "utf8"));
      const order = Number(meta.order);
      if (!meta.title || !meta.section || !Number.isFinite(order)) {
        throw new Error(`${lang}/${file}: front matter needs title, section and a numeric order`);
      }
      items.push({
        slug: file.slice(0, -3),
        title: meta.title,
        section: meta.section,
        order,
        summary: meta.summary || "",
        related: Array.isArray(meta.related) ? meta.related : [],
      });
    }
    items.sort((a, b) => a.order - b.order);
    writeFileSync(join(langDir, "index.json"), JSON.stringify(items));
  }
}

export async function runBuild(appDir) {
  const version = writeVersionFile(
    join(appDir, "package.json"),
    join(appDir, "public", "version.json"),
  );
  const articlesDir = join(appDir, "public", "content", "articles");
  if (existsSync(articlesDir)) buildArticleIndexes(articlesDir);
  console.log(`Built version ${version}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  await runBuild(join(dirname(fileURLToPath(import.meta.url)), ".."));
}
