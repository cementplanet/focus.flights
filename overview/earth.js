import { airports } from "./airports.js";

const radians = degrees => degrees * Math.PI / 180;
export const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

export function direction(latitude, longitude) {
  const lat = radians(latitude);
  const lon = radians(longitude);
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

export function basis(latitude, longitude) {
  const lat = radians(latitude);
  const lon = radians(longitude);
  return [
    [Math.cos(lon), 0, -Math.sin(lon)],
    [-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon)],
    direction(latitude, longitude),
  ];
}

const airportPoints = new Map(airports.map(([code, lat, lon]) => [code, direction(lat, lon)]));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const svgNS = "http://www.w3.org/2000/svg";

function svgNode(name, attributes) {
  const node = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function createSphere(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: false, depth: false, stencil: false });
  if (!gl) {
    canvas.classList.add("earth-sphere--fallback");
    return () => {};
  }

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
    return result;
  }

  const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
    out vec2 plane;
    uniform vec4 crop;
    void main() {
      vec2 uv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      plane = crop.xy + uv * crop.zw;
      gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
    }`);
  const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in vec2 plane;
    out vec4 pixel;
    uniform sampler2D land;
    uniform mat3 frame;
    uniform float night;
    uniform float roll;
    const float pi = 3.14159265;

    void main() {
      vec2 p = plane / .92;
      float radius = length(p);
      float edge = fwidth(radius);
      if (radius > 1.0 + edge) discard;
      float z = sqrt(max(0.0, 1.0 - dot(p, p)));
      float c = cos(roll), s = sin(roll);
      vec3 normal = vec3(c * p.x - s * p.y, s * p.x + c * p.y, z);
      vec3 world = frame * normal;
      float longitude = atan(world.x, world.z);
      float latitude = asin(clamp(world.y, -1.0, 1.0));
      vec2 uv = vec2(longitude / (2.0 * pi) + .5, .5 - latitude / pi);
      vec2 dx = dFdx(uv);
      vec2 dy = dFdy(uv);
      dx.x -= round(dx.x);
      dy.x -= round(dy.x);
      float coast = textureGrad(land, uv, dx, dy).r;

      float light = max(0.0, dot(normal, normalize(vec3(-.48, .62, .82))));
      float rim = pow(1.0 - z, 4.0);
      float dayTone = mix(.885, .666, coast) - (1.0 - light) * .132 + rim * .027;
      float nightTone = mix(.105, .265, coast) + light * .075 + rim * .088;
      float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      float tone = mix(dayTone, nightTone, night) + (noise - .5) * .006;
      pixel = vec4(vec3(tone), 1.0 - smoothstep(1.0 - edge, 1.0 + edge, radius));
    }`);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  gl.useProgram(program);

  const frame = gl.getUniformLocation(program, "frame");
  const night = gl.getUniformLocation(program, "night");
  const crop = gl.getUniformLocation(program, "crop");
  const roll = gl.getUniformLocation(program, "roll");
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

  const mask = new Image();
  let ready = false;
  let lastView;
  mask.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    gl.generateMipmap(gl.TEXTURE_2D);
    ready = true;
    if (lastView) paint(...lastView);
  };
  const standardMask = new URL("./data/earth-land.png", import.meta.url).href;
  mask.onerror = () => {
    if (mask.src !== standardMask) mask.src = standardMask;
    else canvas.classList.add("earth-sphere--fallback");
  };
  mask.src = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 6144
    ? new URL("./data/earth-land-hd.png", import.meta.url).href
    : standardMask;

  function paint(axes, dark, view) {
    lastView = [axes, dark, view];
    if (!ready || !view) return;
    const { diameter, scale, left, top, width, height } = view;
    const x0 = clamp((-32 - left) / scale, 0, diameter);
    const y0 = clamp((-32 - top) / scale, 0, diameter);
    const x1 = clamp((width + 32 - left) / scale, 0, diameter);
    const y1 = clamp((height + 32 - top) / scale, 0, diameter);
    canvas.style.visibility = x1 <= x0 || y1 <= y0 ? "hidden" : "";
    if (x1 <= x0 || y1 <= y0) return;
    // Render only the visible part at screen resolution, even when the sphere is much larger.
    canvas.style.left = `${x0}px`;
    canvas.style.top = `${y0}px`;
    canvas.style.width = `${x1 - x0}px`;
    canvas.style.height = `${y1 - y0}px`;
    const ratio = Math.min(devicePixelRatio, 2);
    const pixelWidth = Math.ceil((width + 64) * ratio);
    const pixelHeight = Math.ceil((height + 64) * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      gl.viewport(0, 0, pixelWidth, pixelHeight);
    }
    gl.uniform4f(crop, 2 * x0 / diameter - 1, 1 - 2 * y1 / diameter,
      2 * (x1 - x0) / diameter, 2 * (y1 - y0) / diameter);
    gl.uniform1f(roll, view.roll);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix3fv(frame, false, axes.flat());
    gl.uniform1f(night, Number(dark));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return paint;
}

