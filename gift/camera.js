import { prepareInvitation } from "./invitation.js?v=silk-slide";

// World coordinates are metres, with Z up. The mesh and both lightmaps share
// the Blender studio's coordinates, so shadows stay fixed as the camera descends.
const project = `
  uniform vec3 eye, right, up, forward;
  uniform vec2 lens;
`;
// Cross-section of the softbox beam, in metres relative to its centre line.
const beam = `
  vec2 beamOffset(vec3 p) { return p.xy + vec2(.51,.31)*p.z; }
`;
const modelVertex = `
  attribute vec3 position, normal;
  attribute float material, part, thread;
  uniform float shot;
  attribute vec2 uv;
  varying vec3 world, surfaceNormal;
  varying vec2 texCoord;
  varying float finish, opening, lidFace, bandFace;
  ${project}
  // Unwrapped arc length around the lid shoulder, side wall and floor.
  // The circular fillets meet each straight run with a common tangent.
  vec2 hemPath(float distance) {
    float a=abs(distance);
    float lip=clamp((a-1.44)/.115,0.,1.5707963);
    float side=clamp(a-1.44-.180642,0.,2.199);
    float foot=clamp((a-3.819642)/.13,0.,1.5707963);
    float x=min(a,1.44)+.115*sin(lip)+.13*(1.-cos(foot))+max(0.,a-4.023846);
    float z=2.466-.115*(1.-cos(lip))-side-.13*sin(foot);
    return vec2(sign(distance)*x,z);
  }
  void main() {
    world = position / 8000.;
    vec3 n = normal;
    float lid = smoothstep(.495,.745,shot);
    lidFace = float(part == 1.);
    bandFace = float(part >= 2. && part <= 5.);
    opening = smoothstep(.317,.492,shot);
    if (part == 1.) {
      // The front edge clears the rim before the lid rolls away over the back.
      float angle = -2.88*lid;
      mat2 swing = mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
      world.yz = swing*(world.yz-vec2(1.54,2.16))+vec2(1.54,2.16);
      n.yz = swing*n.yz;
      world += vec3(-.70*lid,.72*lid,.55*sin(lid*3.14159)-1.98*lid);
    } else if (part>=2.) {
      // The centre of both bands and the bow ride the same rounded corner.
      // The bow stays threaded while the free lengths slide up the far faces.
      float slide = smoothstep(.29,.67,shot);
      float travel = 4.46*slide;
      vec2 centre = hemPath(travel);
      float spill = .66*smoothstep(1.12,2.8,travel);
      vec3 knot = vec3(vec2(centre.x+spill),centre.y);
      float settle = smoothstep(1.85,4.36,travel);
      if (part<=5.) {
        bool across=part<4.;
        float along=across ? world.x : world.y;
        float width=across ? world.y : world.x;
        float length=sign(along)*(abs(along)+max(0.,2.466-world.z));
        float drag=.15*sin(3.14159*slide)*smoothstep(.12,2.8,abs(length));
        float advance=travel-drag;
        vec2 path=hemPath(length+advance);
        float edge=smoothstep(.72,1.58,length+advance);
        float reach=path.x+spill*edge;
        float lateral=width+knot.y;
        // On clearing the lip, the trailing lengths settle in broad curves.
        float wave=sin(1.65*length)*(.25+.08*cos(length));
        reach=mix(reach,knot.x+.90*length,settle);
        lateral+=settle*wave;
        float arch=.054*sin(slide*3.14159)*(1.-cos(2.2*length));
        float height=mix(path.y,knot.z+.045*(1.-cos(2.8*length)),settle)+arch;
        vec3 moved=vec3(across?reach:lateral,across?lateral:reach,max(.019,height)+(across?.009:0.));
        world=mix(world,moved,smoothstep(0.,.13,travel));
        vec2 tangent=hemPath(length+advance+.024)-path;
        tangent=mix(tangent,vec2(.022,0.),settle);
        n=normalize(vec3(across?-tangent.y:0.,across?0.:-tangent.y,tangent.x));
      } else {
        vec3 local=world-vec3(0.,0.,2.466);
        float flex=sin(thread*3.14159);
        float bend=sin(slide*3.14159);
        if (part==6. || part==7.) {
          local.x*=1.+.20*slide*flex;
          local.y+=.13*bend*flex;
          local.z*=1.-.57*slide*flex;
        } else if (part<10.) {
          local.z+=.15*bend*thread*sin(4.*thread+3.*slide);
          local.y-=.12*slide*thread;
        }
        // Roll the tied bow over the lip as a unit about its pinned stem.
        float angle=.55*bend*smoothstep(1.,2.3,travel);
        mat2 roll=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
        local.xz=roll*local.xz;
        n.xz=roll*n.xz;
        world=knot+local;
      }
    }
    vec3 delta = world - eye;
    float depth = dot(delta, forward);
    gl_Position = vec4(dot(delta, right)*lens.x, dot(delta, up)*lens.y,
                       1.002*depth-.1001, depth);
    surfaceNormal = n;
    texCoord = uv;
    finish = material;
  }
`;
const modelFragment = `
  precision highp float;
  uniform sampler2D lightmap, openMap;
  uniform float stageLight;
  uniform vec3 eye;
  uniform float shot, bandCentre;
  varying vec3 world, surfaceNormal;
  varying vec2 texCoord;
  varying float finish, opening, lidFace, bandFace;
  void main() {
    vec3 base = texture2D(lightmap, texCoord).rgb;
    vec3 n = normalize(surfaceNormal), v = normalize(eye-world);
    // The diffuse light and occlusion are baked. Broad softbox reflections
    // turn across the folds of the silk with the spectator's viewing angle.
    vec3 key = normalize(vec3(-3.1,-2.8,7.8)-world);
    vec3 rim = normalize(vec3(2.9,2.1,4.6)-world);
    float satin = step(.5,finish);
    float gloss = pow(max(0.,dot(n,normalize(key+v))),mix(32.,54.,satin));
    float edge = pow(max(0.,dot(n,normalize(rim+v))),36.);
    vec3 exposed=texture2D(openMap,texCoord).rgb;
    base=mix(base,exposed,opening*(1.-satin));
    // The underside faces the floor in the closed bake and the top faces the
    // floor in the open bake. Light the travelling lid in its current orientation.
    vec3 lidPaper=vec3(.93,.90,.85)*(.40+.51*max(0.,dot(n,key))+.08*max(0.,dot(n,rim)));
    base=mix(base,lidPaper,opening*lidFace);
    // Move the contact shadow with the silk. A stationary baked stripe reads
    // as a second ribbon after the actual band has slipped across the paper.
    vec2 fromBow=world.xy-vec2(bandCentre);
    float bandShadow=1.-smoothstep(.135,.238,min(abs(fromBow.x),abs(fromBow.y)));
    float bowShadow=exp(-dot(fromBow*vec2(1.75,3.2),fromBow*vec2(1.75,3.2)))*smoothstep(2.38,2.46,world.z);
    base*=1.-(.16*bandShadow+.21*bowShadow)*(1.-satin)*(1.-smoothstep(.31,.455,shot));
    vec3 movingSilk=vec3(.106,.215,.338)*(.60+.55*max(0.,dot(n,key)));
    base=mix(base,movingSilk,bandFace);
    // Both sides of the loosened satin now catch the bounced studio light.
    base=mix(base,max(base,vec3(.055,.105,.17)),opening*satin);
    vec3 color=base+gloss*mix(vec3(.035),vec3(.39,.415,.46),satin)
                   +edge*mix(vec3(.015),vec3(.21,.24,.3),satin);
    gl_FragColor=vec4(color*stageLight,1.);
  }
`;
const stageVertex = `
  precision highp float;
  attribute vec2 corner;
  varying vec3 direction;
  ${project}
  void main() {
    direction = forward + right*corner.x/lens.x + up*corner.y/lens.y;
    gl_Position = vec4(corner,0.,1.);
  }
`;
const stageFragment = `
  precision highp float;
  uniform sampler2D lightmap, openMap;
  uniform float stageLight;
  uniform vec3 eye;
  uniform float floorReveal;
  varying vec3 direction;
  ${beam}
  void main() {
    float distance = direction.z < -.001 ? -eye.z/direction.z : 100000.;
    vec2 xy = eye.xy + distance*direction.xy;
    vec3 floorLight = texture2D(lightmap, clamp(xy/24.+.5,0.,1.)).rgb;
    floorLight=mix(floorLight,texture2D(openMap,clamp(xy/24.+.5,0.,1.)).rgb,floorReveal);
    float footprint = 1.-smoothstep(8.,11.9,max(abs(xy.x),abs(xy.y)));
    vec3 color = max(vec3(.011,.014,.019), floorLight*footprint);
    // Closest approach of this view ray to the lit air above the floor.
    vec3 origin = vec3(beamOffset(eye)/vec2(2.7,2.2), (eye.z-3.)/5.2);
    vec3 ray = vec3(beamOffset(direction)/vec2(2.7,2.2), direction.z/5.2);
    float along = -dot(origin,ray)/dot(ray,ray);
    vec3 offset = origin + ray*along;
    float haze = exp(-dot(offset,offset)) * smoothstep(0.,3.,along)
               * smoothstep(-2.5,2.5,distance-along);
    color *= stageLight;
    color += vec3(.095,.115,.143)*haze;
    gl_FragColor = vec4(color,1.);
  }
`;

