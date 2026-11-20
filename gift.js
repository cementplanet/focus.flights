import { setupStudio, skyPitch } from "./gift/camera.js";

export function setupGiftDescent(download, gift, windowFlight, ease) {
  const sequence = gift.parentElement;
  const content = download.querySelector(".download-layout");
  const night = gift.querySelector(".gift-night");
  const render = setupStudio(gift.querySelector(".gift-camera"), download);

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
    content.style.opacity = 1 - ease(.10, .56, position);
    const tilt = Math.tan(initialPitch - skyPitch(position));
    content.style.transform = `translate3d(0, ${-92 * tilt}%, 0)`;
    if (skySurface) skySurface.style.transform = `scaleY(${1 + .48 * tilt})`;
  }

  function end(atGift = false) {
    if (!sequence.hasAttribute("data-gift-descent")) return;
    sequence.removeAttribute("data-gift-descent");
    content.style.removeProperty("transform");
    content.style.removeProperty("opacity");
    night.style.removeProperty("opacity");
    skySurface?.style.removeProperty("transform");
    if (atGift) render(1);
  }
  return { paint, end, align, holdSky };
}
