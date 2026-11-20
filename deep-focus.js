const canvas = document.querySelector(".runway-field");
const plane = document.querySelector(".focus-airliner");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false });
let uniforms;
let inView = false;
let frame = 0;
let lastDraw = 0;
let elapsed = 0;
let lampAge = 0;
let lightEntrance = 1;
let planePresence = 1;

export function setRunwayEntrance(light, planeOpacity) {
  if (light === lightEntrance && planeOpacity === planePresence) return;
  lightEntrance = light;
  planePresence = planeOpacity;
  if (uniforms) paint();
}

async function setupField() {
  const [source] = await Promise.all([
    fetch(new URL("./deep-focus.glsl?v=runway-breath", import.meta.url)).then(response => {
      if (!response.ok) throw new Error("Runway shader could not load");
      return response.text();
    }),
    plane.decode(),
  ]);
  if (gl.isContextLost()) return;
  const program = gl.createProgram();
  const vertex = `#version 300 es
    void main() {
      vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      gl_Position = vec4(p * 2. - 1., 0., 1.);
    }`;
  for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, source]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  uniforms = Object.fromEntries(["resolution", "aircraft", "seconds", "entrance", "lamps"].map(key =>
    [key, gl.getUniformLocation(program, key)]));
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, plane);
  resize();
}

function paint() {
  // The local Glide also lights the runway when an anchor opens the settled scene.
  const glide = 1 - (17.8 * Math.exp(-3.1 * lampAge) - 3.1 * Math.exp(-17.8 * lampAge)) / 14.7;
  gl.uniform2f(uniforms.lamps, reducedMotion.matches ? 1 : Math.min(lightEntrance, glide),
    reducedMotion.matches ? 0 : 1);
  gl.uniform2f(uniforms.entrance, lightEntrance, planePresence);
  gl.uniform1f(uniforms.seconds, elapsed);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function animate(now) {
  frame = 0;
  if (now - lastDraw >= 1000 / 20) {
    const delta = (now - lastDraw) / 1000;
    elapsed += Math.min(delta, .1);
    lampAge += delta;
    lastDraw = now;
    paint();
  }
  frame = requestAnimationFrame(animate);
}

function syncPlayback() {
  cancelAnimationFrame(frame);
  frame = 0;
  if (!uniforms || !inView || document.hidden) return;
  if (reducedMotion.matches) lampAge = Infinity;
  paint();
  if (!reducedMotion.matches) {
    lastDraw = performance.now();
    frame = requestAnimationFrame(animate);
  }
}

function resize() {
  if (!uniforms) return;
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height || !plane.offsetHeight) return;
  const ratio = Math.min(devicePixelRatio, 2, Math.sqrt(1600000 / (bounds.width * bounds.height)));
  canvas.width = Math.round(bounds.width * ratio);
  canvas.height = Math.round(bounds.height * ratio);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform3f(uniforms.aircraft, plane.offsetWidth / bounds.height, plane.offsetHeight / bounds.height,
    (bounds.height - plane.offsetTop - plane.offsetHeight) / bounds.height);
  paint();
  syncPlayback();
}

if (gl) {
  const start = () => setupField().catch(error => console.error("Deep Focus:", error));
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    uniforms = null;
    syncPlayback();
  });
  canvas.addEventListener("webglcontextrestored", start);
  const layout = new ResizeObserver(resize);
  layout.observe(canvas);
  layout.observe(plane);
  new IntersectionObserver(([entry]) => {
    inView = entry.intersectionRatio >= .01;
    if (!inView) lampAge = 0;
    syncPlayback();
  }, { threshold: .01 }).observe(canvas);
  reducedMotion.addEventListener("change", syncPlayback);
  document.addEventListener("visibilitychange", syncPlayback);
  start();
}
