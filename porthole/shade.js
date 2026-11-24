export function setupWindowShade(porthole) {
  const handle = porthole.querySelector(".shade-control");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = value => Math.max(0, Math.min(1, value));
  let position = 1, target = 1, velocity = 0, frame = 0;
  let active = false, drag, moved = false;

  function paint(value) {
    position = clamp(value);
    porthole.style.setProperty("--shade-drop", position);
    const open = Math.round(100 * (1 - position));
    if (Number(handle.getAttribute("aria-valuenow")) !== open) {
      handle.setAttribute("aria-valuenow", open);
      handle.setAttribute("aria-valuetext", open === 0 ? "Closed" : open === 100 ? "Fully open" : open + "% open");
    }
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function glide(value, rate) {
    stop();
    target = clamp(value);
    if (reduced.matches || position === target && velocity === 0) {
      velocity = 0;
      paint(target);
      return;
    }
    // The two decay rates follow the page's overdamped Glide spring.
    const slow = -3.88 * rate, fast = -22.16 * rate;
    const offset = position - target;
    const a = (velocity - fast * offset) / (slow - fast);
    const b = offset - a;
    const start = performance.now();
    function tick(now) {
      const time = Math.max(0, (now - start) / 1000);
      const x = a * Math.exp(slow * time), y = b * Math.exp(fast * time);
      velocity = slow * x + fast * y;
      if (Math.abs(x + y) < .001 && Math.abs(velocity) < .01) {
        velocity = frame = 0;
        paint(target);
      } else {
        paint(target + x + y);
        frame = requestAnimationFrame(tick);
      }
    }
    frame = requestAnimationFrame(tick);
  }

  paint(1);
  const ready = new MutationObserver(() => {
    if (!porthole.hasAttribute("data-scene-ready")) return;
    ready.disconnect();
    if (active && !drag) glide(0, 1);
  });
  ready.observe(porthole, {attributes:true, attributeFilter:["data-scene-ready"]});
  reduced.addEventListener("change", () => { if (reduced.matches && frame) glide(target, 1); });

  handle.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    stop();
    velocity = 0;
    const travel = parseFloat(getComputedStyle(porthole).getPropertyValue("--shade-travel")) / 100;
    drag = {id:event.pointerId, y:event.clientY, start:position, pixels:porthole.getBoundingClientRect().height * travel};
    moved = false;
    porthole.setAttribute("data-dragging", "");
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const distance = event.clientY - drag.y;
    if (!moved && Math.abs(distance) < 3) return;
    moved = true;
    target = clamp(drag.start + distance / drag.pixels);
    paint(target);
  });

  handle.addEventListener("lostpointercapture", () => {
    drag = undefined;
    porthole.removeAttribute("data-dragging");
  });
  handle.addEventListener("click", event => {
    if (active && (event.detail === 0 || !moved)) glide(target < .01 ? 1 : 0, 2);
    moved = false;
  });
  handle.addEventListener("keydown", event => {
    const steps = { ArrowUp: -.05, ArrowDown: .05, ArrowRight: -.05, ArrowLeft: .05, PageUp: -.25, PageDown: .25 };
    if (event.key === "Home") glide(1, 2);
    else if (event.key === "End") glide(0, 2);
    else if (Object.hasOwn(steps, event.key)) glide(target + steps[event.key], 2);
    else return;
    event.preventDefault();
  });

  return function setActive(next, openForFlight = false) {
    if (active === next && !(openForFlight && (target > 0 || drag))) return;
    active = next;
    if (drag) handle.releasePointerCapture(drag.id);
    if (!active || reduced.matches || porthole.hasAttribute("data-scene-ready")) glide(active ? 0 : 1, active ? 1 : 1.45);
  };
}
