import { prepareInvitation } from "./invitation.js?v=ground-letter";

const project = `
  uniform vec3 eye, right, up, forward;
  uniform vec2 lens;
`;
// An orthographic light sees the same paper silhouette as the camera. Store
// height above the floor so the penumbra contracts naturally at contact.
const shadows = `
  uniform sampler2D shadowMap;
  vec2 shadowUV(vec3 p) {
    return (p.xy+vec2(.54,-.73)*p.z)/6.+.5;
  }
  float blocks(vec2 uv,float height) {
    return smoothstep(.006,.032,2.4*texture2D(shadowMap,uv).r-height);
  }
  float paperShadow(vec3 p,float bias) {
    vec2 uv=shadowUV(p);
    float h=p.z+bias;
    float gap=max(0.,2.4*texture2D(shadowMap,uv).r-h);
    vec2 stepUV=vec2(.003+.014*min(1.,gap));
    return .28*blocks(uv,h)+.18*(blocks(uv+stepUV*vec2(.83,.55),h)
      +blocks(uv-stepUV*vec2(.83,.55),h)+blocks(uv+stepUV*vec2(-.55,.83),h)
      +blocks(uv-stepUV*vec2(-.55,.83),h));
  }
`;
const stageVertex = `
  attribute vec2 corner;
  varying highp vec3 direction;
  ${project}
  void main() {
    direction=forward+right*corner.x/lens.x+up*corner.y/lens.y;
    gl_Position=vec4(corner,0.,1.);
  }
`;
const stageFragment = `
  precision highp float;
  varying highp vec3 direction;
  uniform sampler2D grain;
  uniform vec3 eye;
  ${shadows}
  void main() {
    vec2 xy=eye.xy+eye.z/max(.001,-direction.z)*direction.xy;
    vec2 offset=xy-vec2(-.62,.68);
    float pool=exp(-dot(offset*vec2(.42,.36),offset*vec2(.42,.36)));
    float fill=exp(-.085*dot(xy+vec2(2.,1.),xy+vec2(2.,1.)));
    float textureValue=texture2D(grain,xy*.38).r-.5;
    vec3 floorColor=vec3(.026,.030,.036)+vec3(.137,.131,.119)*pool+vec3(.027,.032,.041)*fill;
    floorColor*=1.+.32*textureValue;
    // Contact and airborne silhouettes use different penumbras. Filter the
    // elevated paper over a wider area while preserving the crease at rest.
    vec2 uv=shadowUV(vec3(xy,0.));
    float contact=texture2D(shadowMap,uv,.65).g;
    vec4 broad=texture2D(shadowMap,uv,4.7);
    float floorShadow=.88*contact+.62*(broad.b-broad.g);
    floorColor*=1.-.62*floorShadow;
    gl_FragColor=vec4(mix(vec3(.012,.016,.022),floorColor,1.-smoothstep(9.,28.,length(xy))),1.);
  }
`;

function program(gl, vertex, fragment, attributes) {
  const handle = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(handle,shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(handle);
  if (!gl.getProgramParameter(handle,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle));
  const locations = {};
  for (const name of attributes) locations[name] = gl.getAttribLocation(handle,name);
  for (const name of ["eye","right","up","forward","lens"]) locations[name] = gl.getUniformLocation(handle,name);
  return {handle,...locations};
}

async function readImage(file) {
  const image=new Image();
  image.src=new URL(file,import.meta.url);
  await image.decode();
  return image;
}

export function descent(t) {
  return 1-Math.pow(1-t,3.8);
}

function cameraPose(t) {
  const remaining=1-descent(t);
  const x=.14+2.65*remaining;
  const y=-1.86-6.65*remaining;
  const z=5.05+10.1*remaining;
  const aimY=.23+.21*t*t*(3-2*t);
  const aimZ=.03+17.5*Math.pow(remaining,2.6);
  return {x,y,z,aimY,aimZ};
}

export function skyPitch(t) {
  const {x,y,z,aimY,aimZ}=cameraPose(t);
  return Math.atan2(aimZ-z,Math.hypot(x,y-aimY));
}

async function prepare(gl) {
  const [invitation,floor]=await Promise.all([readImage("invitation.webp?v=silk-slide"),readImage("graphite.webp")]);
  if (gl.isContextLost()) return;
  function texture(image,repeat=false) {
    const handle=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,handle);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) {
      gl.texParameteri(gl.TEXTURE_2D,axis,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
    }
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return handle;
  }
  const atlas=texture(invitation), ground=texture(floor,true);
  const letter=prepareInvitation(gl,program,project,shadows,atlas);
  const stage=program(gl,stageVertex,stageFragment,["corner"]);
  gl.useProgram(stage.handle);
  gl.uniform1i(gl.getUniformLocation(stage.handle,"shadowMap"),1);
  const corners=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,corners);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);

  const size=512;
  const shadowTexture=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,shadowTexture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);
  const shadowBuffer=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,shadowBuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,shadowTexture,0);
  const depth=gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
  gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,size,size);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw Error("Invitation shadow buffer unavailable");
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  let lastShadow=-1;

  return function draw(t,w,h) {
    const {x,y,z,aimY,aimZ}=cameraPose(t);
    const horizontal=Math.hypot(x,aimY-y);
    const distance=Math.hypot(horizontal,aimZ-z);
    const fx=-x/distance, fy=(aimY-y)/distance, fz=(aimZ-z)/distance;
    const rx=(aimY-y)/horizontal, ry=x/horizontal;
    const aspect=w/h, lensX=Math.min(3.58,3.34/aspect);
    function camera(pass) {
      gl.useProgram(pass.handle);
      gl.uniform3f(pass.eye,x,y,z);
      gl.uniform3f(pass.forward,fx,fy,fz);
      gl.uniform3f(pass.right,rx,ry,0);
      gl.uniform3f(pass.up,fz*ry,-fz*rx,fy*rx-fx*ry);
      gl.uniform2f(pass.lens,lensX,lensX*aspect);
    }
    if(lastShadow!==t) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D,atlas);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,shadowBuffer);
      gl.viewport(0,0,size,size);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      letter(t,camera,true);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.bindTexture(gl.TEXTURE_2D,shadowTexture);
      gl.generateMipmap(gl.TEXTURE_2D);
      lastShadow=t;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,shadowTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.viewport(0,0,w,h);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    camera(stage);
    gl.bindBuffer(gl.ARRAY_BUFFER,corners);
    gl.enableVertexAttribArray(stage.corner);
    gl.vertexAttribPointer(stage.corner,2,gl.FLOAT,false,0,0);
    gl.bindTexture(gl.TEXTURE_2D,ground);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disableVertexAttribArray(stage.corner);
    gl.enable(gl.DEPTH_TEST);
    letter(t,camera,false);
  };
}