const dustVertex = `
  attribute vec4 mote;
  uniform float seconds, pixelLens;
  varying mediump vec3 tint;
  varying mediump float intensity, softness;
  ${project}
  ${beam}
  void main() {
    float seed = mote.w, phase = seed*58.;
    float drift = seconds*(.11 + seed*.12);
    vec3 p = mote.xyz + vec3(.24*sin(drift+phase), .16*cos(.81*drift+phase),
                              .19*sin(.68*drift+phase*2.));
    vec3 delta = p-eye;
    float depth = dot(delta,forward);
    gl_Position = vec4(dot(delta,right)*lens.x, dot(delta,up)*lens.y,
                       1.002*depth-.1001, depth);
    float defocus = smoothstep(2.,8.,abs(depth-15.));
    float size = mix(.012,.036,seed*seed) * (1.+1.8*defocus);
    gl_PointSize = clamp(size*pixelLens/max(.1,depth),1.3,12.);
    vec2 offset = beamOffset(p)/vec2(2.7,2.2);
    float lit = exp(-.65*dot(offset,offset));
    intensity = (.032 + .83*lit) * mix(.48,1.,seed) * (1.-.47*defocus);
    softness = mix(2.3,4.2,defocus);
    tint = mix(vec3(.64,.77,.94),vec3(1.,.91,.76),lit*.8);
  }
`;
const dustFragment = `
  precision mediump float;
  varying vec3 tint;
  varying float intensity, softness;
  void main() {
    vec2 offset = gl_PointCoord*2.-1.;
    float r2 = dot(offset,offset);
    float glow = exp(-softness*r2)*(1.-smoothstep(.45,1.,r2));
    gl_FragColor = vec4(tint,glow*intensity);
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

async function readMesh() {
  const response = await fetch(new URL("geometry.gz?v=silk-slide",import.meta.url));
  if (!response.ok) throw new Error("Gift geometry: " + response.status);
  const bytes = await response.arrayBuffer();
  // Hosts may serve .gz as either an encoded response or an ordinary file.
  const signature = new Uint8Array(bytes,0,2);
  if (signature[0] !== 0x1f || signature[1] !== 0x8b) return bytes;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

async function readImage(file) {
  const img = new Image();
  img.src = new URL(file,import.meta.url);
  await img.decode();
  return img;
}

function easeBetween(a,b,t) {
  const u = Math.max(0,Math.min(1,(t-a)/(b-a)));
  return u*u*(3-2*u);
}

export function descent(t) {
  // Match speed at the join, then ease the last metres into the opening shot.
  return t < .26 ? t/.34 : 1-(.08/.34)*Math.pow(Math.max(0,(.42-t)/.16),2);
}

function cameraPose(t) {
  const remaining = 1-descent(t);
  const follow = easeBetween(.38,.985,t);
  const x = 6.5 - remaining*2.5 - 3.86*follow;
  const y = -13.4 - remaining*4.6 + 7.36*follow;
  const z = 6.3 + remaining*14.8 - 1.42*follow;
  const aimZ = 1.62 + 23*Math.pow(remaining,2.55) + 2.52*follow + .34*easeBetween(.77,.985,t);
  return {x,y,z,aimZ};
}

export function skyPitch(t) {
  const {x,y,z,aimZ} = cameraPose(t);
  return Math.atan2(aimZ-z,Math.hypot(x,y));
}

async function prepare(gl) {
  const [mesh, paper, floor, invitation, openPaper, openFloor] = await Promise.all([readMesh(),readImage("paper-silk.webp?v=silk-slide"),readImage("floor.webp?v=low-box"),readImage("invitation.webp?v=silk-slide"),readImage("open-paper.webp?v=silk-slide"),readImage("open-floor.webp?v=silk-slide")]);
  if (gl.isContextLost()) return;
  const model = program(gl,modelVertex,modelFragment,["position","normal","material","uv","part","thread"]);
  const stage = program(gl,stageVertex,stageFragment,["corner"]);
  const dust = program(gl,dustVertex,dustFragment,["mote"]);
  const seconds = gl.getUniformLocation(dust.handle,"seconds");
  const pixelLens = gl.getUniformLocation(dust.handle,"pixelLens");
  function buffer(type, data) {
    const handle = gl.createBuffer();
    gl.bindBuffer(type,handle);
    gl.bufferData(type,data,gl.STATIC_DRAW);
    return handle;
  }
  function texture(image, mipmap, format = gl.RGB) {
    const handle = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,handle);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,format,format,gl.UNSIGNED_BYTE,image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmap?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
    return handle;
  }
  const surfaceMap = texture(paper,true), floorMap = texture(floor,false);
  const letter = prepareInvitation(gl,program,project,texture(invitation,true,gl.RGBA));
  const exposedMap=texture(openPaper,true), exposedFloor=texture(openFloor,false);
  for (const pass of [model,stage]) {
    gl.useProgram(pass.handle);
    gl.uniform1i(gl.getUniformLocation(pass.handle,"openMap"),1);
  }
  const modelLight=gl.getUniformLocation(model.handle,"stageLight");
  const groundLight=gl.getUniformLocation(stage.handle,"stageLight");
  const floorReveal=gl.getUniformLocation(stage.handle,"floorReveal");
  const shot = gl.getUniformLocation(model.handle,"shot");
  const bandCentre=gl.getUniformLocation(model.handle,"bandCentre");
  const [vertexCount,indexCount] = new Uint32Array(mesh,0,2);
  const corners = buffer(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]));
  const vertices = buffer(gl.ARRAY_BUFFER,new Uint8Array(mesh,8,vertexCount*16));
  const modelIndices = buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh,8+vertexCount*16,indexCount));
  // Repeatable positions keep the still posters and the live scene in register.
  let seed = 4583;
  function random() {
    seed = (Math.imul(1664525,seed)+1013904223) >>> 0;
    return seed/4294967296;
  }
  const motes = new Float32Array(1050*4);
  for (let i=0; i<motes.length; i+=4) {
    motes[i] = (random()-.55)*15;
    motes[i+1] = (random()-.56)*14;
    motes[i+2] = .22+random()*8;
    motes[i+3] = random();
  }
  const dustBuffer = buffer(gl.ARRAY_BUFFER,motes);
  const attributes = [
    [model.position,3,gl.SHORT,false,0],[model.normal,3,gl.BYTE,true,6],
    [model.material,1,gl.UNSIGNED_BYTE,false,9],[model.part,1,gl.UNSIGNED_BYTE,false,14],[model.thread,1,gl.UNSIGNED_BYTE,true,15],[model.uv,2,gl.UNSIGNED_SHORT,true,10]
  ];
  return function draw(t,w,h,time=0) {
    const {x,y,z,aimZ} = cameraPose(t);
    const distance = Math.hypot(x,y,aimZ-z), groundDistance = Math.hypot(x,y);
    const fx=-x/distance, fy=-y/distance, fz=(aimZ-z)/distance;
    const rx=-y/groundDistance, ry=x/groundDistance;
    const aspect = w/h;
    // Widen the horizontal field for desktop, and keep the full package in portrait.
    const lensX = Math.min(4.7,3.94/aspect);
    function camera(pass) {
      gl.useProgram(pass.handle);
      gl.uniform3f(pass.eye,x,y,z);
      gl.uniform3f(pass.forward,fx,fy,fz);
      gl.uniform3f(pass.right,rx,ry,0);
      gl.uniform3f(pass.up,fz*ry,-fz*rx,fy*rx-fx*ry);
      gl.uniform2f(pass.lens,lensX,lensX*aspect);
    }
    gl.viewport(0,0,w,h);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    camera(stage);
    for(const slot of [model.position,model.normal,model.material,model.uv]) gl.disableVertexAttribArray(slot);
    gl.bindBuffer(gl.ARRAY_BUFFER,corners);
    gl.enableVertexAttribArray(stage.corner);
    gl.vertexAttribPointer(stage.corner,2,gl.FLOAT,false,0,0);
    const stageLight=1-.46*easeBetween(.64,.95,t);
    gl.uniform1f(groundLight,stageLight);
    gl.uniform1f(floorReveal,easeBetween(.48,.72,t));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,exposedFloor);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,floorMap);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disableVertexAttribArray(stage.corner);
    gl.enable(gl.DEPTH_TEST);
    camera(model);
    gl.uniform1f(modelLight,stageLight);
    gl.uniform1f(shot,t);
    gl.uniform1f(bandCentre,Math.min(1.55,4.46*easeBetween(.29,.67,t)));
    gl.bindBuffer(gl.ARRAY_BUFFER,vertices);
    for (const [slot,size,type,normalized,offset] of attributes) {
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot,size,type,normalized,16,offset);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,exposedMap);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,surfaceMap);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,modelIndices);
    gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);
    for (const [slot] of attributes) gl.disableVertexAttribArray(slot);
    letter(t,camera);
    camera(dust);
    gl.uniform1f(seconds,time);
    gl.uniform1f(pixelLens,lensX*w*.5);
    gl.bindBuffer(gl.ARRAY_BUFFER,dustBuffer);
    gl.enableVertexAttribArray(dust.mote);
    gl.vertexAttribPointer(dust.mote,4,gl.FLOAT,false,0,0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS,0,motes.length/4);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(dust.mote);
  };
}

export function setupStudio(canvas, download) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let draw, loading, position = 1, visible = false, generation = 0, last = -1;
  let pixelBudget = 1600000, width = 1, height = 1, idleFrame = 0;
  let dustTimer = 0, dustTime = 0, previousPaint = 0;
  function paint(animate = false) {
    if (!draw || !visible || document.hidden || reducedMotion.matches) return;
    if (!animate && last === position) return;
    const now = performance.now();
    if (previousPaint) dustTime += Math.min(.15,(now-previousPaint)/1000);
    previousPaint = now;
    draw(position,canvas.width,canvas.height,dustTime);
    canvas.dataset.ready = "";
    last = position;
  }
  // The descent already supplies frames. Only run a separate clock at rest.
  function scheduleDust() {
    clearTimeout(dustTimer);
    if (!draw || pixelBudget < 1600000 || !visible || position !== 1 || document.hidden || reducedMotion.matches) return;
    dustTimer = setTimeout(()=>{
      paint(true);
      scheduleDust();
    },40);
  }
  function resize(budget = position === 1 ? 1600000 : pixelBudget) {
    const scale = Math.min(devicePixelRatio,2,Math.sqrt(budget/(width*height)));
    canvas.width = Math.max(1,Math.round(width*scale));
    canvas.height = Math.max(1,Math.round(height*scale));
    last = -1;
    paint();
  }
  function warm() {
    if (loading || reducedMotion.matches) return;
    const gl = canvas.getContext("webgl",{alpha:false,antialias:true,depth:true,powerPreference:"low-power"});
    if (!gl) return;
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
      scheduleDust();
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
    scheduleDust();
    last = -1;
    delete canvas.dataset.ready;
  });
  canvas.addEventListener("webglcontextrestored",warm);
  reducedMotion.addEventListener("change",()=>{
    if (reducedMotion.matches) delete canvas.dataset.ready;
    else if (visible) { last = -1; warm(); paint(); }
    scheduleDust();
  });
  document.addEventListener("visibilitychange",scheduleDust);
  new IntersectionObserver(([entry])=>{
    if (canvas.closest("[data-gift-descent]")) return;
    visible = entry.isIntersecting;
    if (visible) { position = 1; warm(); paint(); }
    scheduleDust();
  }).observe(canvas);
  return t=>{
    visible = true;
    const leavingRest = position === 1 && t < 1;
    position = t;
    warm();
    cancelAnimationFrame(idleFrame);
    if (leavingRest && pixelBudget < 1600000) resize();
    else paint();
    scheduleDust();
    // Software rasterizers use a smaller moving frame, then resolve once at rest.
    if (t === 1 && pixelBudget < 1600000) {
      idleFrame = requestAnimationFrame(()=>{ if (visible && position === 1) resize(1600000); });
    }
  };
}
