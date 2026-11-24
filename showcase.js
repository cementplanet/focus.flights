import { prepareCopy } from "./motion-copy.js";
import { setupDeviceLiquid } from "./device-liquid.js?v=dark-mode";
import { setupDevicePlayback } from "./device-playback.js?v=front-index";
import { setupDeviceOrbit } from "./device-orbit.js?v=transform-orbit";

const section = document.querySelector(".showcase");
const copy = section.querySelector(".showcase-copy");
const stage = section.querySelector(".showcase-stage");
const devices = [...section.querySelectorAll("button[data-device]")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const moveLiquid = setupDeviceLiquid(section.querySelector(".showcase-devices"), devices[0], reducedMotion);
setupDeviceLiquid(section.querySelector(".flight-playback-action"), null, reducedMotion);
const moveOrbit = setupDeviceOrbit(stage, devices, reducedMotion);
const syncPlayback = setupDevicePlayback(stage, devices, reducedMotion, moveOrbit, moveLiquid);

// Keep the selected device with this history entry, including across reloads.
const remembered = devices.find(button => button.dataset.device === history.state?.showcaseDevice);
if (remembered && remembered !== devices[0]) remembered.click();
section.querySelector(".showcase-devices").addEventListener("click", event => {
  const button = event.target.closest("button[data-device]");
  if (button) history.replaceState({ ...history.state, showcaseDevice: button.dataset.device }, "");
});

prepareCopy(copy);
copy.dataset.typeReady = "";
new IntersectionObserver(entries => {
  const inView = entries.at(-1).intersectionRatio >= .72;
  if (inView === copy.hasAttribute("data-visible")) return;
  copy.toggleAttribute("data-visible", inView);
}, { rootMargin: "-16px 0px -120px", threshold: .72 }).observe(copy);

const sequence = section.parentElement;
function updatePlayback() {
  const rect = stage.getBoundingClientRect();
  const visibleHeight = Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top);
  syncPlayback(sequence.hasAttribute("data-focus-handoff") || (rect.height > 0 && visibleHeight >= .25 * rect.height));
}
new MutationObserver(updatePlayback).observe(sequence, {attributes: true, attributeFilter: ["data-focus-handoff"]});
new IntersectionObserver(updatePlayback, {threshold: .25}).observe(stage);
