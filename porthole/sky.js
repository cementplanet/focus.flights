import { getHardwareContext } from "../hardware-gl.js";
import { bindCloudNoise, cloudNoiseUniforms, loadCloudNoise } from "../cloud-noise.js";
import {createCabinMesh} from "./cabin-mesh.js";

const fullscreen = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p*2.-1.,0.,1.);
}`;
// The pane shares the inner gasket contour. A subpixel overlap seals the joint.
const paneVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
uniform float zoom;
uniform vec2 resolution;
uniform vec4 projection;
uniform vec2 tilt;
void main() {
  float z = 3.25 + position.z - projection.w;
  float y = position.y-.017+position.z*.065-tilt.y;
  vec2 lens = mat2(cos(tilt.x),sin(tilt.x),-sin(tilt.x),cos(tilt.x)) * vec2(y,z);
  z = lens.y;
  vec2 projected = 2.81 * vec2(position.x, lens.x*resolution.x/resolution.y);
  gl_Position = vec4(1.003*zoom*projection.z*projected + projection.xy*z, 0., z);
}`;
const skyWidth = 320, skyHeight = 480;
// The original 2:3 camera, cropped slightly tighter for the website.
const zoom = 1.14;

async function read(path) {
  const response = await fetch(new URL(path + "?v=cabin-light", import.meta.url));
  if (!response.ok) throw new Error(path + " returned " + response.status);
  return response.text();
}

function program(gl, vertex, fragment, names) {
  const handle = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(handle, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(handle);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle));
  const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(handle, name)]));
  return {handle, ...uniforms};
}

