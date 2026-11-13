import { startClouds } from "./clouds.js?v=cloud-perf";
import { startEarth } from "./earth.js?v=viewport-render";

import { startDepartures } from "./departures.js?v=row-glide";

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
const ctx = canvas.getContext("2d");
const earth = document.querySelector(".earth");
const departures = document.querySelector(".departures");
const sequence = document.querySelector(".flight-sequence");
const earthVisual = earth.querySelector(".earth-visual");
const skyHeader = sky.querySelector(".sky-header");
const earthMap = earth.querySelector(".earth-map");
fetch(new URL("./brand/world-map-dots.svg", import.meta.url))
  .then(response => response.ok ? response.text() : "")
  .then(source => {
    const bands = Array.from({length: 96}, () => []);
    for (const [dot, x, y] of source.matchAll(/M(\d+) (\d+)h0/g)) {
      const stagger = ((Number(x) * 37 + Number(y) * 61) % 97) / 97;
      const band = Math.floor((Number(x) / 125 * .84 + stagger * .16) * bands.length);
      bands[band].push(dot);
    }
    earthMap.append(...bands.flatMap((dots, index) => {
      if (!dots.length) return [];
      const path = document.createElementNS(earthMap.namespaceURI, "path");
      path.setAttribute("d", dots.join(""));
      path.style.setProperty("--dot-start", index / bands.length * .91);
      return [path];
    }));
  })
  .catch(error => console.warn("Could not load the decorative world map:", error));
let glyphIndex = 0;
for (const line of earth.querySelectorAll(".earth-copy h2, .earth-copy p")) {
  const original = document.createElement("span");
  original.className = "earth-copy-text";
  original.append(...line.childNodes);
  const animated = document.createElement("span");
  animated.setAttribute("aria-hidden", "true");
  for (const node of original.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) {
      animated.append(node.cloneNode(true));
      continue;
    }
    animated.append(...Array.from(node.textContent, letter => {
      const glyph = document.createElement("span");
      glyph.className = "earth-glyph";
      glyph.style.setProperty("--glyph-start", glyphIndex++ * .047);
      glyph.textContent = letter;
      return glyph;
    }));
  }
  line.append(original, animated);
  glyphIndex++;
}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const paintEarth = startEarth(earth, () => sky.hasAttribute("data-night"), reducedMotion);
const paintDepartures = startDepartures(departures, reducedMotion);
const scenes = [sequence, earth, departures];
let camera = { height: 1240, travel: false };
let lastCameraProgress;
let previousNight;
let lastPalette;
let progress = 0;
let copyProgress = 0;
let velocity = 0;
let destination = 0;
let sceneFrame;
let focusAfter;
let wheelDistance = 0;
let lastWheel = -Infinity;
let wheelDirection = 0;
let wheelConsumed = false;
let touchStart;

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
  const dark = stars >= 0.48;
  sky.toggleAttribute("data-night", dark);
  if (dark !== previousNight) {
    previousNight = dark;
    paintScene();
  }

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
let aircraftRadiusX;
let aircraftRadiusY;
let lastPointer;
let lastFlightTime;
let pointerGustArmed = true;
const gusts = [];

function handlePointerMove(event) {
  if (event.pointerType !== "mouse" || lastFlightTime === undefined || camera.travel || destination !== 0) return;

  const previous = lastPointer;
  lastPointer = { x: event.clientX, y: event.clientY, time: event.timeStamp };
  const interval = previous ? event.timeStamp - previous.time : Infinity;
  if (interval > 150) {
    pointerGustArmed = true;
    return;
  }

  const endX = (event.clientX - aircraftCenterX) / aircraftRadiusX;
  const endY = (event.clientY - aircraftCenterY) / aircraftRadiusY;
  if (endX ** 2 + endY ** 2 > 1.15) pointerGustArmed = true;
  if (!pointerGustArmed || lastFlightTime - (gusts.at(-1)?.start ?? -Infinity) < 0.62) return;

  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  const speed = Math.hypot(dx, dy) * 1000 / Math.max(8, interval);
  if (speed < 210) return;

  // Find where the sweep passed closest to the aircraft, including between pointer events.
  const stepX = dx / aircraftRadiusX;
  const stepY = dy / aircraftRadiusY;
  const x = endX - stepX;
  const y = endY - stepY;
  const along = Math.max(0, Math.min(1, -(x * stepX + y * stepY) / (stepX ** 2 + stepY ** 2)));
  const hitX = x + along * stepX;
  const hitY = y + along * stepY;
  const distance = hitX ** 2 + hitY ** 2;
  if (distance > 0.68) return;

  const strength = Math.min(1, speed / 1000) * (1 - 0.6 * distance);
  // The hit location sets the torque. Cursor direction never drives aircraft position.
  gusts.push({
    start: lastFlightTime,
    lift: -0.95 * strength,
    pitch: -0.73 * hitX * strength,
    bank: (0.32 + hitY * 0.86) * strength,
  });
  pointerGustArmed = false;
}

