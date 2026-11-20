import { setupStudio, skyPitch } from "./gift/camera.js?v=unprinted";
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
    // The distant sky loses exposure as the camera looks down into the studio.
    night.style.opacity = ease(0, .56, position);
    content.style.setProperty("--gift-reveal", 1 - ease(.006, .55, position));
    const tilt = Math.tan(initialPitch - skyPitch(position));
    // Keep the resolving letters below the fixed header during the tilt.
    content.style.transform = `translate3d(0, ${-26 * tilt}%, 0)`;
    if (skySurface) skySurface.style.transform = `scaleY(${1 + .48 * tilt})`;
  }

  function end(atGift = false) {
    if (!sequence.hasAttribute("data-gift-descent")) return;
    sequence.removeAttribute("data-gift-descent");
    content.style.removeProperty("transform");
    content.style.removeProperty("--gift-reveal");
    night.style.removeProperty("opacity");
    skySurface?.style.removeProperty("transform");
    if (atGift) render(1);
  }
  return { paint, end, align, holdSky };
}
