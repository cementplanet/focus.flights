import { getHardwareContext } from "../hardware-gl.js";
import { prepareInvitation } from "./invitation.js?v=gift-sheet";

const project = `
  uniform vec3 eye, right, up, forward;
  uniform vec2 lens;
`;
// An orthographic light sees the same paper silhouette as the camera. Store
// height above the floor so the penumbra contracts naturally at contact.
const shadows = `
  uniform sampler2D shadowMap;
  vec2 shadowUV(vec3 p) {
    return (p.xy+vec2(.32,.49)*p.z)/6.+.5;
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
// Integrate neutral haze only along the visible ray. A card terminates the
// ray before the floor, so only air in front of its printed face contributes.
const studioAir = `
  float airLight(vec3 eyePos, vec3 ray, float distanceToSurface, float lift) {
    vec3 aim=mix(vec3(-.05,.42,.18),vec3(0.,2.48,1.3),lift);
    vec3 source=aim+vec3(-1.18,-.30,2.85);
    vec3 axis=normalize(aim-source);
    float nearT=max(0.,dot(source-eyePos,ray)-1.);
    float farT=min(distanceToSurface,dot(aim-eyePos,ray)+2.8);
    float stepT=max(0.,farT-nearT)/8.;
    float density=0.;
    for(int i=0;i<8;i++) {
      vec3 delta=eyePos+ray*(nearT+(float(i)+.5)*stepT)-source;
      float depth=dot(delta,axis);
      vec3 radial=delta-depth*axis;
      float radius=.34+.28*max(depth,0.);
      float profile=exp(-dot(radial,radial)/(radius*radius));
      density+=profile*smoothstep(-.3,.55,depth)*exp(-.30*max(depth,0.));
    }
    return density*stepT;
  }
`;
const stageVertex = `
  attribute vec2 corner;
  varying highp vec3 direction;
  varying highp vec2 screen;
  ${project}
  void main() {
    screen=corner;
    direction=forward+right*corner.x/lens.x+up*corner.y/lens.y;
    gl_Position=vec4(corner,0.,1.);
  }
`;
const stageFragment = runwaySource => `
  precision highp float;
  varying highp vec3 direction;
  varying highp vec2 screen;
  uniform sampler2D grain, airliner;
  uniform float landing;
  ${runwaySource}
  uniform vec3 atmosphere; // lift, viewport aspect, breathing phase
  uniform vec3 eye;
  ${shadows}
  ${studioAir}
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
    vec3 studio=mix(floorColor,vec3(.012,.016,.022),smoothstep(9.,28.,length(xy)));
    float haze=airLight(eye,normalize(direction),length(vec3(xy,0.)-eye),atmosphere.x);
    vec3 space=vec3(.025,.030,.039);
    vec2 rim=(screen-vec2(0.,-.42))*vec2(.86,1.15);
    space+=vec3(.038,.066,.091)*exp(-2.*dot(rim,rim));
    space+=floorColor*.19+textureValue*.009;
    vec3 scene=mix(studio,space,atmosphere.x);
    // Broaden the same shaft into skylight as the runway rises into frame.
    float diffusion=smoothstep(.06,.94,landing);
    scene+=vec3(.082,.084,.087)*haze*mix(.48,1.,atmosphere.x);
    if (landing>0.) {
      scene=mix(scene,runwayColor(screen,atmosphere.y,landing,atmosphere.z),diffusion);
      vec2 spread=vec2(screen.x*atmosphere.y/(.36+landing*.84),
        (screen.y-.94+landing*.68)/1.18);
      scene+=vec3(.095,.10,.112)*exp(-dot(spread,spread))*diffusion;
    }
    if (atmosphere.x>.001) {
      // Sparse motes catch the shaft at different depths. Use height units
      // so their diameter stays the same in portrait and landscape.
      vec2 cell=screen*vec2(atmosphere.y,1.)*5.;
      cell.y-=landing*2.35;
      cell+=vec2(.041,-.069)*atmosphere.z;
      vec2 id=floor(cell);
      vec3 seed=fract(vec3(id.xyx)*vec3(.1031,.1030,.0973));
      seed+=dot(seed,seed.yzx+33.33);
      vec2 center=.12+.76*fract((seed.xx+seed.yz)*seed.zy);
      vec2 d=fract(cell)-center;
      float mote=exp(-dot(d,d)*mix(830.,2300.,center.x));
      scene+=vec3(.22,.23,.24)*mote*min(haze+.38*diffusion,1.)*center.y*center.y;
    }
    gl_FragColor=vec4(scene,1.);
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