export function setupStudio(canvas, download) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let unavailable = false;
  let draw, loading, position = 1, visible = false, generation = 0, last = -1;
  let pixelBudget = 1600000, width = 1, height = 1, idleFrame = 0;
  function paint() {
    if (!draw || !visible || document.hidden || reducedMotion.matches || last === position) return;
    draw(position,canvas.width,canvas.height);
    canvas.dataset.ready = "";
    last = position;
  }
  function resize(budget = position === 1 ? 1600000 : pixelBudget) {
    const scale = Math.min(devicePixelRatio,2,Math.sqrt(budget/(width*height)));
    canvas.width = Math.max(1,Math.round(width*scale));
    canvas.height = Math.max(1,Math.round(height*scale));
    last = -1;
    paint();
  }
  function warm() {
    if (unavailable || loading || reducedMotion.matches) return;
    const gl = canvas.getContext("webgl",{alpha:false,antialias:true,depth:true,powerPreference:"low-power"});
    if (!gl) { unavailable = true; return; }
    if (gl.isContextLost()) return;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info && /swiftshader|llvmpipe|software/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) {
      pixelBudget = 175000;
      resize();
    }
    const current = generation;
    loading = prepare(gl).then(renderer=>{
      if (current !== generation || !renderer) return;
      draw = renderer;
      if (reducedMotion.matches) return;
      // Prime the driver while the sky is on screen, before the first gesture.
      draw(position,canvas.width,canvas.height);
      canvas.dataset.ready = "";
      last = position;
    }).catch(error=>console.warn("Gift studio:",error));
  }
  new ResizeObserver(([entry])=>{
    ({width,height} = entry.contentRect);
    resize();
  }).observe(canvas);
  new IntersectionObserver(([entry])=>{
    if (entry.isIntersecting) warm();
  },{rootMargin:"100% 0px"}).observe(download);
  canvas.addEventListener("webglcontextlost",event=>{
    event.preventDefault();
    generation++;
    draw = loading = null;
    last = -1;
    delete canvas.dataset.ready;
  });
  canvas.addEventListener("webglcontextrestored",warm);
  reducedMotion.addEventListener("change",()=>{
    if (reducedMotion.matches) delete canvas.dataset.ready;
    else if (visible) { last = -1; warm(); paint(); }
  });
  document.addEventListener("visibilitychange",paint);
  new IntersectionObserver(([entry])=>{
    if (canvas.closest("[data-gift-descent]")) return;
    visible = entry.isIntersecting;
    if (visible) { position = 1; warm(); paint(); }
  }).observe(canvas);
  return t=>{
    visible = true;
    const leavingRest = position === 1 && t < 1;
    position = t;
    warm();
    cancelAnimationFrame(idleFrame);
    if (leavingRest && pixelBudget < 1600000) resize();
    else paint();
    // Software rasterizers use a smaller moving frame, then resolve once at rest.
    if (t === 1 && pixelBudget < 1600000) {
      idleFrame = requestAnimationFrame(()=>{ if (visible && position === 1) resize(1600000); });
    }
  };
}
