// Turns parsed markdown blocks into DOM nodes. Only createElement and text are used,
// never HTML strings, so content cannot inject markup.

function renderInline(inline, doc) {
  if (inline.type === "text") return doc.createTextNode(inline.text);
  if (inline.type === "link") {
    const a = doc.createElement("a");
    a.setAttribute("href", inline.href);
    a.setAttribute("rel", "noopener noreferrer");
    a.textContent = inline.text;
    return a;
  }
  const tag = { strong: "strong", em: "em", code: "code" }[inline.type];
  const el = doc.createElement(tag);
  el.textContent = inline.text;
  return el;
}

function appendInlines(parent, inlines, doc) {
  for (const inline of inlines) parent.appendChild(renderInline(inline, doc));
}

export function renderBlocks(blocks, doc) {
  const fragment = doc.createDocumentFragment();
  for (const block of blocks) {
    if (block.type === "heading") {
      const h = doc.createElement(`h${block.level}`);
      appendInlines(h, block.inlines, doc);
      fragment.appendChild(h);
    } else if (block.type === "paragraph") {
      const p = doc.createElement("p");
      appendInlines(p, block.inlines, doc);
      fragment.appendChild(p);
    } else if (block.type === "list") {
      const list = doc.createElement(block.ordered ? "ol" : "ul");
      for (const item of block.items) {
        const li = doc.createElement("li");
        appendInlines(li, item, doc);
        list.appendChild(li);
      }
      fragment.appendChild(list);
    } else if (block.type === "code") {
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      code.textContent = block.text;
      pre.appendChild(code);
      fragment.appendChild(pre);
    }
  }
  return fragment;
}