function gustResponse(age, peakTime) {
  const phase = age / peakTime;
  return phase * Math.exp(1 - phase);
}

function animateAircraft(seconds) {
  if (seconds === null) {
    aircraft.style.transform = "";
    lastFlightTime = lastPointer = undefined;
    pointerGustArmed = true;
    gusts.length = 0;
    return [0, 0];
  }

  lastFlightTime = seconds;
  while (gusts.length && seconds - gusts[0].start > 2.4) gusts.shift();

  let buffetingLift = 0;
  let buffetingPitch = 0;
  let buffetingBank = 0;
  for (const gust of gusts) {
    const age = seconds - gust.start;
    buffetingLift += gust.lift * gustResponse(age, 0.33);
    buffetingPitch += gust.pitch * gustResponse(age, 0.20);
    buffetingBank += gust.bank * gustResponse(age, 0.27);
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
  const y = -heave * aircraftPixelsPerY * blend + buffetingLift;
  const pitchDegrees = -pitch * blend + buffetingPitch;
  const bankDegrees = bank * blend + buffetingBank;
  aircraft.style.transform = `translate3d(${x}px, ${y}px, 0) perspective(900px) rotateZ(${pitchDegrees}deg) rotateX(${bankDegrees}deg)`;
  return [x / aircraftPixelsPerX, -y / aircraftPixelsPerY];
}

let flybyFrame;
let boardTransition = false;

function resizeScene() {
  paintStars();
  const width = Math.max(1, sky.clientWidth);
  const height = Math.max(1, sky.clientHeight);
  const aspect = width / height;
  const diameter = earthVisual.offsetWidth;
  flybyFrame = {
    width, height, diameter,
    x: earthVisual.offsetLeft + diameter / 2,
    y: earthVisual.offsetTop + diameter / 2,
  };
  aircraftDistance = 1280 * Math.max(1, 0.82 / aspect);
  aircraftPixelsPerX = width / (aircraftDistance * Math.min(aspect, 2.15));
  aircraftPixelsPerY = height / (aircraftDistance * 0.86);
  // Match the baked camera crop to the cloud camera projection.
  aircraft.style.width = `${88000 / (aircraftDistance * Math.min(aspect, 2.15))}%`;
  aircraft.style.height = `${44000 / (aircraftDistance * 0.86)}%`;
  const centerY = 54.8 - 12500 / (aircraftDistance * 0.86);
  aircraft.style.top = `${centerY}%`;
  aircraftCenterX = width / 2;
  aircraftCenterY = centerY * height / 100;
  aircraftRadiusX = Math.max(82, 365 * aircraftPixelsPerX);
  aircraftRadiusY = Math.max(50, 160 * aircraftPixelsPerY);
  paintScene();
}

function interval(from, to, value) {
  return Math.max(0, Math.min(1, (value - from) / (to - from)));
}

function ease(from, to, value) {
  const t = interval(from, to, value);
  return t * t * (3 - 2 * t);
}

const sceneStyles = new Map();

function paintScene() {
  const drop = interval(0, .96, progress);
  const verticalTravel = 1860 * Math.min(1, progress / .96);
  const travel = sceneFrame !== undefined;
  if (lastCameraProgress !== progress || camera.travel !== travel) {
    lastCameraProgress = progress;
    camera = { height: 1240 - verticalTravel, travel };
  }

  const ground = ease(.44, .91, drop);
  const horizon = ease(.24, .62, drop);
  const flyby = boardTransition;
  const departure = flyby ? Math.max(-.06, Math.min(1, progress - 1)) : 0;
  const globe = ease(.43, 1.13, flyby ? 1 : progress);
  const arrival = flyby ? 0 : 1 - progress;
  const globeRise = ease(.43, 1.13, 1) - globe;
  const reveal = ease(.51, 1, flyby ? 1 : progress);
  const routes = ease(.65, .98, progress);
  const { width, height, diameter, x, y } = flybyFrame ?? { width: 1, height: 1, diameter: 1, x: 0, y: 0 };
  const radius = diameter * .46;
  // Switch backgrounds only while the opaque globe covers every viewport corner.
  const coverRadius = Math.hypot(width, height) * .5 + 48;
  const endScale = Math.max(2.15, 2 * coverRadius / radius - 1);
  const scale = .94 + .06 * reveal + (endScale - 1) * departure;
  const crossScreen = (origin, center) => {
    const delta = center - origin;
    if (departure <= .5) return 2 * delta * departure;
    const t = (departure - .5) * 2;
    const end = -radius * endScale - 48;
    return delta + delta * t + (end - center - delta) * t * t * t;
  };
  const flybyX = crossScreen(x, width / 2);
  const flybyY = crossScreen(y, height / 2);
  const cloudBlur = 6 * ease(.25, .57, drop) * (1 - ease(.70, .95, drop));
  const aircraftShift = Math.min(verticalTravel, 1200) * (aircraftPixelsPerY || 0);
  aircraft.style.translate = `-50% calc(-50% - ${aircraftShift}px)`;

  for (const [name, value] of Object.entries({
    "plane-exit": ease(.17, .40, progress),
    "clock-phase": interval(.03, .34, progress),
    "telemetry-exit": ease(.035, .29, progress),
    "award-exit": ease(.07, .34, progress),
    "ground-edge": `${145 - 171 * ground}%`,
    "ground-light": `${ease(.58, .86, drop) * 100}%`,
    "sky-horizon-soften": `${horizon * 100}%`,
    "stars-rise": ease(.10, .37, progress),
    "cloud-blur": `${cloudBlur}px`,
    "cloud-scale": 1 + cloudBlur / 235,
    "earth-scale": scale,
    "earth-flyby-x": `${flybyX}px`,
    "earth-flyby-y": `${flybyY}px`,
    "earth-flyby-roll": `${-112 * departure - 28 * arrival}deg`,
    "earth-flyby-blur": "0px",
    "departure-header": Number(departure >= .5),
    "earth-rise": globeRise,
    "earth-focus": ease(.61, .88, progress),
    "earth-copy": copyProgress,
    "earth-map-progress": Math.max(.22 * interval(.78, .98, progress), copyProgress),
  })) {
    if (sceneStyles.get(name) === value) continue;
    sceneStyles.set(name, value);
    const element = name.startsWith("earth-flyby-") || name === "earth-scale" || name === "earth-rise"
      ? earthVisual : name === "departure-header" ? skyHeader : sky;
    element.style.setProperty(`--${name}`, value);
  }
  earth.toggleAttribute("data-visible", progress > .43 && departure < 1);
  paintEarth(reveal, routes, 32 * departure - 32 * arrival, -100 * departure + 95 * arrival, {
    diameter, scale, width, height,
    left: x + flybyX - diameter * scale / 2,
    top: y + flybyY + globeRise * height * 1.29 - diameter * scale / 2,
    roll: (-112 * departure - 28 * arrival) * Math.PI / 180,
  });
  earth.toggleAttribute("data-flyby", flyby);
  departures.toggleAttribute("data-visible", departure >= .5);
  paintDepartures(Math.max(0, departure), departure === 1 && !departures.inert);
}

function finishScene() {
  sceneFrame = undefined;
  boardTransition = destination === 2;
  copyProgress = Number(destination > 0);
  earth.inert = destination !== 1;
  departures.inert = destination !== 2;
  paintScene();
  focusAfter?.focus({ preventScroll: true });
  focusAfter = undefined;
}

function cueScene(next, focus) {
  if (destination === next) return;
  cancelAnimationFrame(sceneFrame);
  const boardSpring = next === 2 || destination === 2 || progress > 1.08;
  boardTransition = boardSpring;
  // Give a fresh departure a small counter-motion; reversals retain their velocity.
  if (next === 2 && destination === 1 && Math.abs(progress - 1) < .001) velocity = -.0008;
  destination = next;
  focusAfter = focus || (focusAfter || earth.contains(document.activeElement) || departures.contains(document.activeElement)
    ? scenes[next] : undefined);
  earth.inert = true;
  departures.inert = true;
  if (reducedMotion.matches) {
    progress = next;
    velocity = 0;
    finishScene();
    return;
  }

  const start = performance.now();
  const duration = boardSpring ? 1100 : next ? 1540 : 1710;
  // Keep the mass, but raise restoring force for a brisk glide without a long settling tail.
  const { mass, damping, stiffness } = { mass: 16, damping: 128, stiffness: 320 };
  const seconds = duration / 1000;
  const decay = boardSpring ? damping / (2 * mass) * seconds : 5.18;
  const frequency = boardSpring ? Math.sqrt(stiffness / mass - (damping / (2 * mass)) ** 2) * seconds : 4.84;
  const offset = progress - next;
  const tangent = (velocity * duration + decay * offset) / frequency;
  const settleStart = boardSpring ? .62 : .92;
  const settleEnd = boardSpring ? 1.20 : 1.34;
  let previousFrame = start;
  let typeIn = copyProgress > 0;

  function play(now) {
    const time = Math.max(0, (now - start) / duration);
    const envelope = Math.exp(-decay * time);
    const cos = Math.cos(frequency * time);
    const sin = Math.sin(frequency * time);
    const wave = offset * cos + tangent * sin;
    const remaining = envelope * wave;
    const springSpeed = envelope * (frequency * (tangent * cos - offset * sin) - decay * wave);
    // Bring the spring to rest with zero velocity and acceleration at the handoff.
    const tail = interval(settleStart, settleEnd, time);
    const weight = (1 - tail) ** 3 * (1 + 3 * tail + 6 * tail * tail);
    const weightSpeed = -30 * tail ** 2 * (1 - tail) ** 2 / (settleEnd - settleStart);
    velocity = (springSpeed * weight + remaining * weightSpeed) / duration;
    if (reducedMotion.matches || time >= settleEnd) {
      progress = next;
      velocity = 0;
      finishScene();
      return;
    }
    progress = next + remaining * weight;
    const elapsed = Math.max(0, now - previousFrame);
    previousFrame = now;
    if (next && progress >= .98) typeIn = true;
    if (!next || typeIn) {
      copyProgress = Math.max(0, Math.min(1, copyProgress + (next ? elapsed / 920 : -elapsed / 340)));
    }
    sceneFrame = requestAnimationFrame(play);
    paintScene();
  }
  sceneFrame = requestAnimationFrame(play);
}

function moveScene(direction, focus = false) {
  const next = Math.max(0, Math.min(scenes.length - 1, destination + direction));
  cueScene(next, focus ? scenes[next] : undefined);
}

window.addEventListener("wheel", event => {
  if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  if (event.cancelable) event.preventDefault();
  const direction = Math.sign(event.deltaY);
  if (!direction) return;
  if (event.timeStamp - lastWheel > 150 || wheelDirection !== direction) {
    wheelDistance = 0;
    wheelConsumed = false;
    wheelDirection = direction;
  }
  lastWheel = event.timeStamp;
  if (wheelConsumed) return;
  wheelDistance += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? sky.clientHeight : 1);
  if (Math.abs(wheelDistance) < 14) return;
  wheelConsumed = true;
  moveScene(direction);
}, { passive: false });

