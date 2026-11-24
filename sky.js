import { setupGiftDescent } from "./gift.js?v=gift-sheet-hardware";
import { setupWindowFlight } from "./window-flight.js?v=sky-meteor";
import { setupPortholeSky } from "./porthole/sky.js?v=compact-noise";
import { setupWindowShade } from "./porthole/shade.js?v=static-porthole";
import { prepareCopy, unit } from "./motion-copy.js";
import { cloudDeckBottom, setupClouds } from "./clouds.js?v=compact-noise";
import { startContrails } from "./contrails.js?v=nozzle-alignment";

const night = ["091327", "182a49", "455472", "121c31", "626f8d", 1];
const day = ["457fb2", "87b1d2", "e3e9eb", "4c6380", "f7f5f0", 0];
const phases = [
  [0, night],
  [4.8, night],
  [6.0, ["223451", "6c7a9e", "f0b39f", "343c59", "dba69b", 0.1]],
  [7.2, ["4d81af", "94afca", "f4dfcc", "536980", "fff1db", 0]],
  [10, day],
  [14, day],
  [16, ["427bad", "83a8c9", "e6dbcb", "4d617d", "f7eee2", 0]],
  [17.8, ["384e7d", "8c8fae", "f6bd9c", "514663", "ffd0aa", 0]],
  [19.2, ["17243f", "3e5074", "ad8495", "222d47", "90869d", 0.35]],
  [21, night],
  [24, night],
];

const color = (hex) => hex.match(/../g).map((channel) => parseInt(channel, 16));
const palettes = phases.map(([hour, values]) => [
  hour, values.slice(0, 5).map(color), values[5],
]);