// Distance below the optical centre, expressed in viewport heights. An identical
// path in portrait and landscape brings the envelope through the bottom edge.
export function framingOffset(t) {
  return 1.80 * Math.pow(1-t, 2.35);
}

function cameraPose(t) {
  const remaining=Math.pow(1-t,1.85);
  const x=.14+2.65*remaining;
  const y=-1.86-6.65*remaining;
  const z=5.05+10.1*remaining;
  const aimY=.23+.21*t*t*(3-2*t);
  return {x,y,z,aimY};
}

async function prepare(gl, letterIsRising, isCurrent) {
  const [invitation,floor,plane,runwaySource]=await Promise.all([
    readImage("invitation.webp?v=lit-cards"),readImage("graphite.webp"),
    readImage("../aircraft/deep-focus-front.webp"),
    fetch(new URL("./runway.glsl?v=ignition",import.meta.url)).then(response=>{
      if (!response.ok) throw Error("Runway lighting could not load");
      return response.text();
    }),
  ]);
  // A late studio load can wait until the static card has finished entering.
  while (isCurrent() && letterIsRising()) await new Promise(resolve => requestAnimationFrame(resolve));
  if (!isCurrent() || gl.isContextLost()) return;
  function texture(image,repeat=false) {
    const handle=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,handle);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) {
      gl.texParameteri(gl.TEXTURE_2D,axis,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
    }
    const mipmaps=(image.width & (image.width-1))===0 && (image.height & (image.height-1))===0;
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    return handle;
  }
  const atlas=texture(invitation), ground=texture(floor,true);
  const planeTexture=texture(plane);
  const letter=prepareInvitation(gl,program,project,shadows,studioAir,atlas);
  const stage=program(gl,stageVertex,stageFragment(runwaySource),["corner"]);
  gl.useProgram(stage.handle);
  gl.uniform1i(gl.getUniformLocation(stage.handle,"shadowMap"),1);
  gl.uniform1i(gl.getUniformLocation(stage.handle,"airliner"),2);
  const landingUniform=gl.getUniformLocation(stage.handle,"landing");
  const atmosphere=gl.getUniformLocation(stage.handle,"atmosphere");
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
  let lastShadow=-1, lastLift=-1, lastSlip=-1, lastAir=-1;

  let previousLayout;
  return function draw(t,w,h,paperPhase,lift,slip,air,landing,cardLayout) {
    if (cardLayout !== previousLayout) {
      lastShadow=-1;
      previousLayout=cardLayout;
    }
    const groundPose=cameraPose(t);
    // The camera follows the rising sheet from the start. The retreating
    // sleeve stays in the wide frame briefly before passing the lower edge.
    const x=groundPose.x+.38*lift-.48*slip;
    const y=groundPose.y+1.85*lift;
    const z=groundPose.z+1.32*lift-.54*slip;
    const aimY=groundPose.aimY+2.04*slip+.64*slip*(1-slip);
    const horizontal=Math.hypot(x,aimY-y);
    const aspect=w/h, lensX=Math.min(3.58,3.34/aspect);
    const pitch=Math.atan2(.03+1.27*slip+.36*lift*(1-slip)-z,horizontal) + Math.atan(2*framingOffset(t)/(lensX*aspect));
    const rx=(aimY-y)/horizontal, ry=x/horizontal;
    const fx=-ry*Math.cos(pitch), fy=rx*Math.cos(pitch), fz=Math.sin(pitch);
    function camera(pass) {
      gl.useProgram(pass.handle);
      gl.uniform3f(pass.eye,x,y,z);
      gl.uniform3f(pass.forward,fx,fy,fz);
      gl.uniform3f(pass.right,rx,ry,0);
      gl.uniform3f(pass.up,fz*ry,-fz*rx,fy*rx-fx*ry);
      gl.uniform2f(pass.lens,lensX,lensX*aspect);
    }
    if(lastShadow!==paperPhase || lastLift!==lift || lastSlip!==slip || (slip<1 && lastAir!==air)) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D,atlas);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,shadowBuffer);
      gl.viewport(0,0,size,size);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      if (slip<1) letter(paperPhase,camera,true,lift,slip,air,cardLayout);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.bindTexture(gl.TEXTURE_2D,shadowTexture);
      gl.generateMipmap(gl.TEXTURE_2D);
      lastShadow=paperPhase; lastLift=lift; lastSlip=slip; lastAir=air;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,shadowTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D,planeTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.viewport(0,0,w,h);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    camera(stage);
    gl.uniform3f(atmosphere,lift,aspect,air);
    gl.uniform1f(landingUniform,landing);
    gl.bindBuffer(gl.ARRAY_BUFFER,corners);
    gl.enableVertexAttribArray(stage.corner);
    gl.vertexAttribPointer(stage.corner,2,gl.FLOAT,false,0,0);
    gl.bindTexture(gl.TEXTURE_2D,ground);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disableVertexAttribArray(stage.corner);
    gl.enable(gl.DEPTH_TEST);
    if (slip<1) letter(paperPhase,camera,false,lift,slip,air,cardLayout);
  };
}

