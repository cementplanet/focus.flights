import { setupStudio, framingOffset } from "./gift/camera.js?v=runway-extension";
import { prepareCopy } from "./motion-copy.js";

export function setupGiftDescent(download, gift, windowFlight, ease, cameraTravel) {
  const sequence = gift.parentElement;
  const content = download.querySelector(".download-layout");
  const night = gift.querySelector(".gift-night");
  const runway = document.getElementById("runway");
  const runwayCopy = runway.querySelector(".runway-copy");
  const footer = document.getElementById("footer");
  for (const column of runwayCopy.querySelectorAll(".runway-partners > div")) {
    prepareCopy(...column.querySelectorAll("h2, p"));
  }
  for (const label of runwayCopy.querySelectorAll(".runway-action-label")) {
    prepareCopy(label);
  }

  function revealRunwayCopy(approach, landing, extension) {
    const copyPresence = 1 - ease(0, .44, extension);
    runway.toggleAttribute("data-copy-visible", approach >= .47 && copyPresence > 0);
    runway.style.setProperty("--copy-presence", ease(.46, .74, approach) * copyPresence);
    runway.style.setProperty("--actions-presence", ease(.57, .94, approach) * copyPresence);
    runway.style.setProperty("--camera-offset", (landing - 1) * 100 + "dvh");
    runwayCopy.inert = approach < 1 || extension > 0;

    footer.style.setProperty("--footer-presence", ease(.25, .88, extension));
    footer.inert = extension < 1;
  }

  const letter = document.querySelector("#letter");
  const row = letter.querySelector(".gift-card-row");
  const render = setupStudio(gift.querySelector(".gift-camera"), download, row);
  const reader = letter.querySelector(".gift-reader");
  const enlarged = reader.querySelector(".gift-print");
  row.addEventListener("click", event => {
    const card = event.target.closest("button[data-print]");
    if (!card) return;
    enlarged.className = "gift-print " + card.dataset.print;
    enlarged.setAttribute("aria-label", card.getAttribute("aria-description"));
    reader.showModal();
  });
  reader.addEventListener("click", event => {
    if (event.target === reader || event.target.closest("button")) reader.close();
  });
  // Keep the document's slide navigation idle while a card is being read.
  for (const event of ["keydown", "wheel", "touchstart", "touchmove"]) {
    reader.addEventListener(event, e => e.stopPropagation());
  }

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

  // Overlapping samples of Glide start together. The sheet leads the camera
  // slightly, then the camera finishes framing it after the sleeve clears.
  function floatLetter(phase, approach = 0, extension = 0) {
    const sample = value => value <= 0 ? 0 : value >= 1 ? 1 : cameraTravel(value);
    const lift = sample(phase);
    const slip = sample(phase/.94);
    row.inert = phase < 1 || approach > 0;
    if (row.inert && reader.open) reader.close();
    gift.toggleAttribute("data-airborne", phase > 0);
    gift.style.setProperty("--letter-poster", ease(.18,.84,phase));
    const landing = sample(approach);
    gift.style.setProperty("--runway-arrival", landing);
    const runwayExtension = sample(extension);
    gift.style.setProperty("--runway-extension", runwayExtension);
    revealRunwayCopy(approach, landing, runwayExtension);
    render(1, 1, lift, slip, landing, runwayExtension);
  }

  function resetLetter() {
    if (!gift.hasAttribute("data-airborne")) return;
    row.inert = true;
    if (reader.open) reader.close();
    gift.removeAttribute("data-airborne");
    gift.style.removeProperty("--letter-poster");
    gift.style.removeProperty("--runway-arrival");
    gift.style.removeProperty("--runway-extension");
    revealRunwayCopy(0, 0, 0);
    render(1,1);
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
  return { paint, end, align, holdSky, floatLetter, resetLetter };
}
