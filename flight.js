import { airports } from "./airports.js";

const radians = (degrees) => degrees * Math.PI / 180;

function flightDistance(from, to) {
  const latitudeDelta = radians(to[1] - from[1]);
  const longitudeDelta = radians(to[2] - from[2]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from[1])) * Math.cos(radians(to[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function chooseFlight() {
  const candidates = [];
  for (const [index, from] of airports.entries()) {
    for (const to of airports.slice(index + 1)) {
      const distance = flightDistance(from, to);
      if (distance >= 550 && distance <= 3300) candidates.push({ from, to, distance });
    }
  }

  const { from, to, distance } = candidates[Math.floor(Math.random() * candidates.length)];
  return Math.random() < 0.5 ? { from, to, distance } : { from: to, to: from, distance };
}

function formatTime(seconds) {
  const fields = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return fields.map((value) => String(value).padStart(2, "0")).join(":");
}

const clock = document.querySelector(".flight-clock");
const sharpFace = clock.firstElementChild;
const faces = [sharpFace];
for (const depth of ["soft", "far"]) {
  const face = sharpFace.cloneNode(true);
  face.className = `flight-clock__face flight-clock__face--${depth}`;
  clock.append(face);
  faces.push(face);
}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const flight = chooseFlight();

// A representative cruise speed and allowance for climb, descent and routing.
const duration = (Math.ceil(flight.distance / 800 * 60) + 20) * 60;
// Sample the middle of the flight so the aircraft is already in cruise.
const remaining = Math.floor(duration * (0.15 + 0.7 * Math.random()));
const arrivalAt = Date.now() + remaining * 1000;

// EasingWizard spring with a 11% overshoot, followed by a much smaller return.
const digitSpring = `linear(
  0, 0.009 1%, 0.033 2%, 0.129 4.2%, 0.677 12.5%, 0.887 16.4%,
  1.026 20.3%, 1.07 22.3%, 1.099 24.4%, 1.114 27.1%, 1.111 30.3%,
  1.016 43.8%, 0.989 52.1%, 1.001 78.4%, 1
)`;
const digitEasing = CSS.supports("animation-timing-function", digitSpring)
  ? digitSpring
  : "cubic-bezier(0.15, 0.75, 0.23, 1.12)";

function updateDigit(slot, digit, animated) {
  const previous = slot.lastElementChild;
  if (previous?.textContent === digit) return;

  const next = document.createElement("span");
  next.textContent = digit;
  if (!animated || !previous) {
    slot.replaceChildren(next);
    return;
  }

  slot.append(next);
  rollOut(previous).onfinish = () => previous.remove();
  rollIn(next);
}

function rollOut(glyph, delay = 0) {
  return glyph.animate([
    { "--digit-shift": "0px", opacity: 1 },
    { "--digit-shift": "min(0.14em, 46px)", opacity: 0 },
  ], { duration: 180, delay, easing: "cubic-bezier(0.37, 0, 0.55, 1)", fill: "forwards" });
}

function rollIn(glyph, delay = 0) {
  const spring = glyph.animate([
    { "--digit-shift": "max(-0.17em, -50px)" },
    { "--digit-shift": "0px" },
  ], { duration: 600, delay, easing: digitEasing, fill: "backwards" });
  glyph.animate([
    { opacity: 0 },
    { opacity: 1 },
  ], { duration: 270, delay: delay + 12, easing: "cubic-bezier(0.32, 0, 0.27, 1)", fill: "backwards" });
  return spring;
}

const runway = '<path d="M3 31h30"/>';
const routeIcons = {
  "↗": `<path d="m3 19 6 7c1.2 1.2 2.7 1.3 4.3.3l17-11c2-1.3 3.1-3.3 1.9-4.8s-3.7-1.4-5.6 0L22 13 11 2 8 4l7.5 13-5 3L6 17.3Z"/>${runway}`,
  "→": '<path d="M2 16h23M12 2l13 14-13 14"/>',
  "↘": `<path d="m4 8 2.8 8.4c.6 1.9 1.9 3.1 3.8 3.8L28 27c2.2.9 4.4.5 5.1-1.3.6-1.7-.8-3.4-3-4.3l-6-2.4L16 4l-3.5-1.4 4.5 13-6-2.4L7 8.7Z"/>${runway}`,
};
const route = `↗${flight.from[0]}→${flight.to[0]}↘`;
const focusScenes = ["Writing", "Reading", "Coding", "Sketching", "Studying"];
let focusIndex = 0;
const modes = ["countdown", "route", "focus"];
let modeIndex = 0;
let slots = [];
let previousSeconds;
let countdownTimer;
let rotationTimer;
let switching = false;

function render(mode, text) {
  clock.dataset.mode = mode;
  clock.setAttribute("role", mode === "countdown" ? "timer" : "img");
  slots = Array.from(text, (character) => faces.map(() => {
    const slot = document.createElement("span");
    slot.className = "flight-clock__slot";
    if (character === ":") slot.classList.add("flight-clock__slot--colon");
    if (routeIcons[character]) {
      slot.classList.add("flight-clock__slot--icon");
      if (character === "→") slot.classList.add("flight-clock__slot--arrow");
      slot.innerHTML = `<span><svg viewBox="0 0 ${character === "→" ? 27 : 36} 32" fill="none" stroke="currentColor"
        stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">${routeIcons[character]}</svg></span>`;
    } else {
      updateDigit(slot, character, false);
    }
    return slot;
  }));
  faces.forEach((face, index) => {
    const glyphs = slots.map(group => group[index]);
    if (mode !== "route") {
      face.replaceChildren(...glyphs);
      return;
    }
    const code = (letters) => {
      const group = document.createElement("span");
      group.className = "flight-clock__code";
      group.append(...letters);
      return group;
    };
    face.replaceChildren(glyphs[0], code(glyphs.slice(1, 4)), glyphs[4], code(glyphs.slice(5, 8)), glyphs[8]);
  });
}

function updateCountdown(entering = false) {
  const milliseconds = Math.max(0, arrivalAt - Date.now());
  const seconds = Math.ceil(milliseconds / 1000);

  if (entering || seconds !== previousSeconds) {
    const text = formatTime(seconds);
    if (entering) render("countdown", text);
    const animated = !entering && seconds === previousSeconds - 1 && !reducedMotion.matches;
    clock.setAttribute("aria-label", `预计剩余飞行时间 ${text}`);
    if (!entering) {
      for (const [index, digitSlots] of slots.entries()) {
        for (const slot of digitSlots) updateDigit(slot, text[index], animated);
      }
    }
    previousSeconds = seconds;
  }

  if (seconds > 0 && !document.hidden && !switching) {
    countdownTimer = setTimeout(updateCountdown, (milliseconds % 1000 || 1000) + 12);
  }
}

function showMode() {
  const mode = modes[modeIndex];
  if (mode === "countdown") {
    updateCountdown(true);
  } else if (mode === "route") {
    render(mode, route);
    clock.setAttribute("aria-label", `从 ${flight.from[0]} 飞往 ${flight.to[0]}`);
  } else {
    const focus = focusScenes[focusIndex];
    render(mode, focus.toUpperCase());
    clock.setAttribute("aria-label", `专注内容：${focus}`);
    focusIndex = (focusIndex + 1) % focusScenes.length;
  }
}

function animateSlots(animate, reverse = false) {
  const groups = reverse ? [...slots].reverse() : slots;
  const stagger = reverse ? 32 : 40;
  return Promise.all(groups.flatMap((group, index) => group.map(slot =>
    animate(slot.lastElementChild, index * stagger).finished
  )));
}

function scheduleRotation() {
  if (!document.hidden && !switching) {
    rotationTimer = setTimeout(rotate, modeIndex === 0 ? 6000 : 5000);
  }
}

async function rotate() {
  switching = true;
  clearTimeout(countdownTimer);
  if (!reducedMotion.matches) await animateSlots(rollOut, true);
  modeIndex = (modeIndex + 1) % modes.length;
  showMode();
  if (!reducedMotion.matches) await animateSlots(rollIn);
  switching = false;
  if (modeIndex === 0 && !document.hidden) updateCountdown();
  scheduleRotation();
}

document.addEventListener("visibilitychange", () => {
  clearTimeout(countdownTimer);
  clearTimeout(rotationTimer);
  if (!document.hidden && !switching) {
    if (modeIndex === 0) updateCountdown();
    scheduleRotation();
  }
});

showMode();
scheduleRotation();
