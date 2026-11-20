export function prepareCopy(...elements) {
  const text = elements.map(element => element.textContent).join("");
  const length = text.replace(/\s/g, "").length;
  let index = 0;
  function appendGlyphs(source, target) {
    for (const node of source.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) {
        const inline = node.cloneNode(false);
        appendGlyphs(node, inline);
        target.append(inline);
        continue;
      }
      for (const word of node.textContent.split(/(\s+)/)) {
        if (!word.trim()) {
          target.append(word);
          continue;
        }
        const group = document.createElement("span");
        group.className = "motion-word";
        for (const letter of word) {
          const glyph = document.createElement("span");
          glyph.className = "motion-glyph";
          glyph.style.setProperty("--glyph-delay", .47 * index++ / Math.max(1, length - 1));
          glyph.textContent = letter;
          group.append(glyph);
        }
        target.append(group);
      }
    }
  }

  for (const element of elements) {
    const readable = document.createElement("span");
    readable.className = "motion-readable";
    readable.append(...element.childNodes);
    const visible = document.createElement("span");
    visible.setAttribute("aria-hidden", "true");
    appendGlyphs(readable, visible);
    element.append(readable, visible);
  }
}

export const unit = t => Math.min(1, Math.max(0, t));
