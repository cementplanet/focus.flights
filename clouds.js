import { getHardwareContext } from "./hardware-gl.js";
import { bindCloudNoise, cloudNoiseUniforms, loadCloudNoise } from "./cloud-noise.js";

// Noise volumes generated from Leonxlnx/halo-above-the-clouds at 1d08819 (MIT, see LICENSE-halo).
export const cloudDeckBottom = -560;

export function setupClouds(canvas, sky, aircraft, camera, reducedMotion) {
  const surface = canvas.parentElement;
  const connection = navigator.connection;
  let visible = false, frame = 0, renderer, loading, staticOnly = false, contextLost = false;
  let lastFrame, slowFrames = 0, startTimer;

  function isLimited() {
    const type = connection?.effectiveType;
    return staticOnly || contextLost || reducedMotion.matches || connection?.saveData || type?.endsWith("2g") || type === "3g";
  }

  function canRender() {
    // Leaving the deck hides its last frame. The return can render a new one in motion.
    return visible && !document.hidden && !isLimited() && camera().height > cloudDeckBottom;
  }

  function showStill() {
    if (surface.hasAttribute("data-clouds-ready")) {
      surface.removeAttribute("data-clouds-ready");
      aircraft.animate(null);
    }
    lastFrame = undefined;
    slowFrames = 0;
  }

  function paint(now) {
    frame = 0;
    if (!canRender()) {
      showStill();
      return;
    }
    const travelling = camera().travel;
    if (!travelling && lastFrame !== undefined) {
      slowFrames = now - lastFrame > 40 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    } else {
      slowFrames = 0;
    }
    // Judge sustained performance at cruise, where the camera no longer adds transient load.
    lastFrame = travelling ? undefined : now;
    if (slowFrames >= 5) {
      staticOnly = true;
      sync();
      return;
    }
    if (renderer(now)) surface.toggleAttribute("data-clouds-ready", true);
    frame = requestAnimationFrame(paint);
  }

  async function prepare(controller) {
    const gl = getHardwareContext(canvas, "webgl2", {
      alpha: true, antialias: false, premultipliedAlpha: true,
    });
    if (!gl) {
      staticOnly = true;
      return;
    }
    const next = await createRenderer(gl, canvas, sky, aircraft, camera, controller.signal);
    if (!controller.signal.aborted) renderer = next;
  }

  function sync() {
    surface.toggleAttribute("data-clouds-static", Boolean(isLimited()));
    if (!canRender()) {
      clearTimeout(startTimer);
      startTimer = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
      if (camera().height <= cloudDeckBottom || isLimited()) showStill();
      else { lastFrame = undefined; slowFrames = 0; }
      return;
    }
    if (renderer) {
      if (!frame) frame = requestAnimationFrame(paint);
    } else if (!loading && startTimer === undefined) {
      // Let the poster, copy and first controls paint before opening the GPU.
      startTimer = setTimeout(() => {
        startTimer = undefined;
        if (!canRender()) return;
        const controller = loading = new AbortController();
        void prepare(controller).catch(error => {
          if (controller.signal.aborted) return;
          staticOnly = true;
          console.warn("Cloud renderer unavailable:", error);
        }).finally(() => {
          if (loading !== controller) return;
          loading = undefined;
          sync();
        });
      }, 240);
    }
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.intersectionRatio > 0;
    surface.toggleAttribute("data-clouds-visible", visible);
    sync();
  }, { threshold: .001 }).observe(surface);
  reducedMotion.addEventListener("change", sync);
  connection?.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    contextLost = true;
    loading?.abort();
    loading = renderer = undefined;
    sync();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    sync();
  });
  return sync;
}