export function setupStudio(canvas, download, welcome) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const gift = canvas.closest(".gift");
  let unavailable = false;
  let draw, loading, position = 1, paperPhase = 1, lift = 0, slip = 0, landing = 0;
  let visible = false, generation = 0, dirty = true, idleFrame = 0;
  let width = 1, height = 1;

  let cardLayout = [0, 0, 0];

  function render(now) {
    draw(position,canvas.width,canvas.height,paperPhase,lift,slip,lift ? now/1000 : 0,landing,cardLayout);
    if (!canvas.hasAttribute("data-ready")) canvas.setAttribute("data-ready", "");
    dirty = false;
  }
  function paint(now = performance.now()) {
    if (reducedMotion.matches) { delete canvas.dataset.ready; return; }
    if (!draw || !visible || document.hidden) return;
    if (dirty) render(now);
    if (slip === 1 && !idleFrame) {
      const last = now;
      function hover(time) {
        if (!visible || document.hidden || reducedMotion.matches || !draw || slip !== 1) {
          idleFrame = 0;
          return;
        }
        if (time-last < 1000/(landing === 1 ? 20 : 30)) { idleFrame = requestAnimationFrame(hover); return; }
        idleFrame = 0;
        dirty = true;
        paint(time);
      }
      idleFrame = requestAnimationFrame(hover);
    }
  }
  function resize() {
    const scale = Math.min(devicePixelRatio, 2, Math.sqrt(1600000 / (width * height)));
    const w = Math.max(1,Math.round(width*scale)), h = Math.max(1,Math.round(height*scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      dirty = true;
    }
    paint();
  }
  function warm() {
    if (unavailable || loading || reducedMotion.matches) return;
    const gl = getHardwareContext(canvas, "webgl", {alpha:false,antialias:true,depth:true,powerPreference:"low-power"});
    if (!gl) { unavailable = true; return; }
    if (gl.isContextLost()) return;
    const current = generation;
    loading = prepare(gl, () => gift.hasAttribute("data-letter-rising"), () => current === generation).then(renderer=>{
      if (current !== generation || !renderer) return;
      draw = renderer;
      if (reducedMotion.matches) return;
      // Prime the driver while the sky is on screen, before the first gesture.
      render(performance.now());
      paint();
    }).catch(error=>console.warn("Gift studio:",error));
  }
  const card = welcome.querySelector("button");
  const layoutObserver = new ResizeObserver(()=>{
    const bounds = welcome.getBoundingClientRect();
    const print = card.getBoundingClientRect();
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    cardLayout = [print.width / bounds.width,
      (print.left - bounds.left + (print.width - bounds.width) / 2) / bounds.width,
      (bounds.top - print.top + (bounds.height - print.height) / 2) / bounds.height];
    dirty = true;
    resize();
  });
  layoutObserver.observe(canvas);
  layoutObserver.observe(card);
  new IntersectionObserver(([entry])=>{
    if (entry.isIntersecting) warm();
  },{rootMargin:"100% 0px"}).observe(download);
  canvas.addEventListener("webglcontextlost",event=>{
    event.preventDefault();
    generation++;
    draw = loading = null;
    dirty = true;
    delete canvas.dataset.ready;
  });
  canvas.addEventListener("webglcontextrestored",warm);
  reducedMotion.addEventListener("change",()=>{
    if (reducedMotion.matches) delete canvas.dataset.ready;
    else if (visible) { dirty = true; warm(); paint(); }
  });
  document.addEventListener("visibilitychange",()=>paint());
  new IntersectionObserver(([entry])=>{
    visible = entry.isIntersecting;
    if (visible) { warm(); paint(); }
  }).observe(canvas);
  return (t,phase,rise=0,separation=0,approach=0)=>{
    dirty ||= position !== t || paperPhase !== phase || lift !== rise || slip !== separation || landing !== approach;
    position = t;
    paperPhase = phase;
    lift = rise;
    slip = separation;
    landing = approach;
    warm();
    paint();
  };
}