async function createScene(gl) {
  const aircraft = new Image();
  aircraft.src = new URL("airliner.webp", import.meta.url);
  const [skySource, cabinVertex, cabinFragment, glassFragment, volumes] = await Promise.all([
    read("sky.glsl"), read("cabin.vert"), read("cabin.frag"), read("glass.frag"),
    loadCloudNoise(), aircraft.decode(),
  ]);
  if (gl.isContextLost()) return;
  const sky = program(gl, fullscreen, skySource, ["resolution","elapsed","view","camera","aircraft",...cloudNoiseUniforms]);
  const glass = program(gl, paneVertex, glassFragment, ["resolution","projection","tilt","zoom","skyMap"]);
  const cabin = program(gl, cabinVertex, cabinFragment, ["resolution","projection","tilt","shade","zoom","skyMap"]);
  // Shade the moving view directly into the display-sized canvas.
  const paneSky = program(gl,paneVertex,skySource,
    ["resolution","elapsed","view","camera","aircraft","projection","zoom","tilt",...cloudNoiseUniforms]);
  const stencil = program(gl,paneVertex,`#version 300 es
    precision highp float;
    out vec4 pixel;
    void main() { pixel = vec4(0.); }`, ["resolution","zoom","projection","tilt"]);
  const defocus = program(gl,fullscreen,`#version 300 es
    precision highp float;
    uniform vec2 resolution;
    uniform float radius;
    uniform sampler2D liner;
    out vec4 pixel;
    void main() {
      vec2 uv = gl_FragCoord.xy/resolution;
      vec4 sum = texture(liner,uv)*2.;
      for (int i=0;i<8;i++) {
        float a = float(i)*.78539816;
        sum += texture(liner,uv + radius*vec2(cos(a),sin(a))/resolution);
      }
      pixel = sum*.1;
    }`, ["resolution","radius","liner"]);
  gl.useProgram(defocus.handle);
  gl.uniform1i(defocus.liner,5);
  gl.useProgram(stencil.handle);
  gl.uniform1f(stencil.zoom,zoom);
  function texture(unit, target, wrap) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, tex);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrap);
    return tex;
  }
  bindCloudNoise(gl, volumes);

  const skyUnit = 3, lightUnit = 6;
  const skyTexture = texture(skyUnit,gl.TEXTURE_2D,gl.CLAMP_TO_EDGE);
  const lightTexture = texture(lightUnit,gl.TEXTURE_2D,gl.CLAMP_TO_EDGE);
  function sizeSkyTextures(width,height) {
    for (const [unit, tex] of [[skyUnit,skyTexture],[lightUnit,lightTexture]]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    }
  }
  sizeSkyTextures(skyWidth,skyHeight);
  const target = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,target);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,skyTexture,0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,lightTexture,0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Incomplete sky render target");
  texture(4,gl.TEXTURE_2D,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,aircraft);

  const linerTexture = texture(5,gl.TEXTURE_2D,gl.CLAMP_TO_EDGE);
  const linerTarget = gl.createFramebuffer(), linerDepth = gl.createRenderbuffer();
  let linerWidth = 0, linerHeight = 0;
  function bindLiner(w,h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER,linerTarget);
    if (linerWidth === w && linerHeight === h) return;
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D,linerTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,linerTexture,0);
    gl.bindRenderbuffer(gl.RENDERBUFFER,linerDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH24_STENCIL8,w,h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.RENDERBUFFER,linerDepth);
    linerWidth=w; linerHeight=h;
  }
  const mesh = createCabinMesh();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
  for (const [slot,count,offset] of [[0,3,0],[1,3,12],[2,4,24]]) {
    gl.enableVertexAttribArray(slot);
    gl.vertexAttribPointer(slot,count,gl.FLOAT,false,40,offset);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  for (const pass of [glass,cabin]) {
    gl.useProgram(pass.handle);
    gl.uniform1i(pass.skyMap,pass === glass ? skyUnit : lightUnit);
    gl.uniform1f(pass.zoom,zoom);
  }
  for (const pass of [sky,paneSky]) {
    gl.useProgram(pass.handle);
    gl.uniform1i(pass.aircraft,4);
    cloudNoiseUniforms.forEach((name,i)=>gl.uniform1i(pass[name],i));
  }
  gl.useProgram(paneSky.handle);
  gl.uniform1f(paneSky.zoom,zoom);
  let lastSkyTime, lightWidth = skyWidth, lightHeight = skyHeight;

  function skyCamera(pass,w,h,time,view) {
    gl.uniform2f(pass.resolution,w,h);
    gl.uniform4f(pass.view,view?.x ?? .5,view?.skyCenterY ?? .5,view?.skyX ?? 1,view?.skyY ?? 1);
    gl.uniform3f(pass.camera,view?.pitch ?? 0,view?.rise ?? 0,view?.travel ?? 0);
    gl.uniform1f(pass.elapsed,time);
  }

  return function render(width,height,time,shade,view) {
    if (linerWidth > 1 && (!view || view.rise === 1250)) {
      bindLiner(1,1);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
    // At rest the sky texture covers only the glazing. Match its texels to the
    // pane's physical pixels so the first moving frame has the same detail.
    if (!view) {
      const w = Math.max(1,Math.ceil(width * zoom * .435));
      const h = Math.max(1,Math.ceil(width * zoom * 1.5 * .44));
      if (w !== lightWidth || h !== lightHeight) {
        sizeSkyTextures(w,h);
        lightWidth=w; lightHeight=h; lastSkyTime=undefined;
      }
    }
    if (lastSkyTime === undefined || (!view && lastSkyTime !== time)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,target);
      gl.viewport(0,0,lightWidth,lightHeight);
      gl.useProgram(sky.handle);
      skyCamera(sky,lightWidth,lightHeight,time,null);
      gl.drawArrays(gl.TRIANGLES,0,3);
      lastSkyTime = time;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,width,height);
    gl.stencilMask(0xff);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    if (view?.advance >= 3.49) {
      gl.useProgram(sky.handle);
      skyCamera(sky,width,height,time,view);
      gl.drawArrays(gl.TRIANGLES,0,3);
      return;
    }
    const projection = view ? [2*view.x-1,1-2*view.y,view.width,view.advance] : [0,0,1,0];
    const tilt = [view?.pitch ?? 0,view?.lift ?? 0];
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS,1,0xff);
    gl.stencilOp(gl.KEEP,gl.KEEP,gl.REPLACE);
    gl.bindVertexArray(vao);
    const pane = view ? paneSky : glass;
    gl.useProgram(pane.handle);
    gl.uniform4f(pane.projection,...projection);
    gl.uniform2f(pane.tilt,...tilt);
    if (view) skyCamera(pane,width,height,time,view);
    else gl.uniform2f(pane.resolution,width,height);
    gl.drawArrays(gl.TRIANGLE_FAN,0,mesh.apertureCount);
    // Only nearby molding goes out of focus. The cloud deck, stars and
    // aircraft remain native-resolution samples even at closest approach.
    const blur = view?.blur ?? 0;
    if (blur > .05) {
      bindLiner(width,height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.useProgram(stencil.handle);
      gl.uniform2f(stencil.resolution,width,height);
      gl.uniform4f(stencil.projection,...projection);
      gl.uniform2f(stencil.tilt,...tilt);
      gl.drawArrays(gl.TRIANGLE_FAN,0,mesh.apertureCount);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(cabin.handle);
    gl.uniform2f(cabin.resolution,width,height);
    gl.uniform1f(cabin.shade,shade);
    gl.uniform4f(cabin.projection,...projection);
    gl.uniform2f(cabin.tilt,...tilt);
    gl.stencilMask(0);
    gl.stencilFunc(gl.EQUAL,1,0xff);
    gl.drawElements(gl.TRIANGLES,mesh.indices.length-mesh.trimIndexCount,gl.UNSIGNED_SHORT,2*mesh.trimIndexCount);
    gl.disable(gl.STENCIL_TEST);
    gl.drawElements(gl.TRIANGLES,mesh.trimIndexCount,gl.UNSIGNED_SHORT,0);
    if (blur > .05) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(null);
      gl.useProgram(defocus.handle);
      gl.uniform2f(defocus.resolution,width,height);
      gl.uniform1f(defocus.radius,blur*devicePixelRatio);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.disable(gl.BLEND);
    }
  };
}

