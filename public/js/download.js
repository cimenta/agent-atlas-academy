// Saves text as a file through a temporary link. Nothing leaves the browser.
export function downloadFile(doc, name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", name);
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A file name that is safe on every system.
export function safeFileName(text, fallback = "run") {
  const cleaned = String(text ?? "").normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return cleaned || fallback;
}

// Copies text to the clipboard; false when the browser refuses.
export async function copyText(doc, text) {
  try {
    await doc.defaultView.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
