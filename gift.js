import { setupStudio, framingOffset } from "./gift/camera.js?v=paper-settle";
import { prepareCopy } from "./motion-copy.js";

export function setupGiftDescent(download, gift, windowFlight, ease, cameraTravel) {
  const sequence = gift.parentElement;
  const content = download.querySelector(".download-layout");
  const night = gift.querySelector(".gift-night");
  const render = setupStudio(gift.querySelector(".gift-camera"), download);

  for (const line of content.querySelectorAll(".download-label, .download-copy h2, .download-copy p")) {
    prepareCopy(line);
  }

  let phase = 0, travel = 0, start = 0, distance = 0;
  const delays = [.009, .018, .027, .036];

  function scrollCamera() {
    download.style.setProperty("--sky-stretch", 1 + travel);
    // Sample the same trajectory a few frames earlier for each depth group.
    // The offsets are reversible and return to zero when the camera settles.
    delays.forEach((delay,index)=>{
      const earlier = cameraTravel(Math.max(0, phase-delay));
      content.style.setProperty("--gift-lag-" + index, (distance*(travel-earlier)) + "px");
    });
    window.scrollTo({ top: start + distance*travel, behavior: "instant" });
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
    phase = t;
    travel = cameraTravel(phase);
    if (!sequence.hasAttribute("data-gift-descent")) {
      holdSky(false);
      sequence.setAttribute("data-gift-descent", "");
      align();
    } else {
      scrollCamera();
    }
    render(travel, phase);
    download.style.setProperty("--twilight", ease(.055, .39, travel));
    night.style.opacity = ease(.12, .41, travel);
    night.style.setProperty("--poster-offset", (100 * framingOffset(travel)) + "%");
    content.style.setProperty("--gift-exit", Math.min(1, travel / .57));
  }

  function end(atGift = false) {
    if (!sequence.hasAttribute("data-gift-descent")) return;
    sequence.removeAttribute("data-gift-descent");
    content.style.removeProperty("--gift-exit");
    download.style.removeProperty("--twilight");
    download.style.removeProperty("--sky-stretch");
    delays.forEach((_, index)=>content.style.removeProperty("--gift-lag-" + index));
    night.style.removeProperty("opacity");
    night.style.removeProperty("--poster-offset");
    if (atGift) render(1, 1);
  }
  return { paint, end, align, holdSky };
}
