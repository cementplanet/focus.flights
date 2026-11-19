import {createCabinMesh} from "./cabin-mesh.js";

const fullscreen = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p*2.-1.,0.,1.);
}`;
const skyWidth = 320, skyHeight = 480;
// The original 2:3 camera, cropped slightly tighter for the website.
const zoom = 1.14;

async function read(path, binary = false) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(path + " returned " + response.status);
  return binary ? response.arrayBuffer() : response.text();
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
  const noise = [["shapeNoise","shape64",64], ["detailNoise","detail32",32], ["weatherNoise","weather512",512]];
  const [skySource, cabinVertex, cabinFragment, glassFragment, volumes] = await Promise.all([
    read("sky.glsl"), read("cabin.vert"), read("cabin.frag"), read("glass.frag"),
    Promise.all(noise.map(([, file]) => read("../data/noise/"+file+".bin", true))), aircraft.decode(),
  ]);
  if (gl.isContextLost()) return;
  const sky = program(gl, fullscreen, skySource, ["resolution","elapsed",...noise.map(([name])=>name)]);
  const glass = program(gl, fullscreen, glassFragment, ["resolution","elapsed","zoom","skyMap","aircraft"]);
  const cabin = program(gl, cabinVertex, cabinFragment, ["resolution","shade","zoom","skyMap"]);
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
  gl.useProgram(sky.handle);
  noise.forEach(([name,,size], unit) => {
    const volume = unit < 2, target = volume ? gl.TEXTURE_3D : gl.TEXTURE_2D;
    texture(unit, target, gl.REPEAT);
    const pixels = new Uint8Array(volumes[unit]);
    if (volume) gl.texImage3D(target,0,gl.RGBA8,size,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    else gl.texImage2D(target,0,gl.RGBA8,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    gl.uniform1i(sky[name],unit);
  });
  gl.uniform2f(sky.resolution,skyWidth,skyHeight);

  const skyTexture = texture(3,gl.TEXTURE_2D,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,skyWidth,skyHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  const target = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,target);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,skyTexture,0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Incomplete sky render target");
  texture(4,gl.TEXTURE_2D,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,aircraft);

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
    gl.uniform1i(pass.skyMap,3);
    gl.uniform1f(pass.zoom,zoom);
  }
  gl.useProgram(glass.handle);
  gl.uniform1i(glass.aircraft,4);
  let lastSkyTime;
  return function render(width,height,time,shade) {
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
    if (lastSkyTime !== time) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,target);
      gl.viewport(0,0,skyWidth,skyHeight);
      gl.useProgram(sky.handle);
      gl.uniform1f(sky.elapsed,time);
      gl.drawArrays(gl.TRIANGLES,0,3);
      lastSkyTime = time;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,width,height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(glass.handle);
    gl.uniform2f(glass.resolution,width,height);
    gl.uniform1f(glass.elapsed,time);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(cabin.handle);
    gl.uniform2f(cabin.resolution,width,height);
    gl.uniform1f(cabin.shade,shade);
    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);
  };
}

export function setupPortholeSky(canvas) {
  const host = canvas.parentElement;
  const sequence = host.closest(".deep-focus").parentElement;
  let nearby = false;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let softwareCanvas, render, loading, generation = 0, visible = false, frame = 0, lastTime = null, elapsed = 0;

  function draw(now) {
    frame = 0;
    if (lastTime === null || now-lastTime >= 1000/30-1 || motion.matches) {
      if (lastTime !== null && !motion.matches) elapsed += Math.min(.125,(now-lastTime)/1000);
      lastTime = now;
      const scale = Math.min(devicePixelRatio, 1600/Math.max(1,canvas.clientWidth,canvas.clientHeight));
      const w = Math.max(1,Math.round(canvas.clientWidth*scale)), h = Math.max(1,Math.round(canvas.clientHeight*scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; }
      render(w,h,elapsed, Number(getComputedStyle(host).getPropertyValue("--shade-drop")));
      canvas.dataset.ready = "";
    }
    if (visible && !sequence.hasAttribute("data-focus-handoff") && !motion.matches && (!softwareCanvas || host.getAnimations().some(a => a.transitionProperty === "--shade-drop"))) frame = requestAnimationFrame(draw);
  }

  async function prepare(version) {
    const gl = canvas.getContext("webgl2",{alpha:true,depth:true,antialias:true,premultipliedAlpha:true});
    let scene;
    if (gl && !gl.isContextLost()) {
      try { scene = await createScene(gl); }
      catch (error) { console.warn("Porthole WebGL:",error); }
    }
    if (!scene && version === generation) {
      const {softwareCabin} = await import("./cabin-software.js");
      const surface = document.createElement("canvas");
      surface.className = "porthole-frame";
      surface.setAttribute("aria-hidden","true");
      scene = await softwareCabin(surface,zoom);
      if (version !== generation) return;
      canvas.after(surface);
      softwareCanvas = surface;
    }
    if (version !== generation || !scene) return;
    render = scene;
    sync();
  }
  function sync() {
    cancelAnimationFrame(frame);
    lastTime = null;
    if ((!visible && !nearby) || document.hidden) return;
    if ((!visible || sequence.hasAttribute("data-focus-handoff")) && canvas.hasAttribute("data-ready")) return;
    if (render) draw(performance.now());
    else loading ??= prepare(generation).catch(error=>console.warn("Porthole:",error));
  }
  new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;
    sync();
  }).observe(canvas);
  // Prepare one still frame on the preceding screen. Resume cloud rendering after landing.
  new IntersectionObserver(([entry])=>{
    nearby = entry.isIntersecting;
    if (nearby && !canvas.hasAttribute("data-ready")) sync();
  }, {rootMargin:"90% 0px"}).observe(canvas);
  new MutationObserver(sync).observe(sequence,{attributes:true,attributeFilter:["data-focus-handoff"]});
  new ResizeObserver(sync).observe(canvas);
  for (const type of ["transitionrun","transitionend","transitioncancel"]) {
    host.addEventListener(type,event=>{if (softwareCanvas && event.propertyName==="--shade-drop") sync()});
  }
  // Reduced-motion still renders the current shade position on every interaction.
  new MutationObserver(()=>{if (motion.matches || softwareCanvas) sync()}).observe(host,{attributes:true,attributeFilter:["style"]});
  motion.addEventListener("change",sync);
  document.addEventListener("visibilitychange",sync);
  canvas.addEventListener("webglcontextlost",event=>{
    event.preventDefault();
    generation++;
    cancelAnimationFrame(frame);
    render = null;
    softwareCanvas?.remove();
    softwareCanvas = null;
    loading = null;
    delete canvas.dataset.ready;
    if (visible) sync();
  });
  canvas.addEventListener("webglcontextrestored",()=>{
    generation++;
    softwareCanvas?.remove();
    softwareCanvas = null;
    render = null;
    loading = null;
    sync();
  });
}