sky.addEventListener("touchstart", event => {
  const onGlobe = !earth.inert && event.target.closest(".earth-visual");
  touchStart = event.touches.length === 1 && !onGlobe ? event.touches[0] : undefined;
}, { passive: true });
sky.addEventListener("touchend", event => {
  if (!touchStart) return;
  const end = event.changedTouches[0];
  const delta = touchStart.clientY - end.clientY;
  if (Math.abs(delta) > Math.max(38, Math.abs(touchStart.clientX - end.clientX))) moveScene(Math.sign(delta));
  touchStart = undefined;
}, { passive: true });
sky.addEventListener("touchcancel", () => { touchStart = undefined; });

window.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target instanceof HTMLInputElement && event.target.name === "sky-section" && event.key.startsWith("Arrow")) return;
  const down = ["ArrowDown", "PageDown", "End"].includes(event.key);
  const up = ["ArrowUp", "PageUp", "Home"].includes(event.key);
  if (!down && !up) return;
  event.preventDefault();
  if (!event.repeat) moveScene(down ? 1 : -1, true);
});

let palette = paintSky();
resizeScene();
window.addEventListener("resize", resizeScene);
sky.addEventListener("pointermove", handlePointerMove, { passive: true });
sky.addEventListener("pointerleave", () => { lastPointer = undefined; });
if (previewHour === null) {
  setInterval(() => {
    if (!document.hidden) palette = paintSky();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) palette = paintSky();
  });
}

startClouds(document.querySelector(".clouds"), () => palette, {
  distance: () => aircraftDistance,
  animate: animateAircraft,
}, () => camera).catch((error) => {
  console.error("Cloud renderer could not start:", error);
});
