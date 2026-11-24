import { setupStudio, framingOffset } from "./gift/camera.js?v=english-cards";
import { prepareCopy } from "./motion-copy.js";

export function setupGiftDescent(download, gift, slides, runway, windowFlight, ease, cameraTravel) {
  const sequence = gift.parentElement;
  const content = download.querySelector(".download-layout");
  const night = gift.querySelector(".gift-night");
  const runwayCopy = runway.querySelector(".runway-copy");
  const footer = runway.querySelector(".site-footer");
  for (const column of runwayCopy.querySelectorAll(".runway-partners > div")) {
    prepareCopy(...column.querySelectorAll("h2, p"));
  }
  for (const label of runwayCopy.querySelectorAll(".runway-action-label")) {
    prepareCopy(label);
  }

  function revealRunwayCopy(approach, landing) {
    runway.toggleAttribute("data-copy-visible", approach >= .47);
    runway.style.setProperty("--copy-presence", ease(.46,.74,approach));
    runway.style.setProperty("--actions-presence", ease(.57,.94,approach));
    runway.style.setProperty("--camera-offset", (landing-1)*100 + "dvh");
    runwayCopy.inert = approach < 1;
    footer.inert = runwayCopy.inert;
  }

  const [welcome] = slides;
  const camera = gift.querySelector(".gift-camera");
  const render = setupStudio(camera, download, welcome);
  const welcomePrint = new Image();
  function prepareWelcomePrint() {
    if (welcomePrint.hasAttribute("src")) return;
    welcomePrint.src = new URL("./gift/welcome-print.webp?v=english-cards", import.meta.url);
    void welcomePrint.decode().then(() => {
      sequence.setAttribute("data-welcome-print-ready", "");
    }).catch(() => { /* Keep the existing atlas if the print is unavailable. */ });
  }
  const printObserver = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    printObserver.disconnect();
    prepareWelcomePrint();
  }, { rootMargin: "100% 0px" });
  printObserver.observe(gift);
  const reader = document.getElementById("gift-reader");
  const enlarged = reader.querySelector(".gift-print");
  for (const slide of slides) {
    const card = slide.querySelector("button");
    card.addEventListener("click", () => {
      enlarged.className = card.className;
      enlarged.setAttribute("aria-label", slide.querySelector(".gift-copy").innerText.replace(/\s+/g, " ").trim());
      reader.showModal();
    });
  }
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

  function place(top) {
    night.style.setProperty("--gift-scene-offset", (top - gift.offsetTop) + "px");
  }

  function scrollCamera() {
    download.style.setProperty("--sky-stretch", 1 + travel);
    // Sample the same trajectory a few frames earlier for each depth group.
    // The offsets are reversible and return to zero when the camera settles.
    delays.forEach((delay,index)=>{
      const earlier = cameraTravel(Math.max(0, phase-delay));
      content.style.setProperty("--gift-lag-" + index, (distance*(travel-earlier)) + "px");
    });
    const top = start + distance * travel;
    night.style.setProperty("--gift-scene-offset", (distance * (travel - 1)) + "px");
    window.scrollTo({ top, behavior: "instant" });
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

  let interactiveSlide;
  function setActiveSlide(activeSlide) {
    if (activeSlide === interactiveSlide) return;
    interactiveSlide = activeSlide;
    for (const slide of slides) slide.inert = slide !== activeSlide;
    if (!activeSlide && reader.open) reader.close();
  }

  // The first sheet leads the camera slightly as it clears the sleeve.
  function floatLetter(phase, approach, activeSlide) {
    const sample = value => value <= 0 ? 0 : value >= 1 ? 1 : cameraTravel(value);
    const lift = sample(phase);
    const rising = phase > 0 && phase < 1;
    if (rising && !gift.hasAttribute("data-letter-rising")) {
      gift.toggleAttribute("data-letter-flight", camera.hasAttribute("data-ready"));
    } else if (phase === 0) {
      gift.removeAttribute("data-letter-flight");
    }
    gift.toggleAttribute("data-letter-rising", rising);
    const flying = gift.hasAttribute("data-letter-flight");
    const slip = phase > 0 && !flying ? 1 : sample(phase/.94);
    if (phase > 0 && !gift.hasAttribute("data-airborne")) prepareWelcomePrint();
    setActiveSlide(activeSlide);
    gift.toggleAttribute("data-airborne", phase > 0);
    gift.style.setProperty("--letter-poster", ease(.18,.84,phase));
    // Cover the moving sheet before it leaves the WebGL draw pass at .94.
    welcome.style.setProperty("--welcome-presence", ease(.86,.935,phase));
    const landing = sample(approach);
    gift.style.setProperty("--runway-arrival", landing);
    revealRunwayCopy(approach, landing);
    render(1,1,lift,slip,landing);
  }

  function resetLetter() {
    if (!gift.hasAttribute("data-airborne")) return;
    setActiveSlide(null);
    gift.removeAttribute("data-airborne");
    gift.removeAttribute("data-letter-rising");
    gift.removeAttribute("data-letter-flight");
    gift.style.removeProperty("--letter-poster");
    gift.style.removeProperty("--runway-arrival");
    welcome.style.removeProperty("--welcome-presence");
    night.style.removeProperty("--gift-scene-offset");
    revealRunwayCopy(0, 0);
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
    night.style.removeProperty("--gift-scene-offset");
    if (atGift) render(1, 1);
  }
  return { paint, end, align, holdSky, place, floatLetter, resetLetter };
}
