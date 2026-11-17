// The help text is one markdown text. Its topics start with "## title" (and may end with {#id}); inside a topic,
// small sections start with "### title {#id}". A section may end with a line {related: id, id}, the sections
// it points to. The Help page shows the topics; the ? button of a setting shows one section.
const TOPIC = /^##\s+(.+?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/;
const SECTION = /^###\s+(.+?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/;
const RELATED = /^\{related:\s*([^}]*)\}\s*$/;

// [{ title, id, text, sections: [{ id, title, text, related }] }]. Text before the first topic is dropped.
export function splitTopics(markdown) {
  const topics = [];
  let section = null;
  for (const line of String(markdown ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const topicHeading = TOPIC.exec(line);
    if (topicHeading) {
      topics.push({ title: topicHeading[1], id: topicHeading[2], lines: [], sections: [] });
      section = null;
      continue;
    }
    const current = topics[topics.length - 1];
    if (!current) continue;
    const sectionHeading = SECTION.exec(line);
    if (sectionHeading) {
      section = sectionHeading[2] ? { id: sectionHeading[2], title: sectionHeading[1], lines: [], related: [] } : null;
      if (section) current.sections.push(section);
      current.lines.push(`### ${sectionHeading[1]}`);
      continue;
    }
    const related = RELATED.exec(line);
    if (related) {
      if (section) section.related = related[1].split(/[,\s]+/).filter(Boolean);
      continue;
    }
    current.lines.push(line);
    if (section) section.lines.push(line);
  }
  return topics.map(({ title, id, lines, sections }) => ({
    title,
    id,
    text: lines.join("\n").trim(),
    sections: sections.map((s) => ({ id: s.id, title: s.title, text: s.lines.join("\n").trim(), related: s.related })),
  }));
}

// The section with this id and the topic it belongs to, or null.
export function findSection(markdown, id) {
  for (const topic of splitTopics(markdown)) {
    const section = topic.sections.find((s) => s.id === id);
    if (section) return { section, topic };
  }
  return null;
}
