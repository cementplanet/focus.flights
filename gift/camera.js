// World coordinates are metres, with Z up. The mesh and both lightmaps share
// the Blender studio's coordinates, so shadows stay fixed as the camera descends.
const project = `
  uniform vec3 eye, right, up, forward;
  uniform vec2 lens;
`;
const modelVertex = `
  attribute vec3 position, normal;
  attribute float material;
  attribute vec2 uv;
  varying vec3 world, surfaceNormal;
  varying vec2 texCoord;
  varying float finish;
  ${project}
  void main() {
    world = position / 8000.;
    vec3 delta = world - eye;
    float depth = dot(delta, forward);
    gl_Position = vec4(dot(delta, right)*lens.x, dot(delta, up)*lens.y,
                       1.002*depth-.1001, depth);
    surfaceNormal = normal;
    texCoord = uv;
    finish = material;
  }
`;
const modelFragment = `
  precision highp float;
  uniform sampler2D lightmap;
  uniform vec3 eye;
  varying vec3 world, surfaceNormal;
  varying vec2 texCoord;
  varying float finish;
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
    vec3 color = base + gloss * mix(vec3(.035), vec3(.39,.415,.46),satin)
                      + edge * mix(vec3(.015),vec3(.21,.24,.3),satin);
    gl_FragColor = vec4(color,1.);
  }
`;
const stageVertex = `
  precision highp float;
  attribute vec2 corner;
  varying vec3 direction;
  varying float haze;
  ${project}
  void main() {
    direction = forward + right*corner.x/lens.x + up*corner.y/lens.y;
    vec3 ray = normalize(direction);
    float ground = ray.z < -.001 ? -eye.z/ray.z : 100000.;
    // Integrate the soft radial beam along the viewing ray on a coarse grid.
    // The low-frequency air light is interpolated across the receiving floor.
    vec3 lamp = vec3(-3.1,-2.8,7.8);
    vec3 axis = normalize(vec3(.1,.3,0.)-lamp);
    vec3 origin = eye-lamp;
    float angle = dot(ray,axis), perpendicular = max(.015,1.-angle*angle);
    float alongRay = (angle*dot(origin,axis)-dot(origin,ray))/perpendicular;
    vec3 nearest = origin + ray*alongRay;
    float alongBeam = dot(nearest,axis);
    float radius = max(.05,alongBeam*.51);
    vec3 radial = nearest-axis*alongBeam;
    float core = max(0.,1.-dot(radial,radial)/(radius*radius));
    haze = core*core*sqrt(core) * radius / (3.+alongBeam*alongBeam)
         * inversesqrt(perpendicular) * smoothstep(0.,1.6,alongBeam)
         * smoothstep(-1.4,1.4,ground-alongRay) * step(0.,alongRay);
    gl_Position = vec4(corner,0.,1.);
  }
`;
const stageFragment = `
  precision highp float;
  uniform sampler2D lightmap;
  uniform vec3 eye;
  varying vec3 direction;
  varying float haze;
  void main() {
    float distance = direction.z < -.001 ? -eye.z/direction.z : 100000.;
    vec2 xy = eye.xy + distance*direction.xy;
    vec3 floorLight = texture2D(lightmap, clamp(xy/24.+.5,0.,1.)).rgb;
    float footprint = 1.-smoothstep(8.,11.9,max(abs(xy.x),abs(xy.y)));
    vec3 color = max(vec3(.011,.014,.019), floorLight*footprint);
    gl_FragColor = vec4(color + vec3(.91,.90,.85)*haze,1.);
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
  const response = await fetch(new URL("geometry.gz",import.meta.url));
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

function cameraPose(t) {
  const remaining = 1 - t;
  const x = 6.5 - remaining * 2.5;
  const y = -13.4 - remaining * 4.6;
  const z = 6.3 + remaining * 14.8;
  const aimZ = 1.62 + 23 * Math.pow(remaining,2.55);
  return {x, y, z, aimZ};
}

export function skyPitch(t) {
  const {x,y,z,aimZ} = cameraPose(t);
  return Math.atan2(aimZ-z,Math.hypot(x,y));
}

async function prepare(gl) {
  const [mesh, paper, floor] = await Promise.all([readMesh(),readImage("paper-silk.webp"),readImage("floor.webp")]);
  if (gl.isContextLost()) return;
  const model = program(gl,modelVertex,modelFragment,["position","normal","material","uv"]);
  const stage = program(gl,stageVertex,stageFragment,["corner"]);
  function buffer(type, data) {
    const handle = gl.createBuffer();
    gl.bindBuffer(type,handle);
    gl.bufferData(type,data,gl.STATIC_DRAW);
    return handle;
  }
  function texture(image, mipmap) {
    const handle = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,handle);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmap?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
    return handle;
  }
  const surfaceMap = texture(paper,true), floorMap = texture(floor,false);
  const [vertexCount,indexCount] = new Uint32Array(mesh,0,2);
  const columns = 48, rows = 32;
  const grid = [], triangles = [];
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) {
      grid.push(2*x/columns-1, 2*y/rows-1);
      if (x < columns && y < rows) {
        const i = y*(columns+1)+x;
        triangles.push(i,i+1,i+columns+1, i+1,i+columns+2,i+columns+1);
      }
    }
  }
  const corners = buffer(gl.ARRAY_BUFFER,new Float32Array(grid));
  const gridIndices = buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(triangles));
  const vertices = buffer(gl.ARRAY_BUFFER,new Uint8Array(mesh,8,vertexCount*16));
  const modelIndices = buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh,8+vertexCount*16,indexCount));
  const attributes = [
    [model.position,3,gl.SHORT,false,0],[model.normal,3,gl.BYTE,true,6],
    [model.material,1,gl.UNSIGNED_BYTE,false,9],[model.uv,2,gl.UNSIGNED_SHORT,true,10]
  ];
  // Attribute zero is shared by both passes on some drivers.
  return function draw(t,w,h) {
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
    gl.bindTexture(gl.TEXTURE_2D,floorMap);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gridIndices);
    gl.drawElements(gl.TRIANGLES,triangles.length,gl.UNSIGNED_SHORT,0);
    gl.disableVertexAttribArray(stage.corner);
    gl.enable(gl.DEPTH_TEST);
    camera(model);
    gl.bindBuffer(gl.ARRAY_BUFFER,vertices);
    for (const [slot,size,type,normalized,offset] of attributes) {
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot,size,type,normalized,16,offset);
    }
    gl.bindTexture(gl.TEXTURE_2D,surfaceMap);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,modelIndices);
    gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);
  };
}

export function setupStudio(canvas, download) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let draw, loading, position = 1, visible = false, generation = 0, last = -1;
  let pixelBudget = 1600000, width = 1, height = 1, idleFrame = 0;
  function paint() {
    if (!draw || !visible || last === position || reducedMotion.matches) return;
    draw(position,canvas.width,canvas.height);
    canvas.dataset.ready = "";
    last = position;
  }
  function resize(budget = pixelBudget) {
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
