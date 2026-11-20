import { setupStudio, skyPitch } from "./gift/camera.js?v=ground-letter";
import { prepareCopy } from "./motion-copy.js";

export function setupGiftDescent(download, gift, windowFlight, ease) {
  const sequence = gift.parentElement;
  const content = download.querySelector(".download-layout");
  const night = gift.querySelector(".gift-night");
  const render = setupStudio(gift.querySelector(".gift-camera"), download);

  for (const line of content.querySelectorAll(".download-label, .download-copy h2, .download-copy p")) {
    prepareCopy(line);
  }

  const initialPitch = skyPitch(0);
  let skySurface;

  function align() {
    window.scrollTo({ top: download.offsetTop, behavior: "instant" });
  }

  function holdSky(interactive) {
    if (sequence.hasAttribute("data-window-flight") || !download.querySelector(".flight-camera")) {
      windowFlight.end(true);
    }
    content.inert = !interactive;
  }

  function paint(position) {
    if (!sequence.hasAttribute("data-gift-descent")) {
      holdSky(false);
      skySurface = download.querySelector(".flight-camera:last-child") || download.querySelector(".flight-camera");
      sequence.setAttribute("data-gift-descent", "");
      align();
    }
    render(position);
    // Grade the sky before the ground comes through. Copy sits above both
    // exposures so its ink can lose focus while it is still legible.
    download.style.setProperty("--twilight", ease(0, .38, position));
    night.style.opacity = ease(.105, .54, position);
    content.style.setProperty("--gift-exit", Math.min(1, position / .44));
    const tilt = Math.tanh(initialPitch - skyPitch(position));
    content.style.transform = `translate3d(0, ${-6.8 * tilt}%, 0)`;
    if (skySurface) skySurface.style.transform = `scaleY(${1 + .23 * tilt})`;
  }

  function end(atGift = false) {
    if (!sequence.hasAttribute("data-gift-descent")) return;
    sequence.removeAttribute("data-gift-descent");
    content.style.removeProperty("transform");
    content.style.removeProperty("--gift-exit");
    download.style.removeProperty("--twilight");
    night.style.removeProperty("opacity");
    skySurface?.style.removeProperty("transform");
    if (atGift) render(1);
  }
  return { paint, end, align, holdSky };
}
