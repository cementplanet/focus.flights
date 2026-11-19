export function setupWindowShade(porthole) {
  const handle = porthole.querySelector(".shade-control");
  let position = 1 - Number(handle.getAttribute("aria-valuenow")) / 100;
  let drag;
  let moved = false;

  function setPosition(value) {
    position = Math.max(0, Math.min(1, value));
    porthole.style.setProperty("--shade-drop", position);
    const open = Math.round(100 * (1 - position));
    handle.setAttribute("aria-valuenow", open);
    handle.setAttribute("aria-valuetext", open === 0 ? "Closed" : open === 100 ? "Fully open" : open + "% open");
  }

  handle.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    const style = getComputedStyle(porthole);
    const start = parseFloat(style.getPropertyValue("--shade-drop"));
    const travel = parseFloat(style.getPropertyValue("--shade-travel")) / 100;
    drag = { id: event.pointerId, y: event.clientY, start, pixels: porthole.getBoundingClientRect().height * travel };
    moved = false;
    porthole.setAttribute("data-dragging", "");
    setPosition(start);
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const distance = event.clientY - drag.y;
    if (!moved && Math.abs(distance) < 3) return;
    moved = true;
    setPosition(drag.start + distance / drag.pixels);
  });

  handle.addEventListener("lostpointercapture", () => {
    drag = undefined;
    porthole.removeAttribute("data-dragging");
  });
  handle.addEventListener("click", event => {
    if (event.detail === 0 || !moved) setPosition(position < .01 ? 1 : 0);
    moved = false;
  });
  handle.addEventListener("keydown", event => {
    const steps = { ArrowUp: -.05, ArrowDown: .05, ArrowRight: -.05, ArrowLeft: .05, PageUp: -.25, PageDown: .25 };
    if (event.key === "Home") setPosition(1);
    else if (event.key === "End") setPosition(0);
    else if (Object.hasOwn(steps, event.key)) setPosition(position + steps[event.key]);
    else return;
    event.preventDefault();
  });
}