function localHour(now) {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

function sample(hour) {
  const next = palettes.findIndex(([time]) => time > hour);
  const [start, from, fromStars] = palettes[next - 1];
  const [end, to, toStars] = palettes[next];
  const progress = (hour - start) / (end - start);
  const mix = (a, b) => a + (b - a) * progress;
  return [
    from.map((rgb, index) => rgb.map((channel, i) => mix(channel, to[index][i]))),
    mix(fromStars, toStars),
  ];
}

const sky = document.querySelector(".sky");
const canvas = document.querySelector(".stars");
const aircraft = document.querySelector(".aircraft");
const animateContrails = startContrails(aircraft.querySelector(".contrails"));
let contrailsVisible = true;
const ctx = canvas.getContext("2d");
const hero = sky.querySelector(".hero-copy");
const narrowHero = matchMedia("(max-width: 540px), (max-width: 720px) and (min-height: 480px)");
let lastPalette;
for (const copy of hero.querySelectorAll("h1, p")) prepareCopy(copy);
hero.classList.add("motion-ready");

const time = new URLSearchParams(location.search).get("time");
const previewHour = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ? Number(time.slice(0, 2)) + Number(time.slice(3)) / 60
  : null;

function paintSky() {
  const [colors, stars] = sample(previewHour ?? localHour(new Date()));
  if (lastPalette?.stars === stars && colors.every((rgb, i) =>
    rgb.every((channel, j) => channel === lastPalette.colors[i][j]))) return lastPalette;
  ["zenith", "sky", "horizon", "shadow"].forEach((name, i) => {
    sky.style.setProperty("--" + name, `rgb(${colors[i].join(" ")})`);
  });
  sky.style.setProperty("--stars", stars);
  lastPalette = { colors, stars };
  return lastPalette;
}

function paintStars() {
  const width = sky.clientWidth;
  const height = sky.clientHeight;
  const ratio = Math.min(devicePixelRatio, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  let seed = 21957;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const count = Math.round(width * height / 12500);
  for (let i = 0; i < count; i++) {
    const x = random() * width;
    const y = random() * height * 0.54;
    const size = 0.25 + random() ** 3 * 0.7;
    const opacity = (0.22 + random() * 0.66) * (1 - (y / height / 0.54) ** 2);
    ctx.fillStyle = `rgba(222, 231, 251, ${opacity})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.fill();
  }
}

let aircraftDistance;
let aircraftPixelsPerX;
let aircraftPixelsPerY;
let aircraftCenterX;
let aircraftCenterY;

function animateAircraft(seconds) {
  if (contrailsVisible) animateContrails(seconds);
  if (seconds === null) {
    aircraft.style.transform = "";
    return [0, 0];
  }

  // Different response times keep the heave, pitch and bank from moving in lockstep.
  const heave = 3.8 * Math.sin(0.57 * seconds)
    + 1.65 * Math.sin(0.97 * seconds + 0.9)
    + 0.18 * Math.sin(1.85 * seconds + 0.1);
  const drift = 1.55 * Math.sin(0.38 * seconds + 0.8)
    + 0.52 * Math.sin(0.94 * seconds + 2.1);
  const pitch = 0.34 * Math.sin(0.57 * seconds + 1)
    + 0.15 * Math.sin(0.97 * seconds + 1.9);
  const bank = 0.66 * Math.sin(0.38 * seconds + 1.5)
    + 0.18 * Math.sin(0.94 * seconds + 2.55);

  const progress = Math.min(seconds / 1.8, 1);
  const blend = progress * progress * (3 - 2 * progress);
  const x = drift * aircraftPixelsPerX * blend;
  const y = -heave * aircraftPixelsPerY * blend;
  const pitchDegrees = -pitch * blend;
  const bankDegrees = bank * blend;
  aircraft.style.transform = `translate3d(${x}px, ${y}px, 0) perspective(900px) rotateZ(${pitchDegrees}deg) rotateX(${bankDegrees}deg)`;
  return [x / aircraftPixelsPerX, -y / aircraftPixelsPerY];
}

function resizeScene() {
  paintStars();
  const width = Math.max(1, sky.clientWidth);
  const height = Math.max(1, sky.clientHeight);
  const aspect = width / height;
  const narrow = narrowHero.matches;
  const projectionAspect = Math.min(aspect, 2.15);
  const scene = sky.getBoundingClientRect();
  const copy = hero.getBoundingClientRect();
  const gutter = copy.left - scene.left;
  // Measure the opaque silhouette inside the baked 1024 × 512 frame.
  const visibleWidth = 667 / 1024;
  const visibleHeight = 212 / 512;
  const silhouetteX = (174 + 841) / 2 / 1024 - .5;
  const silhouetteY = (120 + 332) / 2 / 512 - .5;
  const planeTop = copy.bottom - scene.top + gutter;
  const preferredPlaneWidth = copy.width * .96 / visibleWidth;
  const planeWidth = narrow
    ? Math.max(1, Math.min(preferredPlaneWidth, (height - gutter - planeTop) * 2 / visibleHeight))
    : preferredPlaneWidth;
  const planeHeight = planeWidth / 2;
  aircraftDistance = 880 * width / (planeWidth * projectionAspect);
  aircraftPixelsPerX = planeWidth / 880;
  aircraftPixelsPerY = height / (aircraftDistance * 0.86);
  aircraft.style.setProperty("--aircraft-pixels-per-y", `${aircraftPixelsPerY}px`);
  aircraft.style.width = `${planeWidth}px`;
  aircraft.style.height = `${planeHeight}px`;
  const columnGap = width - 2 * (gutter + copy.width);
  const visualX = narrow ? width / 2 : width - gutter - copy.width / 2 - columnGap / 4;
  const visualY = narrow ? planeTop + planeHeight * visibleHeight / 2 : copy.top - scene.top + copy.height / 2;
  aircraftCenterX = visualX - planeWidth * silhouetteX;
  aircraftCenterY = visualY - planeHeight * silhouetteY;
  aircraft.style.left = `${aircraftCenterX}px`;
  aircraft.style.top = `${aircraftCenterY}px`;
}

let palette = paintSky();
resizeScene();
window.addEventListener("resize", resizeScene);
new ResizeObserver(resizeScene).observe(hero);
if (previewHour === null) {
  setInterval(() => {
    if (!document.hidden) palette = paintSky();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) palette = paintSky();
  });
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let cloudCamera = { height: 1240, travel: false };
// Fit to EasingWizard Glide (0a1h30d) over a 1.85 s reference duration.
const handoffSpring = { mass: 24, stiffness: 2063, damping: 625 };
const springDecay = handoffSpring.damping / (2 * handoffSpring.mass);
const springRoot = Math.sqrt(springDecay ** 2 - handoffSpring.stiffness / handoffSpring.mass);
const springSlow = -springDecay + springRoot;
const springFast = -springDecay - springRoot;
// Integrate a Glide spring's release as a velocity profile. Run it backwards
// into the crest, then forwards out: both sides meet at full speed with zero
// acceleration. Remove the small terminal residue for a finite, exact stop.
const releaseSlow = .62 * springSlow;
const releaseFast = .62 * springFast;
const endSpeed = (releaseFast*Math.exp(releaseSlow)-releaseSlow*Math.exp(releaseFast))/(releaseFast-releaseSlow);
const endSlope = releaseSlow*releaseFast*(Math.exp(releaseSlow)-Math.exp(releaseFast))/(releaseFast-releaseSlow);
function releaseDistance(t) {
  const area = (releaseFast*Math.expm1(releaseSlow*t)/releaseSlow
    - releaseSlow*Math.expm1(releaseFast*t)/releaseFast)/(releaseFast-releaseSlow);
  return area - endSpeed*t**3*(1-.5*t) - endSlope*t**3*(t/4-1/3);
}
const releaseLength = releaseDistance(1);
function giftTravel(phase) {
  const peak = .36;
  const s = phase < peak ? 1-phase/peak : (phase-peak)/(1-peak);
  return peak + (phase < peak ? -peak : 1-peak)*releaseDistance(s)/releaseLength;
}

let handoffFrame = 0;
let handoffProgress = 0;
let handoffVelocity = 0;
let pageTarget = 0;
let pageOrigin = 0;
const wheelQuietPeriod = 140;
const returnWheelThreshold = 32;
const returnTouchThreshold = 36;
let lastWheelAt = -Infinity;
let lastWheelDown;
let capturedWheelDirection;
let wheelDistance = 0;

function ease(from, to, value) {
  const t = unit((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

const siteHeader = document.querySelector(".site-header");
const showcase = document.getElementById("showcase");
const deepFocus = document.getElementById("deep-focus");

const setShadeActive = setupWindowShade(deepFocus.querySelector(".porthole"));
const setCamera = setupPortholeSky(deepFocus.querySelector(".porthole-frame"));

const download = document.getElementById("download");
const windowFlight = setupWindowFlight(deepFocus, download, ease, setCamera);
const gift = document.getElementById("gift");
const campaignSlides = [...document.querySelectorAll(".gift-letter")];
const runway = document.getElementById("runway");
const sections = [sky, showcase, deepFocus, download, gift, ...campaignSlides, runway];
const giftPage = sections.indexOf(gift);
const firstSlidePage = giftPage + 1;
const runwayPage = sections.indexOf(runway);
const lastSlidePage = runwayPage - 1;
const giftDescent = setupGiftDescent(download, gift, campaignSlides, runway, windowFlight, ease, giftTravel);
const sequence = sky.parentElement;
prepareCopy(...deepFocus.querySelectorAll(".focus-copy h2, .focus-description p"));

const focusTitle = document.getElementById("deep-focus-title");
const glow = document.createElement("span");
glow.className = "focus-title-glow";
glow.setAttribute("aria-hidden", "true");
glow.dataset.title = focusTitle.querySelector(".motion-readable").textContent;
focusTitle.prepend(glow);
new IntersectionObserver(([entry]) => {
  glow.toggleAttribute("data-visible", entry.isIntersecting);
}).observe(focusTitle);

const copyGroups = sections.map(section => section.querySelector('[data-copy-motion="soft-type"]'));
let copyVisit = -1;

function beginCopyVisit(page) {
  if (copyVisit === page) return;
  copyVisit = page;
  const group = copyGroups[page];
  if (!group) return;
  const replay = group.dataset.copyEntry === "playing";
  group.dataset.copyEntry = "waiting";
  // A hash jump or immediate reversal can leave and re-enter in one paint.
  if (replay) group.getAnimations();
}

function revealCopy() {
  const group = copyGroups[copyVisit];
  if (group?.dataset.copyEntry === "waiting") group.dataset.copyEntry = "playing";
}

let departingFocus = false;

function clearFocusHandoff() {
  if (!sequence.hasAttribute("data-focus-handoff")) return;
  deepFocus.style.removeProperty("--return-copy");
  sequence.removeAttribute("data-focus-handoff");
  deepFocus.style.removeProperty("--window-reveal");
}

function alignFocusScene() {
  deepFocus.style.setProperty("--focus-offset", (showcase.offsetTop - deepFocus.offsetTop) + "px");
}

function paintFocusHandoff(progress) {
  if (!sequence.hasAttribute("data-focus-handoff")) {
    alignFocusScene();
    sequence.setAttribute("data-focus-handoff", "");
    window.scrollTo({ top: showcase.offsetTop, behavior: "instant" });
  }
  const position = unit(progress - 1);
  // The archived runway reveal moves a viewport-height feather from bottom to top.
  const t = 1 - Math.pow(1 - position, .65);
  const sweep = ease(0, .86, t);
  const edge = -100 + 200 * sweep;
  const presence = 1 - ease(.26, .70, t);
  showcase.style.setProperty("--showcase-presence", presence);
  showcase.style.setProperty("--showcase-defocus", ease(.16, .61, t));
  deepFocus.style.setProperty("--focus-edge", edge + "%");
  deepFocus.style.setProperty("--porthole-presence", ease(.39, .80, t));
  deepFocus.style.setProperty("--window-reveal", ease(.19, .93, t));
  if (departingFocus) {
    // Stagger the two sets of copy during the return transition.
    deepFocus.style.setProperty("--return-copy", ease(.61, .91, t));
  }
  // Start the visit's own type clock once the text can actually be seen.
  if ((pageTarget === 2 && t >= (departingFocus ? .69 : .28)) ||
      (pageTarget === 1 && t <= .47)) revealCopy();
  const copyPhase = pageTarget === 2 ? 1 : ease(.08, .99, Math.sqrt(position));
  deepFocus.style.setProperty("--title-reveal", copyPhase);
  siteHeader.toggleAttribute("data-on-showcase", edge < 46);
  siteHeader.toggleAttribute("data-on-focus", edge >= 46);
}

function saveSection(page) {
  const hash = "#" + sections[page].id;
  if (location.hash !== hash) history.replaceState(history.state, "", hash);
}

function paintHandoff(progress, travel) {
  const planeExit = ease(.17, .40, progress);
  contrailsVisible = planeExit < 1;
  const drop = unit(progress / .96);
  const distance = 1860 * drop;
  const ground = ease(.44, .91, drop);
  const cloudBlur = 6 * ease(.25, .57, drop) * (1 - ease(.70, .95, drop));
  const previousCloudCamera = cloudCamera;
  cloudCamera = { height: 1240 - distance, travel };
  if (travel !== previousCloudCamera.travel ||
      (cloudCamera.height > cloudDeckBottom) !== (previousCloudCamera.height > cloudDeckBottom)) syncClouds();
  sky.parentElement.style.setProperty("--showcase-reveal", ease(.73, .97, progress));
  aircraft.style.setProperty("--aircraft-travel", 1200 * ease(0, 1, progress));
  siteHeader.style.setProperty("--logo-ink", drop >= .76 + .02 * palette.stars ? "var(--showcase-ink, #202020)" : "#fff");
  siteHeader.style.setProperty("--logo-shadow", ease(.06, .18, drop) * (1 - ease(.71, .76, drop)));
  for (const [key, value] of Object.entries({
    "plane-exit": planeExit,
    "hero-exit": ease(.03, .32, progress),
    "hero-title-progress": 1 - ease(.04, .80, progress),
    "ground-edge": `${145 - 171 * ground}%`,
    "sky-horizon-soften": `${ease(.24, .62, drop) * 100}%`,
    "stars-rise": ease(.10, .37, progress),
    "cloud-blur": `${cloudBlur}px`,
    "cloud-scale": 1 + cloudBlur / 235,
    "cloud-passage": drop,
    "cloud-still-opacity": 1 - ease(.56, .93, drop),
  })) sky.style.setProperty(`--${key}`, value);
}

function paintCampaign(progress, travel, top) {
  giftDescent.place(top);
  giftDescent.floatLetter(unit(progress - giftPage), unit(progress - lastSlidePage),
    travel ? null : campaignSlides[progress - firstSlidePage]);
}

function playPage(target, focusPage = false) {
  cancelLinkFade();
  if (target === pageTarget) return false;
  // Keep this choreography through interruptions so redirecting the spring
  // samples the same image at the same position.
  if (!handoffFrame) departingFocus = handoffProgress === 2;
  const leavingControl = sections.some(section => section !== sections[target] && section.contains(document.activeElement));
  pageOrigin = pageTarget;
  pageTarget = target;
  beginCopyVisit(target);
  if (target >= 3 || handoffProgress > 2) setShadeActive(true, true);
  else if (target !== 2) setShadeActive(false);
  saveSection(target);
  const cloudTransition = handoffProgress < 1 || Math.min(pageOrigin, target) === 0;
  cancelAnimationFrame(handoffFrame);

  function paintPage(progress, travel) {
    if (cloudTransition) {
      sky.toggleAttribute("data-handoff", travel && progress < 1);
      paintHandoff(unit(progress), travel && progress < 1);
    }
    if (progress >= giftPage) {
      clearFocusHandoff();
      giftDescent.end(true);
      giftDescent.holdSky(false);
      const from = Math.min(Math.floor(progress), lastSlidePage);
      const phase = unit(progress - from);
      const offset = from === giftPage || from === lastSlidePage ? giftTravel(phase) : phase;
      const top = sections[from].offsetTop + offset * (sections[from + 1].offsetTop - sections[from].offsetTop);
      paintCampaign(progress, travel, top);
      window.scrollTo({ top, behavior: "instant" });
      siteHeader.removeAttribute("data-on-showcase");
      siteHeader.setAttribute("data-on-focus", "");
      return;
    }
    giftDescent.resetLetter();
    if (travel && (progress > 3 || (progress === 3 && (target === giftPage || sequence.hasAttribute("data-gift-descent"))))) {
      clearFocusHandoff();
      giftDescent.paint(unit(progress - 3));
      siteHeader.removeAttribute("data-on-showcase");
      siteHeader.setAttribute("data-on-focus", "");
      return;
    }
    giftDescent.end();
    if (travel && progress > 2) {
      clearFocusHandoff();
      windowFlight.paint(unit(progress - 2), target === 3);
      if (target === 2 && progress <= 2.45) revealCopy();
      siteHeader.removeAttribute("data-on-showcase");
      siteHeader.setAttribute("data-on-focus", "");
      return;
    }
    if (!travel && target >= 3) giftDescent.holdSky(target === 3);
    else windowFlight.end(false);
    if (travel && progress > 1) {
      setShadeActive(target >= 2);
      paintFocusHandoff(progress);
      return;
    }
    clearFocusHandoff();
    if ((target === 0 && progress < .52) || (target === 1 && progress >= .82)) revealCopy();
    const top = travel ? showcase.offsetTop * ease(.42, .985, progress) : sections[target].offsetTop;
    window.scrollTo({ top, behavior: "instant" });
  }

  function settle() {
    handoffFrame = 0;
    handoffProgress = target;
    handoffVelocity = 0;
    setShadeActive(target >= 2);
    revealCopy();
    paintPage(target, false);
    if (target !== 2) deepFocus.removeAttribute("data-anchor-entry");
    syncHeader();
    sky.removeAttribute("data-handoff");
    setInteractivePage(target);
    if (focusPage || leavingControl) {
      (target === 0 ? sequence : sections[target]).focus({ preventScroll: true });
    }
  }

  if (reducedMotion.matches || (cloudTransition && sky.hasAttribute("data-clouds-static"))) {
    settle();
    return true;
  }

  sky.toggleAttribute("data-handoff", cloudTransition && handoffProgress < 1);
  const start = performance.now();
  const offset = handoffProgress - target;
  // Reversing a running spring carries its current position and velocity.
  const farthest = Math.max(pageOrigin, target);
  const insideCampaign = target >= firstSlidePage && target <= lastSlidePage &&
    handoffProgress >= firstSlidePage && handoffProgress <= lastSlidePage;
  const giftTrack = !insideCampaign && ((target >= 3 && handoffProgress >= 3) || (target === giftPage && handoffProgress > 2.9));
  // Page progress is the reversible shot clock; the camera and the paper
  // sample independent tracks so the flap doesn't inherit the camera's peak speed.
  const giftStart = Math.min(3, handoffProgress);
  const returning = target < handoffProgress;
  const descentSeconds = returning ? 1.25 : 2.55;
  const unfoldSeconds = returning ? 1.10 : 2.75;
  const slideSeconds = .76;
  const landingSeconds = returning ? .95 : 1.55;
  const lastSlideTime = unfoldSeconds + (lastSlidePage - firstSlidePage) * slideSeconds;
  const secondsPerPage = page => page < giftPage ? descentSeconds : page < firstSlidePage ? unfoldSeconds :
    page < lastSlidePage ? slideSeconds : landingSeconds;
  // A clock with different durations for the studio, slides, and landing keeps
  // the camera on the same shot when a gesture redirects it partway through.
  function giftTime(page) {
    if (page <= giftPage) return (page - giftPage) * descentSeconds;
    if (page <= firstSlidePage) return (page - giftPage) * unfoldSeconds;
    if (page <= lastSlidePage) return unfoldSeconds + (page - firstSlidePage) * slideSeconds;
    return lastSlideTime + (page - lastSlidePage) * landingSeconds;
  }
  function giftProgress(time) {
    if (time <= 0) return giftPage + time / descentSeconds;
    if (time <= unfoldSeconds) return giftPage + time / unfoldSeconds;
    if (time <= lastSlideTime) return firstSlidePage + (time - unfoldSeconds) / slideSeconds;
    return lastSlidePage + (time - lastSlideTime) / landingSeconds;
  }
  const targetTime = giftTime(target);
  const timeOffset = giftTime(handoffProgress) - targetTime;
  const giftDuration = Math.max(.18 * secondsPerPage(Math.max(target, handoffProgress)), Math.abs(timeOffset));
  const rate = farthest === giftPage ? .63 : farthest === 3 ? .51 : farthest === 2 ? .8 : 1;
  const slowRate = springSlow * rate;
  const fastRate = springFast * rate;
  const slowOffset = (handoffVelocity - fastRate*offset)/(slowRate-fastRate);
  const fastOffset = offset-slowOffset;
  const entryVelocity = handoffVelocity;
  function glide(seconds) {
    if (giftTrack) {
      const t = unit(seconds/giftDuration);
      const velocity = -timeOffset/giftDuration;
      const incoming = entryVelocity * secondsPerPage(handoffProgress);
      const inertia = incoming ? incoming-velocity : 0;
      const tail = 1-t;
      const time = targetTime + timeOffset*tail + inertia*giftDuration*t*tail**6;
      const page = giftProgress(time);
      const scale = secondsPerPage(page);
      return [page - target, (velocity + inertia*tail**5*(1-7*t))/scale];
    }
    const slow = slowOffset*Math.exp(slowRate*seconds);
    const fast = fastOffset*Math.exp(fastRate*seconds);
    return [slow+fast, slowRate*slow+fastRate*fast];
  }

  function play(now) {
    const seconds = Math.max(0, (now - start) / 1000);
    const [displacement, speed] = glide(seconds);
    handoffVelocity = speed;

    const finished = giftTrack ? seconds >= giftDuration
      : Math.abs(displacement) < .002 && Math.abs(handoffVelocity) < .022;
    if (reducedMotion.matches || finished) {
      settle();
      return;
    }

    handoffProgress = giftTrack ? Math.max(giftStart, Math.min(sections.length-1, target + displacement)) : target + displacement;
    paintPage(handoffProgress, true);
    handoffFrame = requestAnimationFrame(play);
  }

  handoffFrame = requestAnimationFrame(play);
  return true;
}

const fadeLayer = document.querySelector(".section-fade");
let linkFade;
let linkTarget;

function cancelLinkFade() {
  if (!linkFade) return;
  linkFade.onfinish = null;
  linkFade.cancel();
  linkFade = null;
}

function showLinkedSection() {
  saveSection(linkTarget);
  restoreSection();
  (linkTarget === 0 ? sequence : sections[linkTarget]).focus({preventScroll:true});
}

function fadeToSection(target) {
  linkTarget = target;
  if (reducedMotion.matches) {
    cancelLinkFade();
    showLinkedSection();
    return;
  }
  if (linkFade) {
    // A second click during fade-out changes the destination. During reveal,
    // turn the same animation back toward black from its current opacity.
    if (linkFade.playbackRate < 0) linkFade.reverse();
    return;
  }
  linkFade = fadeLayer.animate([{opacity:0}, {opacity:1}], {
    duration:250, easing:getComputedStyle(fadeLayer).getPropertyValue("--button-press").trim(), fill:"both"
  });
  linkFade.onfinish = () => {
    if (linkFade.playbackRate < 0) { cancelLinkFade(); return; }
    showLinkedSection();
    linkFade.reverse();
  };
}

for (const link of document.querySelectorAll('.site-header a[href^="#"], .hero-explore')) {
  link.addEventListener("click", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = sections.findIndex(section => "#" + section.id === link.hash);
    if (target < 0) return;
    event.preventDefault();
    if (target !== pageTarget || handoffFrame || linkFade) fadeToSection(target);
  });
}

function stepPage(down, focusPage = false) {
  const nearingNextScreen = (pageTarget >= 1 && pageTarget <= giftPage) && Math.abs(handoffProgress - pageTarget) <= .10;
  const onCampaign = pageTarget >= firstSlidePage && pageTarget <= lastSlidePage;
  if (handoffFrame && !nearingNextScreen && !onCampaign && down === (pageTarget > pageOrigin)) return true;
  const target = Math.max(0, Math.min(sections.length - 1, pageTarget + (down ? 1 : -1)));
  return playPage(target, focusPage);
}

window.addEventListener("wheel", event => {
  if (event.ctrlKey || event.defaultPrevented || !event.deltaY) return;
  const now = event.timeStamp;
  const down = event.deltaY > 0;
  const returning = !down && pageTarget > 0;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
    if (returning) event.preventDefault();
    return;
  }
  const newGesture = now - lastWheelAt > wheelQuietPeriod;
  if (newGesture) {
    capturedWheelDirection = undefined;
  }
  if (newGesture || down !== lastWheelDown) wheelDistance = 0;
  lastWheelAt = now;
  lastWheelDown = down;
  // Only a deliberate reversal or a new gesture can consume another step.
  if (capturedWheelDirection === down) {
    event.preventDefault();
    return;
  }

  if (returning) {
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? window.innerHeight : 1;
    wheelDistance += Math.abs(event.deltaY) * scale;
    if (wheelDistance < returnWheelThreshold) return;
  }

  if (!stepPage(down)) return;
  capturedWheelDirection = down;
  wheelDistance = 0;
  if (!event.defaultPrevented && event.cancelable) event.preventDefault();
}, { passive: false });

let touchOrigin;
let touchHandoff = false;
window.addEventListener("touchstart", event => {
  touchHandoff = false;
  touchOrigin = event.touches.length === 1 && !event.target.closest?.(".shade-control")
    ? event.touches[0] : undefined;
}, { passive: true });
window.addEventListener("touchmove", event => {
  if (!touchOrigin || event.touches.length !== 1) return;
  if (touchHandoff) { if (event.cancelable) event.preventDefault(); return; }
  const { clientX, clientY } = event.touches[0];
  const dy = touchOrigin.clientY - clientY;
  const dx = Math.abs(touchOrigin.clientX - clientX);
  if (dy < 0 && pageTarget > 0) {
    if (event.cancelable) event.preventDefault();
    if (-dy < returnTouchThreshold || -dy < dx * 1.25) return;
  }
  if (Math.abs(dy) < 5 || Math.abs(dy) <= dx) return;
  const down = dy > 0;
  touchHandoff ||= stepPage(down);
  if (touchHandoff && event.cancelable) event.preventDefault();
}, { passive: false });
for (const type of ["touchend", "touchcancel"]) {
  window.addEventListener(type, () => { touchOrigin = undefined; }, { passive: true });
}

window.addEventListener("keydown", event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
  if (event.target.closest?.("input, textarea, select, [contenteditable=true]")) return;
  const space = event.key === " " && !event.target.closest?.("a, button, input");
  if (event.shiftKey && !space) return;
  const down = event.key === "PageDown" || event.key === "ArrowDown" || (space && !event.shiftKey);
  const up = event.key === "PageUp" || event.key === "ArrowUp" || (space && event.shiftKey);
  if (!down && !up) return;
  if (event.repeat || stepPage(down, true)) {
    event.preventDefault();
  }
});

function syncHeader() {
  if (sequence.hasAttribute("data-focus-handoff")) return;
  const header = siteHeader.getBoundingClientRect();
  const midpoint = header.top + header.height / 2;
  const onFocus = deepFocus.getBoundingClientRect().top <= midpoint;
  siteHeader.toggleAttribute("data-on-focus", onFocus);
  siteHeader.toggleAttribute("data-on-showcase", !onFocus && showcase.getBoundingClientRect().top <= midpoint);
}

function setInteractivePage(page) {
  sections.forEach((section, index) => { section.inert = index !== page; });
}

function applyRestingSection(page) {
  handoffProgress = pageOrigin = pageTarget = page;
  beginCopyVisit(page);
  revealCopy();
  setShadeActive(page >= 2);
  giftDescent.end(page >= giftPage);
  if (page >= giftPage) paintCampaign(page, false, sections[page].offsetTop);
  else giftDescent.resetLetter();
  if (page >= 3) giftDescent.holdSky(page === 3);
  else windowFlight.end(false);
  setInteractivePage(page);
  paintHandoff(Math.min(page, 1), false);
}

function syncScroll() {
  syncHeader();
  if (handoffFrame) return;
  const top = window.scrollY;
  const page = sections.findIndex(section => Math.abs(top - section.offsetTop) < 2);
  if (page < 0 || page === pageTarget) return;
  saveSection(page);
  applyRestingSection(page);
}

function restoreSection() {
  const page = sections.findIndex(section => "#" + section.id === location.hash);
  if (page < 0) {
    syncScroll();
    beginCopyVisit(pageTarget);
    revealCopy();
    setInteractivePage(pageTarget);
    return;
  }
  deepFocus.toggleAttribute("data-anchor-entry", page === 2);
  cancelAnimationFrame(handoffFrame);
  handoffFrame = handoffVelocity = 0;
  clearFocusHandoff();
  sky.removeAttribute("data-handoff");
  applyRestingSection(page);
  window.scrollTo({ top: sections[page].offsetTop, behavior: "instant" });
  syncHeader();
}

const syncClouds = setupClouds(document.querySelector(".clouds"), () => palette, {
  distance: () => aircraftDistance,
  animate: animateAircraft,
  position: () => [
    (aircraftCenterX - sky.clientWidth / 2) / aircraftPixelsPerX,
    125 - (aircraftCenterY - sky.clientHeight * .548) / aircraftPixelsPerY,
  ],
}, () => cloudCamera, reducedMotion);

restoreSection();
window.addEventListener("hashchange", () => { cancelLinkFade(); restoreSection(); });
window.addEventListener("pageshow", restoreSection);
window.addEventListener("resize", () => {
  if (sequence.hasAttribute("data-focus-handoff")) {
    alignFocusScene();
    window.scrollTo({ top: showcase.offsetTop, behavior: "instant" });
  }
  if (sequence.hasAttribute("data-gift-descent")) {
    giftDescent.align();
  } else if (sequence.hasAttribute("data-window-flight")) {
    window.scrollTo({ top: download.offsetTop, behavior: "instant" });
    windowFlight.measure();
    windowFlight.paint(unit(handoffProgress - 2), pageTarget === 3);
  } else if (!handoffFrame && pageTarget >= 3) {
    windowFlight.end(true);
    giftDescent.holdSky(pageTarget === 3);
  }
  if (!handoffFrame && pageTarget > 0) {
    const top = sections[pageTarget].offsetTop;
    if (pageTarget >= giftPage) giftDescent.place(top);
    window.scrollTo({ top, behavior: "instant" });
  }
  syncScroll();
});
window.addEventListener("scroll", syncScroll, { passive: true });
