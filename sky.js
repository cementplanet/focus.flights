import { startClouds } from "./clouds.js?v=airliner-clay-2";

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
const time = new URLSearchParams(location.search).get("time");
const previewHour = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ? Number(time.slice(0, 2)) + Number(time.slice(3)) / 60
  : null;

function paintSky() {
  const [colors, stars] = sample(previewHour ?? localHour(new Date()));
  ["zenith", "sky", "horizon", "shadow"].forEach((name, i) => {
    sky.style.setProperty("--" + name, `rgb(${colors[i].join(" ")})`);
  });
  sky.style.setProperty("--stars", stars);
  sky.toggleAttribute("data-night", stars >= 0.48);

  return { colors, stars };
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
  if (event.pointerType !== "mouse" || lastFlightTime === undefined) return;

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

function resizeScene() {
  paintStars();
  const width = Math.max(1, sky.clientWidth);
  const height = Math.max(1, sky.clientHeight);
  const aspect = width / height;
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
}

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
}).catch((error) => {
  console.error("Cloud renderer could not start:", error);
});
