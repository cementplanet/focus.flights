// Sample the outgoing device and type once. Only texture coordinates change as the spring moves.
const vertex = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * vec2(.5, -.5) + .5;
  gl_Position = vec4(position, 0., 1.);
}`;

const fragment = `
precision highp float;
uniform sampler2D scene;
uniform vec2 size, origin;
uniform float progress;
varying vec2 uv;
void main() {
  vec2 delta = (uv - origin) * size;
  float radius = length(delta);
  vec2 direction = delta / max(1., radius);
  float reach = length(max(origin, 1. - origin) * size);
  float band = clamp(min(size.x, size.y) * .095, 32., 100.);
  float crest = mix(-2. * band, reach + 2. * band, progress);
  float x = (radius - crest) / band;
  // Opposing slopes compress the leading edge and stretch its wake.
  float strength = smoothstep(0., .08, progress) * (1. - .32 * progress);
  float bend = sin(3.1 * x) * exp(-1.45 * x * x);
  float echo = x + 1.72;
  bend += .31 * sin(3.4 * echo) * exp(-2. * echo * echo);
  vec2 offset = direction * band * .59 * strength * bend / size;
  vec2 sampleUV = uv - offset;
  float wake = 1. - smoothstep(-2.5, -.12, x);
  vec2 spread = direction * wake * 2.6 / size;
  vec4 ink = texture2D(scene, sampleUV) * .5
           + .25 * (texture2D(scene, sampleUV - spread) + texture2D(scene, sampleUV + spread));
  ink *= 1. - wake;
  float shadow = wake * (.1 + .9 * smoothstep(.24, .88, progress));
  vec4 dark = vec4(vec3(.043, .049, .056) * shadow, shadow);
  gl_FragColor = ink + dark * (1. - ink.a);
}`;

function createPass(canvas) {
  const gl = canvas.getContext("webgl", {alpha:true, antialias:false, depth:false, stencil:false});
  if (!gl) return;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return; }
  gl.useProgram(program);
  const pos = gl.getAttribLocation(program, "position");
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const param of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, param, gl.LINEAR);
  for (const param of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, param, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const size = gl.getUniformLocation(program, "size"), origin = gl.getUniformLocation(program, "origin");
  const progress = gl.getUniformLocation(program, "progress");
  return {
    upload(image, rect, x, y) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform2f(size, rect.width, rect.height);
      gl.uniform2f(origin, x / rect.width, y / rect.height);
    },
    draw(t) {
      gl.uniform1f(progress, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}

function sampleShowcase(ctx, section) {
  const items = [...section.querySelectorAll(".device-orbit-item")];
  items.sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
  for (const item of items) {
    if (item.style.visibility === "hidden") continue;
    for (const image of item.querySelectorAll("img, video")) {
      const css = getComputedStyle(image);
      if (css.visibility === "hidden" || Number(css.opacity) <= .005) continue;
      if (image.tagName === "VIDEO" ? image.readyState < 2 : !image.naturalWidth) continue;
      const bounds = image.getBoundingClientRect();
      ctx.globalAlpha = Number(item.style.opacity) * Number(css.opacity);
      ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
    }
  }
  ctx.globalAlpha = 1;
  for (const word of section.querySelectorAll(".showcase-copy .motion-word")) {
    const css = getComputedStyle(word), rect = word.getBoundingClientRect();
    ctx.font = css.fontWeight + " " + css.fontSize + " " + css.fontFamily;
    ctx.letterSpacing = css.letterSpacing;
    ctx.fillStyle = css.color;
    const metrics = ctx.measureText(word.textContent);
    const baseline = rect.y + (rect.height + metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
    ctx.fillText(word.textContent, rect.x, baseline);
  }
}

export function setupFocusRipple(section) {
  const canvas = document.createElement("canvas");
  canvas.className = "focus-ripple";
  canvas.setAttribute("aria-hidden", "true");
  section.append(canvas);
  const source = document.createElement("canvas");
  let pass, attempted = false;
  function prepare() {
    if (attempted) return;
    attempted = true;
    pass = createPass(canvas);
  }
  // Compile while viewing the device screen, before the scroll gesture.
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !matchMedia("(prefers-reduced-motion: reduce)").matches) prepare();
  });
  observer.observe(section);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    pass = null;
    section.removeAttribute("data-ripple");
  });
  canvas.addEventListener("webglcontextrestored", () => { attempted = false; });
  return {
    capture(x, y) {
      prepare();
      if (!pass) return;
      const rect = section.getBoundingClientRect();
      const scale = Math.min(devicePixelRatio, 1.25, 1400 / Math.max(rect.width, rect.height));
      canvas.width = source.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = source.height = Math.max(1, Math.round(rect.height * scale));
      const ctx = source.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, -rect.x * scale, -rect.y * scale);
      sampleShowcase(ctx, section);
      pass.upload(source, rect, x, y);
      section.setAttribute("data-ripple", "");
    },
    draw(t) { pass?.draw(t); },
    end() { section.removeAttribute("data-ripple"); }
  };
}