function screenPoint([x, y]) {
  return [(300 + x * 276).toFixed(2), (300 - y * 276).toFixed(2)];
}

const itinerary = [
  "HND", "AKL", "SYD", "DPS", "SIN", "CTU", "PEK", "IST", "ATH",
  "MAD", "LHR", "JFK", "MIA", "DEN", "SFO", "YVR", "CTS",
];

function flightLeg(from, to) {
  const angle = Math.acos(clamp(dot(from, to), -1, 1));
  const sinAngle = Math.sin(angle);
  const normal = from.map((_, axis) => {
    const j = (axis + 1) % 3;
    const k = (axis + 2) % 3;
    return (from[k] * to[j] - from[j] * to[k]) / sinAngle;
  });

  const height = Math.min(angle * .032, .04);
  const bow = Math.min(angle * .026, .018);

  function position(t) {
    const start = Math.sin((1 - t) * angle) / sinAngle;
    const end = Math.sin(t * angle) / sinAngle;
    const lift = Math.sin(Math.PI * t) ** 2;
    const radius = 1 + height * lift;
    // A slight bow stays visible when the globe faces the route head-on.
    const bend = bow * lift;
    const along = radius * Math.cos(bend);
    const across = radius * Math.sin(bend);
    return from.map((value, i) => along * (start * value + end * to[i]) + across * normal[i]);
  }
  const steps = clamp(Math.ceil(angle * 36), 12, 56);
  const samples = Array.from({length: steps + 1}, (_, i) => position(i / steps));
  return { angle, steps, samples, position, halfWidth: Math.min(1.65, .5 + 1.8 * angle) / 276 };
}

function visible([x, y, z]) {
  return z >= 0 || x * x + y * y >= 1;
}

function smoothEdge(points) {
  let edge = "";
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nextX, nextY] = points[i + 1];
    const middle = [(x + nextX) / 2, (y + nextY) / 2];
    edge += `Q${screenPoint(points[i]).join(" ")} ${screenPoint(middle).join(" ")}`;
  }
  return edge + `L${screenPoint(points.at(-1)).join(" ")}`;
}

function routeOutline(points, halfWidth) {
  if (points.length < 2) return "";
  const left = [];
  const right = [];
  for (const [i, { point: [x, y], t }] of points.entries()) {
    const before = points[Math.max(0, i - 1)].point;
    const after = points[Math.min(points.length - 1, i + 1)].point;
    const dx = after[0] - before[0];
    const dy = after[1] - before[1];
    const offset = halfWidth * Math.sin(Math.PI * t) ** 1.4 / (Math.hypot(dx, dy) || 1);
    left.push([x - dy * offset, y + dx * offset]);
    right.push([x + dy * offset, y - dx * offset]);
  }
  right.reverse();
  return `M${screenPoint(left[0]).join(" ")}${smoothEdge(left)}`
    + `L${screenPoint(right[0]).join(" ")}${smoothEdge(right)}Z`;
}

function drawLeg({ steps, samples, position, halfWidth }, progress, project) {
  let path = "";
  let run = [];
  let previous;
  const last = Math.ceil(progress * steps);
  for (let i = 0; i <= last; i++) {
    const t = i === last ? progress : i / steps;
    const point = project(i === last && progress < 1 ? position(t) : samples[i]);
    const show = visible(point);
    if (previous && show !== previous.show) {
      let start = previous;
      let end = { point, t };
      for (let j = 0; j < 8; j++) {
        const middle = {
          point: start.point.map((value, axis) => (value + end.point[axis]) / 2),
          t: (start.t + end.t) / 2,
        };
        if (visible(middle.point) === previous.show) start = middle;
        else end = middle;
      }
      run.push(show ? end : start);
      if (!show) {
        path += routeOutline(run, halfWidth);
        run = [];
      }
    }
    if (show) run.push({ point, t });
    previous = { point, t, show };
  }
  return path + routeOutline(run, halfWidth);
}