async function createRenderer(gl, canvas, sky, aircraft, camera, signal) {
  async function asset(path) {
    const response = await fetch(new URL(path, import.meta.url), { signal });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response;
  }

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const [fragment, shadow, volumes] = await Promise.all([
    asset("clouds.glsl?v=compact-noise").then((response) => response.text()),
    asset("aircraft/shadow.bin?v=airliner-clay-2").then((response) => response.arrayBuffer()),
    loadCloudNoise(),
  ]);

  signal.throwIfAborted();
  const program = gl.createProgram();
  const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
    void main() {
      vec2 vertex = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      gl_Position = vec4(vertex * 2.0 - 1.0, 0.0, 1.0);
    }`);
  const pixels = compile(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vertex);
  gl.attachShader(program, pixels);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  gl.deleteShader(vertex);
  gl.deleteShader(pixels);
  gl.useProgram(program);

  const uniforms = Object.fromEntries([
    ...cloudNoiseUniforms, "aircraftShadow", "aircraftDistance", "aircraftOffset", "resolution",
    "elapsed", "cameraHeight", "deckDepth", "night", "shadowColor", "lightColor", "skyMid", "skyHorizon",
  ].map((name) => [name, gl.getUniformLocation(program, name)]));

  bindCloudNoise(gl, volumes);
  cloudNoiseUniforms.forEach((name, unit) => gl.uniform1i(uniforms[name], unit));

  if (shadow.byteLength !== 128 ** 2) throw new Error("Invalid size for aircraft shadow");
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 128, 128, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(shadow));
  gl.uniform1i(uniforms.aircraftShadow, 3);

  const epoch = performance.now();
  let frameAt = -Infinity;
  let lastPalette;
  let lastCamera;
  let elapsed = 0;
  let flightTime = 0;
  let previousAnimationAt;
  let pendingFrame;
  gl.enable(gl.SCISSOR_TEST);

  return function render(now) {
    const delta = Math.min(now - (previousAnimationAt ?? now), 50);
    previousAnimationAt = now;
    const view = camera();
    flightTime += delta / 1000;
    const aircraftOffset = aircraft.animate(flightTime);
    const moved = view.height !== lastCamera?.height;
    // During camera travel submit on every display callback. Throttle only ambient drift.
    if (!view.travel && !moved && now - frameAt < 65) return false;
    if (pendingFrame) {
      if (!view.travel && !moved && gl.clientWaitSync(pendingFrame, 0, 0) === gl.TIMEOUT_EXPIRED) return false;
      gl.deleteSync(pendingFrame);
      pendingFrame = null;
    }

    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const scale = Math.min(1, 864 / cssWidth, 486 / cssHeight);
    const width = Math.max(1, Math.round(cssWidth * scale));
    const height = Math.max(1, Math.round(cssHeight * scale));
    const palette = sky();
    const resized = canvas.width !== width || canvas.height !== height;

    elapsed += Math.min(now - Math.max(frameAt, epoch), 125) / 1000;
    frameAt = now;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
    }
    if (resized || !lastCamera) {
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.resolution, width, height);
    }

    if (palette !== lastPalette) {
      lastPalette = palette;
      const { colors, stars } = palette;
      gl.uniform1f(uniforms.night, stars);
      gl.uniform3fv(uniforms.skyMid, colors[1].map((channel) => channel / 255));
      gl.uniform3fv(uniforms.skyHorizon, colors[2].map((channel) => channel / 255));
      gl.uniform3fv(uniforms.shadowColor, colors[3].map((channel) => channel / 255));
      gl.uniform3fv(uniforms.lightColor, colors[4].map((channel) => channel / 255));
    }

    const aboveDeck = view.height >= 1120;
    if (resized || !lastCamera || aboveDeck !== (lastCamera.height >= 1120)) {
      gl.scissor(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // Above the deck, the shader produces no mist or cloud above the ray horizon.
      if (aboveDeck) gl.scissor(0, 0, width, Math.ceil(height * 0.452));
    }
    lastCamera = view;
    gl.uniform1f(uniforms.cameraHeight, view.height);
    const deckDepth = Math.max(0, Math.min(1, (1120 - view.height) / 180));
    gl.uniform1f(uniforms.deckDepth, deckDepth);

    gl.uniform1f(uniforms.elapsed, elapsed);
    gl.uniform1f(uniforms.aircraftDistance, aircraft.distance());
    const [aircraftX, aircraftY] = aircraft.position();
    gl.uniform2f(uniforms.aircraftOffset, aircraftX + aircraftOffset[0], aircraftY + aircraftOffset[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!view.travel) {
      pendingFrame = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
    }
    return true;
  };
}
