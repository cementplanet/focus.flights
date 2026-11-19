let pressedButton;

window.addEventListener("pointerdown", event => {
  if (event.pointerType !== "touch" || !event.isPrimary) return;
  pressedButton = event.target.closest(".aqua-button, .hero-actions a, .showcase-controls button:not(:disabled)");
  pressedButton?.setAttribute("data-touch-pressed", "");
}, { passive: true });

for (const type of ["pointerup", "pointercancel"]) {
  window.addEventListener(type, event => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    pressedButton?.removeAttribute("data-touch-pressed");
    pressedButton = null;
  }, { passive: true });
}