export function startEarth(section, night, reducedMotion, interactive = true) {
  const visual = section.querySelector(".earth-visual");
  const paintSphere = createSphere(section.querySelector(".earth-sphere"));
  const overlay = section.querySelector(".earth-routes");
  const points = itinerary.map(code => airportPoints.get(code));
  const legs = points.map((point, i) => flightLeg(point, points[(i + 1) % points.length]));
  const distances = [0];
  for (const leg of legs) distances.push(distances.at(-1) + leg.angle);
  const totalDistance = distances.at(-1);
  const arc = overlay.querySelector("#earth-route-shape");
  const markers = points.map((_, i) => svgNode("circle", {
    class: `earth-endpoint ${i === 0 ? "earth-origin" : "earth-destination"}`,
    r: i === 0 ? 2.7 : 1.7,
  }));
  overlay.append(...markers);

  const cruise = 1.25;
  let longitude = 124;
  let latitude = 24;
  let reveal = 0;
  let routeProgress = 0;
  let pitch = 0;
  let turn = 0;
  let view;
  let frame;
  let previousTime;
  let pointer;
  let release;
  let alignment;

  function draw() {
    if (!section.hasAttribute("data-visible")) return;
    const lat = latitude + (1 - reveal) * 7 + pitch;
    const lon = longitude - (1 - reveal) * 13 + turn;
    const blend = alignment?.amount ?? 0;
    const turnToRoute = alignment ? ((alignment.longitude - lon) % 360 + 540) % 360 - 180 : 0;
    const axes = basis(lat + ((alignment?.latitude ?? lat) - lat) * blend, lon + turnToRoute * blend);
    const project = point => axes.map(axis => dot(axis, point));
    const distance = routeProgress * totalDistance;
    let path = "";
    for (const [i, leg] of legs.entries()) {
      const remaining = distance - distances[i];
      if (remaining <= 0) break;
      const progress = distance >= distances[i + 1] ? 1 : remaining / leg.angle;
      path += drawLeg(leg, progress, project);
    }
    arc.setAttribute("d", path);

    for (const [i, marker] of markers.entries()) {
      const [x, y, z] = project(points[i]);
      const [cx, cy] = screenPoint([x, y]);
      marker.setAttribute("cx", cx);
      marker.setAttribute("cy", cy);
      marker.style.opacity = clamp(z * 12, 0, 1) * clamp((distance - distances[i]) / .065, 0, 1);
    }
    paintSphere(axes, night(), view);
  }

  function animate(now) {
    frame = undefined;
    if (document.hidden || reducedMotion.matches || section.inert || !section.hasAttribute("data-visible")) {
      previousTime = undefined;
      return;
    }
    const dt = Math.min(.05, (now - (previousTime ?? now)) / 1000);
    previousTime = now;
    if (!pointer) {
      const time = release ? (now - release.time) / 1000 : 2;
      // Easing Wizard 4.6 / 12 / 88. Blend the release velocity into cruise with a small, damped rebound.
      const residual = Math.exp(-6.8 * time) * (Math.cos(7.45 * time) + 6.8 / 7.45 * Math.sin(7.45 * time));
      longitude += (cruise + (release ? (release.x - cruise) * residual : 0)) * dt;
      latitude = clamp(latitude + (release ? release.y * residual * dt : 0), -75, 75);
      if (time > 1.2) release = undefined;
    }
    draw();
    frame = requestAnimationFrame(animate);
  }

  function wake() {
    if (interactive && frame === undefined && !document.hidden && !section.inert && !reducedMotion.matches) {
      frame = requestAnimationFrame(animate);
    }
  }

  if (interactive) {
    visual.addEventListener("pointerdown", event => {
      if (section.inert || pointer || !event.isPrimary || event.button !== 0) return;
      const bounds = visual.getBoundingClientRect();
      if (Math.hypot(event.clientX - bounds.x - bounds.width / 2, event.clientY - bounds.y - bounds.height / 2) > bounds.width * .46) return;
      visual.setPointerCapture(event.pointerId);
      visual.classList.add("is-dragging");
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, vx: 0, vy: 0 };
      release = undefined;
    });
    visual.addEventListener("pointermove", event => {
      if (pointer?.id !== event.pointerId || section.inert) return;
      const sensitivity = 155 / visual.clientWidth;
      const x = (pointer.x - event.clientX) * sensitivity;
      const y = (event.clientY - pointer.y) * sensitivity;
      const dt = Math.max(.008, (event.timeStamp - pointer.time) / 1000);
      longitude += x;
      latitude = clamp(latitude + y, -75, 75);
      Object.assign(pointer, { x: event.clientX, y: event.clientY, time: event.timeStamp,
        vx: pointer.vx * .45 + clamp(x / dt, -125, 125) * .55,
        vy: pointer.vy * .45 + clamp(y / dt, -90, 90) * .55 });
      if (reducedMotion.matches) draw();
    });
    function endDrag(event) {
      if (pointer?.id !== event.pointerId) return;
      const moving = event.type === "pointerup" && event.timeStamp - pointer.time < 100;
      release = { x: moving ? pointer.vx : 0, y: moving ? pointer.vy : 0, time: performance.now() };
      pointer = undefined;
      visual.classList.remove("is-dragging");
    }
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) visual.addEventListener(type, endDrag);
    section.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      event.preventDefault();
      longitude += event.key === "ArrowLeft" ? -10 : 10;
      draw();
    });
  }
  document.addEventListener("visibilitychange", wake);
  reducedMotion.addEventListener("change", () => { draw(); wake(); });

  return (nextReveal, nextRoute, nextPitch = 0, nextTurn = 0, nextView, nextAlignment) => {
    const changed = reveal !== nextReveal || routeProgress !== nextRoute || pitch !== nextPitch || turn !== nextTurn || view !== nextView || alignment !== nextAlignment;
    reveal = nextReveal;
    routeProgress = nextRoute;
    pitch = nextPitch;
    turn = nextTurn;
    view = nextView;
    alignment = nextAlignment;
    if (section.inert && pointer) {
      visual.releasePointerCapture(pointer.id);
      pointer = undefined;
      visual.classList.remove("is-dragging");
    }
    if (changed || frame === undefined) draw();
    wake();
  };
}
