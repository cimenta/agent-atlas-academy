// A small markdown subset: headings, paragraphs, lists, code blocks, bold, italic, code, links.
// Raw HTML is never interpreted: it stays plain text.

export function parseFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      meta[key] = value
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    } else {
      meta[key] = value;
    }
  }
  return { meta, body: text.slice(match[0].length) };
}

export function isSafeHref(href) {
  if (typeof href !== "string" || /\s/.test(href)) return false;
  return /^https?:\/\/\S+/i.test(href) || /^#\//.test(href);
}

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function parseInlines(text) {
  const inlines = [];
  const pushText = (value) => {
    if (!value) return;
    const last = inlines[inlines.length - 1];
    if (last && last.type === "text") last.text += value;
    else inlines.push({ type: "text", text: value });
  };
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    pushText(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) inlines.push({ type: "strong", text: m[1] });
    else if (m[2] !== undefined) inlines.push({ type: "em", text: m[2] });
    else if (m[3] !== undefined) inlines.push({ type: "code", text: m[3] });
    else if (isSafeHref(m[5])) inlines.push({ type: "link", text: m[4], href: m[5] });
    else pushText(m[4]);
  }
  pushText(text.slice(last));
  return inlines;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+\.\s+(.*)$/;

function startsBlock(line) {
  return HEADING.test(line) || UNORDERED.test(line) || ORDERED.test(line) || line.startsWith("```");
}

export function parseMarkdown(body) {
  const lines = body.split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: Math.min(heading[1].length, 3),
        inlines: parseInlines(heading[2]),
      });
      i++;
      continue;
    }
    const ordered = ORDERED.test(line);
    if (ordered || UNORDERED.test(line)) {
      const pattern = ordered ? ORDERED : UNORDERED;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(parseInlines(pattern.exec(lines[i])[1]));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", inlines: parseInlines(paragraph.join(" ")) });
  }
  return blocks;
}
