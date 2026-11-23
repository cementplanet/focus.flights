// Noise volumes generated from Leonxlnx/halo-above-the-clouds at 1d08819 (MIT, see LICENSE-halo).
export async function startClouds(canvas, sky, aircraft, camera) {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return;

  async function asset(path) {
    const response = await fetch(new URL(path, import.meta.url));
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

  const [fragment, shadow, shape, detail, weather] = await Promise.all([
    asset("clouds.glsl?v=cloud-perf").then((response) => response.text()),
    asset("aircraft/shadow.bin?v=airliner-clay-2").then((response) => response.arrayBuffer()),
    ...["shape64", "detail32", "weather512"].map((name) =>
      asset(`data/noise/${name}.bin`).then((response) => response.arrayBuffer())),
  ]);

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
    "shapeNoise", "detailNoise", "weatherNoise", "aircraftShadow", "aircraftDistance", "aircraftOffset", "resolution",
    "elapsed", "cameraHeight", "deckDepth", "night", "shadowColor", "lightColor", "skyMid", "skyHorizon",
  ].map((name) => [name, gl.getUniformLocation(program, name)]));

  function upload(name, unit, size, data, volume, format = gl.RGBA) {
    const target = volume ? gl.TEXTURE_3D : gl.TEXTURE_2D;
    const channels = format === gl.RED ? 1 : 4;
    if (data.byteLength !== size ** (volume ? 3 : 2) * channels) {
      throw new Error(`Invalid size for ${name}`);
    }
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, gl.createTexture());
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const pixels = new Uint8Array(data);
    if (volume) {
      gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.REPEAT);
      gl.texImage3D(target, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else {
      const internalFormat = format === gl.RED ? gl.R8 : gl.RGBA8;
      gl.texImage2D(target, 0, internalFormat, size, size, 0, format, gl.UNSIGNED_BYTE, pixels);
    }
    gl.uniform1i(uniforms[name], unit);
  }

  upload("shapeNoise", 0, 64, shape, true);
  upload("detailNoise", 1, 32, detail, true);
  upload("weatherNoise", 2, 512, weather, false);
  upload("aircraftShadow", 3, 128, shadow, false, gl.RED);

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const epoch = performance.now();
  let frameAt = -Infinity;
  let lastPalette;
  let lastCamera;
  let elapsed = 0;
  let flightTime = 0;
  let previousAnimationAt;
  let previousMotion;
  let lastRenderedReduced;
  let aircraftOffset = [0, 0];
  let pendingFrame;
  gl.enable(gl.SCISSOR_TEST);

  function render(now) {
    requestAnimationFrame(render);
    const delta = Math.min(now - (previousAnimationAt ?? now), 50);
    previousAnimationAt = now;
    const view = camera();
    if (document.hidden || view.visible === false) return;

    const reduce = reducedMotion.matches;
    if (!reduce) flightTime += delta / 1000;
    const motion = reduce ? null : flightTime;
    const motionPreferenceChanged = lastRenderedReduced !== reduce;
    if (motion !== previousMotion) {
      aircraftOffset = aircraft.animate(motion);
      previousMotion = motion;
    }
    const moved = view.height !== lastCamera?.height;
    if (view.height <= -560 && lastCamera?.height <= -560) return;
    // During camera travel submit on every display callback. Throttle only ambient drift.
    if (!view.travel && !moved && !motionPreferenceChanged && now - frameAt < (reduce ? 1000 : 65)) return;
    if (pendingFrame) {
      if (!view.travel && !moved && gl.clientWaitSync(pendingFrame, 0, 0) === gl.TIMEOUT_EXPIRED) return;
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
    if (reduce && !moved && !motionPreferenceChanged && !resized && palette === lastPalette) return;

    if (!reduce) elapsed += Math.min(now - Math.max(frameAt, epoch), 125) / 1000;
    frameAt = now;
    lastRenderedReduced = reduce;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
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

    const cleared = view.height <= -560;
    const aboveDeck = view.height >= 1120;
    if (resized || cleared || aboveDeck !== (lastCamera?.height >= 1120)) {
      gl.scissor(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // Above the deck, the shader produces no mist or cloud above the ray horizon.
      if (aboveDeck) gl.scissor(0, 0, width, Math.ceil(height * 0.452));
    }
    lastCamera = view;
    if (cleared) return;
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
  }

  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  requestAnimationFrame(render);
}
