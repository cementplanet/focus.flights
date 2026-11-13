const alphabet = " 0123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function startDepartures(section, reducedMotion) {
  const widths = [5, 9, 10];
  const tiles = [];
  const rows = [];
  const scenes = [
    ["READING", "KYOTO"], ["STUDYING", "HELSINKI"], ["WRITING", "PARIS"],
    ["DEEP WORK", "NEW YORK"], ["DESIGNING", "COPENHAGEN"], ["PRACTICE", "VIENNA"],
    ["CODING", "TOKYO"], ["REVIEWING", "OSLO"], ["SKETCHING", "FLORENCE"],
    ["PLANNING", "ZURICH"], ["RESEARCH", "CAMBRIDGE"], ["EDITING", "LONDON"],
    ["DRAWING", "BARCELONA"], ["LEARNING", "STOCKHOLM"], ["JOURNAL", "LISBON"],
    ["REVISING", "EDINBURGH"],
  ];
  for (const row of section.querySelectorAll("tbody tr")) {
    const columns = [];
    rows.push(columns);
    for (const [column, cell] of Array.from(row.cells).entries()) {
      const text = cell.textContent.trim();
      const letters = [];
      const strip = document.createElement("span");
      strip.className = "flap-strip";
      strip.setAttribute("aria-hidden", "true");
      for (const [index, letter] of Array.from(text.padEnd(widths[column])).entries()) {
        const tile = document.createElement("span");
        tile.className = "flap";
        tile.innerHTML = '<span class="flap-face flap-face--top"><span></span></span><span class="flap-face flap-face--bottom"><span></span></span>';
        tile.querySelectorAll('.flap-face span').forEach(face => { face.textContent = letter; });
        strip.append(tile);
        const seed = row.sectionRowIndex * 41 + column * 13 + index * 31;
        const entry = { element: tile, letter, row: row.sectionRowIndex, wheel: column === 0 ? "0123456789:" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
          delay: column * 145 + row.sectionRowIndex * 53 + index * 19 + seed % 67,
          turns: 4 + seed % 3, period: 192 + seed % 2 * 16 };
        tiles.push(entry);
        letters.push(entry);
      }
      const accessible = document.createElement("span");
      accessible.className = "departure-text";
      accessible.textContent = column === 0 ? `${Number(text.split(":")[0])} minutes` : text;
      cell.replaceChildren(accessible, strip);
      columns.push({ letters, accessible });
    }
  }

  const canvas = document.createElement("canvas");
  canvas.className = "departure-animation";
  canvas.setAttribute("aria-hidden", "true");
  section.append(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });
  const atlas = new Image();
  let ready = false, flipped = false, settled = false, frame, idleTimer, start = 0;
  let visible = [];
  let entranceStart;
  let width = 0, height = 0;

  function layout() {
    if (!ready) return;
    const bounds = section.getBoundingClientRect();
    const top = tiles[0].element.getBoundingClientRect().top - bounds.top;
    width = bounds.width;
    height = Math.max(1, bounds.height - top);
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    canvas.style.cssText = `left:0;top:${top}px;width:${width}px;height:${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    visible = tiles.filter(tile => {
      const rect = tile.element.getBoundingClientRect();
      Object.assign(tile, { x: rect.left - bounds.left, y: rect.top - bounds.top - top, w: rect.width, h: rect.height });
      return tile.y < height && tile.y + tile.h > 0;
    });
    draw(performance.now(), true);
  }

  function piece(letter, sx, sy, sw, sh, dx, dy, dw, dh) {
    const index = Math.max(0, alphabet.indexOf(letter));
    ctx.drawImage(atlas, index % 10 * 96 + sx, Math.floor(index / 10) * 150 + sy,
      sw, sh, dx, dy, dw, dh);
  }

  function draw(now, all = false) {
    let gliding = false;
    if (entranceStart !== undefined) {
      all = true;
      gliding = now < entranceStart + 820 + (visible.at(-1)?.row ?? 0) * 95;
      if (!gliding) entranceStart = undefined;
    }
    if (all) ctx.clearRect(0, 0, width, height);
    let active = gliding;
    for (const tile of visible) {
      if (!all && !tile.cards) continue;
      if (!all) ctx.clearRect(tile.x, tile.y, tile.w, tile.h);
      const {x, w, h, cards, at, period} = tile;
      const glide = entranceStart === undefined ? 1 : Math.max(0, Math.min(1, (now - entranceStart - tile.row * 95) / 820));
      const y = tile.y + 24 * (1 - glide) ** 3;
      let before = flipped ? tile.letter : " ", after = before, angle = 0;
      if (cards) {
        const time = now - at;
        const step = Math.max(0, Math.floor(time / period));
        const last = cards.length - 2;
        const elapsed = time - Math.min(step, last) * period;
        if (time < 0) {
          before = after = cards[0]; active = true;
        } else if (step >= last && elapsed >= 325) {
          tile.cards = undefined;
        } else {
          active = true;
          before = cards[Math.min(step, last)]; after = cards[Math.min(step, last) + 1];
          const fall = step >= last ? 219 : period - 18;
          const t = Math.min(1, elapsed / fall);
          angle = Math.PI * t * t * (2.65 - 1.65 * t);
          if (step >= last && elapsed > fall) angle -= .073 * Math.sin(Math.PI * (elapsed - fall) / 106);
        }
      }
      piece(after, 0, 0, 96, 72.48, x, y, w, h / 2);
      piece(before, 0, 72.48, 96, 72.48, x, y + h / 2, w, h / 2);
      if (before !== after || angle) {
        // Project the baked leaf around its hinge; the frame and pins remain stationary.
        const cosine = Math.cos(angle);
        const leafHeight = h * .47 * Math.abs(cosine);
        const front = cosine >= 0;
        const leafY = front ? y + h * .5 - leafHeight : y + h * .5;
        piece(front ? before : after, 4.8, front ? 4.35 : 72.48, 86.4, 68.13,
          x + w * .05, leafY, w * .9, Math.max(.01, leafHeight));
        ctx.fillStyle = `rgba(0,0,0,${.24 * Math.sin(angle)})`;
        ctx.fillRect(x + w * .05, leafY, w * .9, Math.max(.01, leafHeight));
        // Reapply the two fixed axle pins above the rotating leaf.
        for (const pinX of [0, 86.4]) piece(before, pinX, 57.98, 9.6, 29,
          x + w * pinX / 96, y + h * .4, w * .1, h * .2);
      }
    }
    return active;
  }

  function play(now) {
    frame = undefined;
    if (draw(now)) frame = requestAnimationFrame(play);
    else scheduleIdle();
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (!settled || reducedMotion.matches || document.hidden) return;
    idleTimer = setTimeout(() => {
      const candidates = rows.filter(columns => visible.includes(columns[0].letters[0]));
      const available = scenes.filter(([focus]) => !rows.some(columns => columns[1].accessible.textContent === focus));
      const count = Math.min(candidates.length, 2 + Math.floor(Math.random() * 2));
      const now = performance.now();
      for (let row = 0; row < count; row++) {
        const columns = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
        const scene = available.splice(Math.floor(Math.random() * available.length), 1)[0];
        for (let column = 1; column <= 2; column++) {
          const { letters, accessible } = columns[column];
          const text = scene[column - 1].padEnd(widths[column]);
          accessible.textContent = scene[column - 1];
          letters.forEach((tile, index) => {
            const previous = tile.letter;
            tile.letter = text[index];
            tile.element.querySelectorAll('.flap-face span').forEach(face => { face.textContent = tile.letter; });
            const wheel = " " + tile.wheel;
            const target = wheel.indexOf(tile.letter) + wheel.length;
            tile.cards = [previous, ...Array.from({ length: 3 }, (_, step) =>
              wheel[(target - 2 + step) % wheel.length])];
            tile.at = now + row * 240 + (column - 1) * 120 + index * 22;
          });
        }
      }
      frame = requestAnimationFrame(play);
    }, 3600 + Math.random() * 2600);
  }

  function stop() {
    cancelAnimationFrame(frame); frame = undefined;
    clearTimeout(idleTimer);
    entranceStart = undefined;
    for (const tile of tiles) tile.cards = undefined;
  }

  atlas.onload = () => {
    ready = true;
    section.setAttribute("data-baked", "");
    layout();
    scheduleIdle();
  };
  // If the atlas fails, keep the readable DOM board instead of an empty canvas.
  atlas.src = new URL("./data/flap-atlas.png", import.meta.url).href;
  window.addEventListener("resize", () => { stop(); layout(); scheduleIdle(); });
  document.fonts.ready.then(layout);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stop(); if (ready) draw(performance.now(), true); }
    else scheduleIdle();
  });
  reducedMotion.addEventListener("change", () => { stop(); if (ready) draw(performance.now(), true); scheduleIdle(); });

  return (progress, resting) => {
    if (settled !== resting) {
      settled = resting;
      if (resting) scheduleIdle();
      else clearTimeout(idleTimer);
    }
    const next = progress >= .56 || (flipped && progress > .1);
    if (next === flipped) return;
    flipped = next;
    stop();
    if (!ready) return;
    if (flipped && !reducedMotion.matches) {
      start = performance.now();
      entranceStart = start;
      for (const tile of visible) {
        if (tile.letter === " ") continue;
        const target = tile.wheel.indexOf(tile.letter) + tile.wheel.length;
        tile.cards = [" ", ...Array.from({length:tile.turns}, (_, step) =>
          tile.wheel[(target - tile.turns + 1 + step) % tile.wheel.length])];
        tile.at = start + tile.delay;
      }
      frame = requestAnimationFrame(play);
    } else draw(performance.now(), true);
  };
}
