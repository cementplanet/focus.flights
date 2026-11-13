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

function formatTime(date) {
  const fields = [date.getHours(), date.getMinutes(), date.getSeconds()];
  return fields.map((value) => String(value).padStart(2, "0")).join(":");
}

const clock = document.querySelector(".flight-clock");
function addDepthLayers(row) {
  const sharpFace = row.firstElementChild;
  const faces = [sharpFace];
  for (const depth of ["soft", "far"]) {
    const face = sharpFace.cloneNode(true);
    face.className = `flight-clock__face flight-clock__face--${depth}`;
    row.append(face);
    faces.push(face);
  }
  return faces;
}

const faces = addDepthLayers(clock);
const slots = Array.from("00:00:00", (character, index) => faces.map(face => {
  const slot = document.createElement("span");
  slot.className = "flight-clock__slot";
  slot.style.setProperty("--digit-delay", index * .043);
  if (character === ":") slot.classList.add("flight-clock__slot--colon");
  face.append(slot);
  return slot;
}));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const flight = chooseFlight();

// A representative cruise speed and allowance for climb, descent and routing.
const duration = (Math.ceil(flight.distance / 800 * 60) + 20) * 60;
// Sample the middle of the flight so the aircraft is already in cruise.
const remaining = Math.floor(duration * (0.15 + 0.7 * Math.random()));
const arrivalAt = Date.now() + remaining * 1000;

