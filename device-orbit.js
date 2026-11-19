export function setupDeviceOrbit(stage, buttons, reducedMotion) {
  // Visible bounds inside the shared 3840 × 2160 transparent exports.
  const bounds = [[1483, 189, 906, 1804], [1016, 94, 1788, 1878], [747, 227, 2401, 1738], [610, 298, 2471, 1610]];
  const centerY = [.52, .52, .515, .53];
  const firstVideo = stage.querySelector("video");
  const items = buttons.map((button, index) => {
    const item = document.createElement("div");
    const media = document.createElement("div");
    const poster = document.createElement("img");
    const [x, y, width, height] = bounds[index];
    item.className = "device-orbit-item";
    media.className = "device-orbit-media";
    media.style.animationDelay = `${index * -1.7}s`;
    item.dataset.device = button.dataset.device;
    item.style.setProperty("--device-ratio", width / height);
    item.style.setProperty("--canvas-width", `${3840 / width * 100}%`);
    item.style.setProperty("--canvas-left", `${-x / width * 100}%`);
    item.style.setProperty("--canvas-top", `${-y / height * 100}%`);
    poster.src = `device-media/${button.dataset.media ?? button.dataset.device}.png`;
    poster.className = "device-orbit-poster";
    poster.alt = "";
    poster.draggable = false;
    item.setAttribute("aria-hidden", "true");
    media.append(poster);
    const blurred = poster.cloneNode();
    blurred.className = "device-orbit-blur";
    blurred.src = `device-media/${button.dataset.media ?? button.dataset.device}-blur.png`;
    media.append(blurred);
    if (index === 0) media.append(firstVideo);
    item.append(media);
    item.addEventListener("click", () => button.click());
    stage.append(item);
    return item;
  });

  let angle = 0;
  let velocity = 0;
  let target = 0;
  let frame = 0;
  let complete;
  const turn = Math.PI * 2;
  const step = turn / buttons.length;
  const compact = matchMedia("(max-width: 700px)");

  const section = stage.closest(".showcase");
  const intro = section.querySelector(".showcase-intro");
  const picker = section.querySelector(".showcase-devices");
  let frontX = .72;

  function fitDevice() {
    if (!compact.matches) {
      const bounds = stage.getBoundingClientRect();
      const left = intro.getBoundingClientRect().right + 16;
      const right = picker.getBoundingClientRect().left - 16;
      if (bounds.width > 0 && right > left) {
        frontX = ((left + right) / 2 - bounds.left) / bounds.width;
        stage.style.setProperty("--front-width", (right - left) + "px");
      }
    }
    paint();
  }

  function paint() {
    items.forEach((item, index) => {
      const phase = angle + index * step;
      const depth = Math.cos(phase);
      const side = Math.sin(phase);
      const distance = 1 - depth;
      const scale = 1 + distance * .6;
      const focus = (depth + 1) / 2;
      const focusY = centerY[index];
      const x = compact.matches
        ? .43 + .25 * depth + .12 * side - .18 * focus
        : .33 + .43 * depth + .18 * side + (frontX - .76) * focus;
      const y = compact.matches
        ? .50 + .08 * depth - .55 * side - .05 * depth ** 2 - .03 * focus
        : .55 + .12 * depth - .51 * side - .12 * depth ** 2 + (focusY - .55) * focus;
      const defocus = (distance / 2) ** .85;
      const sharp = Math.max(0, 1 - defocus / .3);
      const leftFade = Math.max(0, Math.min(1, (x - (compact.matches ? -.05 : .05)) / .5));
      const opacity = Math.exp(-1.9 * distance) * leftFade * leftFade * (3 - 2 * leftFade);
      item.style.left = `${x * 100}%`;
      item.style.top = `${y * 100}%`;
      item.style.transform = `translate(-50%, -50%) scale(${scale})`;
      item.style.setProperty("--device-sharp", sharp);
      item.style.opacity = opacity;
      item.style.visibility = opacity < .008 ? "hidden" : "visible";
      item.style.zIndex = Math.round((depth + 1) * 100);
    });
  }

  function settle() {
    cancelAnimationFrame(frame);
    angle = target;
    velocity = 0;
    paint();
    complete?.();
    complete = undefined;
  }

  function move(button) {
    cancelAnimationFrame(frame);
    complete?.();
    complete = undefined;
    const index = buttons.indexOf(button);
    const previous = buttons.findIndex(candidate => candidate.getAttribute("aria-pressed") === "true");
    const destination = -index * step;
    // Adjacent selections continue from the requested stop while the orbit catches up.
    const origin = Math.abs(index - previous) === 1 ? target : angle;
    target = destination + Math.round((origin - destination) / turn) * turn;
    buttons.forEach(candidate => candidate.setAttribute("aria-pressed", String(candidate === button)));
    if (reducedMotion.matches) return settle();

    // Easing Wizard Glide (0a1h30d), preserving velocity when redirected.
    const decay = 625 / 48;
    const root = Math.sqrt(decay ** 2 - 2063 / 24);
    const slow = (-decay + root) * 1.3;
    const fast = (-decay - root) * 1.3;
    const offset = angle - target;
    const weight = (velocity - fast * offset) / (slow - fast);
    const start = performance.now();
    function tick(now) {
      const seconds = (now - start) / 1000;
      const a = weight * Math.exp(slow * seconds);
      const b = (offset - weight) * Math.exp(fast * seconds);
      angle = target + a + b;
      velocity = a * slow + b * fast;
      if (Math.abs(angle - target) < .0005 && Math.abs(velocity) < .003) return settle();
      paint();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return new Promise(resolve => { complete = resolve; });
  }

  const resize = new ResizeObserver(fitDevice);
  for (const element of [stage, intro, picker]) resize.observe(element);
  compact.addEventListener("change", fitDevice);
  reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) settle(); });
  fitDevice();
  return move;
}
