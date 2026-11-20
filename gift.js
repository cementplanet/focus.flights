import { setupStudio, framingOffset } from "./gift/camera.js?v=tracking-shot";
import { prepareCopy } from "./motion-copy.js";

export function setupGiftDescent(download, gift, windowFlight, ease) {
  const sequence = gift.parentElement;
  const content = download.querySelector(".download-layout");
  const night = gift.querySelector(".gift-night");
  const render = setupStudio(gift.querySelector(".gift-camera"), download);

  for (const line of content.querySelectorAll(".download-label, .download-copy h2, .download-copy p")) {
    prepareCopy(line);
  }

  let position = 0, start = 0, distance = 0;

  function scrollCamera() {
    const travel = position * (1.55 - .55 * position);
    const offset = distance * travel;
    // The sky and every object on it move through the viewport with the page.
    // Keep only the ground camera viewport steady while its world-space eye descends.
    gift.style.setProperty("--camera-offset", (offset - distance) + "px");
    download.style.setProperty("--sky-stretch", 1 + travel);
    window.scrollTo({ top: start + offset, behavior: "instant" });
  }

  function align() {
    start = download.offsetTop;
    distance = gift.offsetTop - start;
    scrollCamera();
  }

  function holdSky(interactive) {
    if (sequence.hasAttribute("data-window-flight") || !download.querySelector(".flight-camera")) {
      windowFlight.end(true);
    }
    content.inert = !interactive;
  }

  function paint(t) {
    position = t;
    if (!sequence.hasAttribute("data-gift-descent")) {
      holdSky(false);
      sequence.setAttribute("data-gift-descent", "");
      align();
    } else {
      scrollCamera();
    }
    render(t);
    download.style.setProperty("--twilight", ease(.055, .39, t));
    night.style.opacity = ease(.12, .41, t);
    night.style.setProperty("--poster-offset", (100 * framingOffset(t)) + "%");
    content.style.setProperty("--gift-exit", Math.min(1, t / .57));
  }

  function end(atGift = false) {
    if (!sequence.hasAttribute("data-gift-descent")) return;
    sequence.removeAttribute("data-gift-descent");
    content.style.removeProperty("--gift-exit");
    download.style.removeProperty("--twilight");
    download.style.removeProperty("--sky-stretch");
    gift.style.removeProperty("--camera-offset");
    night.style.removeProperty("opacity");
    night.style.removeProperty("--poster-offset");
    if (atGift) render(1);
  }
  return { paint, end, align, holdSky };
}