export function setupPortholeSky(canvas) {
  const host = canvas.parentElement;
  const sequence = host.closest(".deep-focus").parentElement;
  const inTransit = () => sequence.hasAttribute("data-focus-handoff") || sequence.hasAttribute("data-window-flight");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const stillInTransit = () => inTransit() && sequence.hasAttribute("data-static-porthole");
  let nearby = false, visible = false, camera = null, mount = host;
  let staticOnly = Boolean(navigator.connection?.saveData), contextLost = false;
  let render, loading, generation = 0, maxCanvasSize = 8192;
  let frame = 0, lastTime = null, elapsed = 0, previousFrame, slowFrames = 0;
  let stillApproach;

  function paintStill() {
    sequence.toggleAttribute("data-static-porthole", true);
    host.toggleAttribute("data-scene-ready", true);
    const approach = Math.min(1, (camera?.advance ?? 0) / 3.49);
    if (approach === stillApproach) return;
    stillApproach = approach;
    sequence.style.setProperty("--still-approach", approach);
  }

  function sampleFrame(now) {
    if (previousFrame !== undefined) {
      slowFrames = now - previousFrame > 40 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    }
    previousFrame = now;
    if (slowFrames < 5) return true;
    // Keep the rest of the visit on the still after repeated missed frames.
    staticOnly = true;
    paintStill();
    return false;
  }

  function draw(now) {
    if (camera || lastTime === null || now - lastTime >= 1000 / 30 - 1) {
      if (lastTime !== null && !inTransit() && !camera) elapsed += Math.min(.125, (now - lastTime) / 1000);
      lastTime = now;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const scale = Math.min(devicePixelRatio, maxCanvasSize / Math.max(1, width, height));
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      render(w, h, elapsed, Number(host.style.getPropertyValue("--shade-drop")), camera);
      if (!canvas.hasAttribute("data-ready")) {
        canvas.setAttribute("data-ready", "");
        host.setAttribute("data-scene-ready", "");
      }
      sequence.removeAttribute("data-static-porthole");
    }
    if (!camera && visible && !inTransit()) frame = requestAnimationFrame(animate);
  }

  function animate(now) {
    frame = 0;
    if (sampleFrame(now)) draw(now);
  }

  async function prepare(version) {
    const gl = getHardwareContext(canvas, "webgl2", {
      alpha: true,
      depth: true,
      stencil: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) {
      staticOnly = true;
      paintStill();
      return;
    }
    if (gl.isContextLost()) return;
    maxCanvasSize = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
    const scene = await createScene(gl);
    if (version !== generation || !scene) return;
    render = scene;
    sync();
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = null;
    if (document.hidden || (!camera && !visible && !nearby)) {
      previousFrame = undefined;
      slowFrames = 0;
      return;
    }
    // Finish the same shot with the still if WebGL becomes ready partway through.
    if (staticOnly || motion.matches || contextLost || (render && stillInTransit())) {
      paintStill();
      return;
    }
    if (!render) {
      if (visible || camera) paintStill();
      const version = generation;
      loading ??= prepare(version).catch(error => {
        if (version !== generation) return;
        staticOnly = true;
        paintStill();
        console.warn("Porthole WebGL:", error);
      });
      return;
    }
    if (!camera && (!visible || inTransit()) && canvas.hasAttribute("data-ready") &&
      !sequence.hasAttribute("data-static-porthole")) {
      previousFrame = undefined;
      slowFrames = 0;
      return;
    }
    draw(performance.now());
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.intersectionRatio >= .001;
    sync();
  }, { threshold: .001 }).observe(host.closest(".focus-window-stage"));
  // Prepare the still and the first WebGL frame on the preceding screen.
  new IntersectionObserver(([entry]) => {
    nearby = entry.isIntersecting;
    sync();
  }, { rootMargin: "90% 0px" }).observe(host);
  new MutationObserver(sync).observe(sequence, { attributes: true, attributeFilter: ["data-focus-handoff", "data-window-flight"] });
  new ResizeObserver(sync).observe(canvas);
  new MutationObserver(() => {
    if (!render || sequence.hasAttribute("data-static-porthole") || document.hidden || (!visible && !nearby)) return;
    if (inTransit()) {
      cancelAnimationFrame(frame);
      lastTime = null;
      draw(performance.now());
    }
  }).observe(host, { attributes: true, attributeFilter: ["style"] });
  motion.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    contextLost = true;
    generation++;
    render = loading = null;
    delete canvas.dataset.ready;
    sync();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    loading = null;
    sync();
  });

  return function setCamera(next, destination) {
    if (!next && !camera && mount === host) return;
    if (Boolean(next) !== Boolean(camera)) {
      previousFrame = undefined;
      slowFrames = 0;
    }
    camera = next;
    if (mount !== destination) {
      mount = destination;
      canvas.classList.toggle("flight-camera", Boolean(camera));
      mount.append(canvas);
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = null;
    }
    if (camera && render && !staticOnly && !motion.matches && !stillInTransit() && !document.hidden) {
      const now = performance.now();
      if (sampleFrame(now)) draw(now);
    } else {
      sync();
    }
  };
}
