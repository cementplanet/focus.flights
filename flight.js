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
const slots = Array.from(sharpFace.children, (_, index) => faces.map(face => face.children[index]));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const flight = chooseFlight();
const route = document.querySelector(".flight-route");
const [departure, arrival] = route.querySelectorAll(".flight-airport");
departure.querySelector(".flight-airport__label").textContent = flight.from[0];
arrival.querySelector(".flight-airport__label").textContent = flight.to[0];
departure.setAttribute("aria-label", `出发机场 ${flight.from[0]}`);
arrival.setAttribute("aria-label", `抵达机场 ${flight.to[0]}`);
route.hidden = false;

for (const badge of [departure, arrival]) {
  const release = () => badge.removeAttribute("data-pressed");
  const isActivationKey = (key) => key === " " || key === "Enter";

  badge.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    const { left, top, width, height } = badge.getBoundingClientRect();
    badge.style.setProperty("--press-x", `${100 * (event.clientX - left) / width}%`);
    badge.style.setProperty("--press-y", `${100 * (event.clientY - top) / height}%`);
    badge.setAttribute("data-pressed", "");
  });
  for (const event of ["pointerup", "pointercancel", "pointerleave", "blur"]) {
    badge.addEventListener(event, release);
  }
  badge.addEventListener("keydown", (event) => {
    if (!isActivationKey(event.key) || event.repeat) return;
    badge.style.removeProperty("--press-x");
    badge.style.removeProperty("--press-y");
    badge.setAttribute("data-pressed", "");
  });
  badge.addEventListener("keyup", (event) => {
    if (isActivationKey(event.key)) release();
  });
}

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
  const leaving = previous.animate([
    { "--digit-shift": "0px", opacity: 1 },
    { "--digit-shift": "min(0.14em, 46px)", opacity: 0 },
  ], { duration: 180, easing: "cubic-bezier(0.37, 0, 0.55, 1)", fill: "forwards" });
  leaving.onfinish = () => previous.remove();

  next.animate([
    { "--digit-shift": "max(-0.17em, -50px)" },
    { "--digit-shift": "0px" },
  ], { duration: 600, easing: digitEasing });
  next.animate([
    { opacity: 0 },
    { opacity: 1 },
  ], { duration: 270, delay: 12, easing: "cubic-bezier(0.32, 0, 0.27, 1)", fill: "backwards" });
}

let previousSeconds;
let timer;

function updateCountdown() {
  const milliseconds = Math.max(0, arrivalAt - Date.now());
  const seconds = Math.ceil(milliseconds / 1000);

  if (seconds !== previousSeconds) {
    const animated = seconds === previousSeconds - 1 && !reducedMotion.matches && !document.hidden;
    const text = formatTime(seconds);
    clock.setAttribute("aria-label", `预计剩余飞行时间 ${text}`);
    for (const [index, digitSlots] of slots.entries()) {
      if (text[index] === ":") continue;
      for (const slot of digitSlots) updateDigit(slot, text[index], animated);
    }
    previousSeconds = seconds;
  }

  if (seconds > 0 && !document.hidden) {
    timer = setTimeout(updateCountdown, (milliseconds % 1000 || 1000) + 12);
  }
}

document.addEventListener("visibilitychange", () => {
  clearTimeout(timer);
  if (!document.hidden) updateCountdown();
});
updateCountdown();