function airportVector([, latitude, longitude]) {
  const lat = radians(latitude);
  const lon = radians(longitude);
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

function formatCoordinate(degrees, positive, negative) {
  return `${Math.abs(degrees).toFixed(2)}° ${degrees < 0 ? negative : positive}`;
}

const origin = airportVector(flight.from);
const destination = airportVector(flight.to);
const arc = flight.distance / 6371;
const groundSpeed = Math.round(flight.distance * 3600 / duration / 1.852);

function flightCoordinates(seconds) {
  const progress = 1 - seconds / duration;
  const fromWeight = Math.sin((1 - progress) * arc);
  const toWeight = Math.sin(progress * arc);
  const [x, y, z] = origin.map((component, index) => component * fromWeight + destination[index] * toWeight);
  return [
    formatCoordinate(Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, "N", "S"),
    formatCoordinate(Math.atan2(y, x) * 180 / Math.PI, "E", "W"),
  ];
}

// EasingWizard spring with a 11% overshoot, followed by a much smaller return.
const digitSpring = `linear(
  0, 0.009 1%, 0.033 2%, 0.129 4.2%, 0.677 12.5%, 0.887 16.4%,
  1.026 20.3%, 1.07 22.3%, 1.099 24.4%, 1.114 27.1%, 1.111 30.3%,
  1.016 43.8%, 0.989 52.1%, 1.001 78.4%, 1
)`;
const digitEasing = CSS.supports("animation-timing-function", digitSpring)
  ? digitSpring
  : "cubic-bezier(0.15, 0.75, 0.23, 1.12)";

// A quick rise, one visible rebound, then a smaller return before the next tick.
const clockSpring = `linear(
  0, 0.046 4%, 0.18 8%, 0.39 13%, 0.68 19%, 0.92 25%,
  1.065 32%, 1.13 40%, 1.10 49%, 1.025 61%, 0.99 74%, 0.995 88%, 1
)`;
const clockEasing = CSS.supports("animation-timing-function", clockSpring)
  ? clockSpring
  : "cubic-bezier(0.24, 0.78, 0.30, 1.17)";

function updateDigit(slot, digit, animated, delay) {
  const previous = slot.lastElementChild;
  if (previous?.textContent === digit) return;

  const next = document.createElement("span");
  next.textContent = digit;
  if (!animated || !previous) {
    slot.replaceChildren(next);
    return;
  }

  slot.append(next);
  // The other two faces already carry their own depth blur.
  const sharp = slot.parentElement.matches(".flight-clock__face--sharp");
  const focused = sharp ? "blur(0px)" : "none";
  const defocused = sharp ? "blur(min(.075em, 14px))" : "none";

  previous.animate([
    { transform: "translateY(0) scaleY(1)", opacity: 1, filter: focused },
    { offset: .55, opacity: .32, filter: defocused },
    { transform: "translateY(max(-.24em, -48px)) scaleY(1.09)", opacity: 0, filter: defocused },
  ], { duration: 220, delay, easing: "cubic-bezier(.4, 0, .7, .65)", fill: "forwards" })
    .onfinish = () => previous.remove();

  next.animate([
    { transform: "translateY(min(.25em, 50px)) scaleY(1.08)" },
    { transform: "translateY(0) scaleY(1)" },
  ], { duration: 580, delay, easing: clockEasing, fill: "backwards" });
  next.animate([
    { opacity: 0, filter: defocused },
    { offset: .42, opacity: .7, filter: sharp ? "blur(min(.03em, 6px))" : "none" },
    { opacity: 1, filter: focused },
  ], { duration: 310, delay: delay + 32, easing: "cubic-bezier(.22, .58, .32, 1)", fill: "backwards" });
}

function rollOut(glyph, delay = 0) {
  return glyph.animate([
    { "--digit-shift": "0px", opacity: 1, filter: "blur(0px)" },
    { "--digit-shift": "min(0.14em, 46px)", opacity: 0, filter: "blur(.16em)" },
  ], { duration: 180, delay, easing: "cubic-bezier(0.37, 0, 0.55, 1)", fill: "forwards" });
}

function rollIn(glyph, delay = 0) {
  const spring = glyph.animate([
    { "--digit-shift": "max(-0.17em, -50px)" },
    { "--digit-shift": "0px" },
  ], { duration: 600, delay, easing: digitEasing, fill: "backwards" });
  glyph.animate([
    { opacity: 0, filter: "blur(.16em)" },
    { opacity: 1, filter: "blur(0px)" },
  ], { duration: 270, delay: delay + 12, easing: "cubic-bezier(0.32, 0, 0.27, 1)", fill: "backwards" });
  return spring;
}

const runway = '<path d="M3 31h30"/>';
const routeIcons = {
  takeoff: `<path d="m3 19 6 7c1.2 1.2 2.7 1.3 4.3.3l17-11c2-1.3 3.1-3.3 1.9-4.8s-3.7-1.4-5.6 0L22 13 11 2 8 4l7.5 13-5 3L6 17.3Z"/>${runway}`,
  landing: `<path d="m4 8 2.8 8.4c.6 1.9 1.9 3.1 3.8 3.8L28 27c2.2.9 4.4.5 5.1-1.3.6-1.7-.8-3.4-3-4.3l-6-2.4L16 4l-3.5-1.4 4.5 13-6-2.4L7 8.7Z"/>${runway}`,
};
let previousClockSecond;
let clockTimer;

function updateClock() {
  const now = new Date();
  const second = Math.floor(now.getTime() / 1000);

  if (second !== previousClockSecond) {
    const text = formatTime(now);
    const animated = second === previousClockSecond + 1 && !reducedMotion.matches;
    clock.setAttribute("aria-label", `系统时间 ${text}`);
    for (const [index, digitSlots] of slots.entries()) {
      const delay = (text.length - 1 - index) * 18;
      for (const slot of digitSlots) updateDigit(slot, text[index], animated, delay);
    }
    previousClockSecond = second;
  }

  if (!document.hidden) {
    clockTimer = setTimeout(updateClock, 1000 - now.getMilliseconds() + 12);
  }
}

const telemetry = document.querySelector(".flight-telemetry");
const telemetryFaces = addDepthLayers(telemetry);
const [departure, arrival] = [flight.from[0], flight.to[0]];
const metrics = [
  {
    label: departure,
    value: () => arrival,
    announcement: `Route from ${departure} to ${arrival}`,
    icon: routeIcons.takeoff,
    endIcon: routeIcons.landing,
    viewBox: "0 0 36 32",
  },
  { label: "Altitude", icon: '<path d="M8 4v16M4.5 7.5 8 4l3.5 3.5m-7 9L8 20l3.5-3.5M15 5h4.5m-2.5 4.7h2.5M15 14.4h4.5m-2.5 4.7h2.5"/>',
    value: (seconds) => {
      const altitude = 35000 + 10 * Math.round(3 * Math.sin((duration - seconds) / 13));
      return `${altitude.toLocaleString("en-US")} ft`;
    } },
  { label: "Speed", icon: '<path d="m10 5.6 11 6.4-11 6.4 2.8-6.4L10 5.6ZM4.2 9h3.5M2.5 12h6.2m-4.5 3h3.5"/>',
    value: (seconds) => {
      const wind = Math.round(4 * Math.sin((duration - seconds) / 19));
      return `${groundSpeed + wind} kt`;
    } },
  { label: "Latitude", icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M5.3 6.5c4.3 2.2 9.1 2.2 13.4 0M5.3 17.5c4.3-2.2 9.1-2.2 13.4 0"/>',
    value: (seconds) => flightCoordinates(seconds)[0] },
  { label: "Longitude", icon: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4.5" ry="9"/><path d="M12 3v18"/>',
    value: (seconds) => flightCoordinates(seconds)[1] },
];
let metricIndex = 0;
let telemetryTimer;
let telemetrySwitching = false;

function telemetryText(text, part) {
  const group = document.createElement("span");
  group.className = `flight-telemetry__${part}`;
  for (const character of text) {
    const glyph = document.createElement("span");
    glyph.className = "flight-telemetry__glyph";
    glyph.textContent = character;
    group.append(glyph);
  }
  return group;
}

function telemetryIcon(path, viewBox = "0 0 24 24") {
  const template = document.createElement("template");
  template.innerHTML = `<svg class="flight-telemetry__glyph flight-telemetry__icon" viewBox="${viewBox}"
    fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  return template.content.firstElementChild;
}

function showTelemetry() {
  const metric = metrics[metricIndex];
  const remainingSeconds = Math.max(0, Math.ceil((arrivalAt - Date.now()) / 1000));
  const value = metric.value(remainingSeconds);
  const announcement = metric.announcement ?? `${metric.label}, ${value}`;
  telemetry.setAttribute("aria-label", `Simulated flight data: ${announcement}`);
  for (const face of telemetryFaces) {
    const caption = document.createElement("span");
    caption.className = "flight-telemetry__caption";
    caption.append(telemetryIcon(metric.icon, metric.viewBox), telemetryText(metric.label.toUpperCase(), "label"));
    const reading = telemetryText(value.toUpperCase(), "value");
    if (metric.endIcon) {
      const destination = document.createElement("span");
      destination.className = "flight-telemetry__caption";
      destination.append(reading, telemetryIcon(metric.endIcon, metric.viewBox));
      face.replaceChildren(caption, destination);
    } else {
      face.replaceChildren(caption, reading);
    }
  }
}

function animateTelemetry(animate, reverse = false) {
  const stagger = reverse ? 14 : 22;
  return Promise.all(telemetryFaces.flatMap(face => {
    const glyphs = [...face.querySelectorAll(".flight-telemetry__glyph")];
    if (reverse) glyphs.reverse();
    return glyphs.map((glyph, index) => animate(glyph, index * stagger).finished);
  }));
}

function scheduleTelemetry() {
  if (!document.hidden && !telemetrySwitching) telemetryTimer = setTimeout(rotateTelemetry, 4500);
}

async function rotateTelemetry() {
  telemetrySwitching = true;
  if (!reducedMotion.matches) await animateTelemetry(rollOut, true);
  metricIndex = (metricIndex + 1) % metrics.length;
  showTelemetry();
  if (!reducedMotion.matches) await animateTelemetry(rollIn);
  telemetrySwitching = false;
  scheduleTelemetry();
}

document.addEventListener("visibilitychange", () => {
  clearTimeout(clockTimer);
  clearTimeout(telemetryTimer);
  if (!document.hidden) {
    updateClock();
    scheduleTelemetry();
  }
});

updateClock();
showTelemetry();
scheduleTelemetry();
