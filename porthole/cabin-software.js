import {drawSky} from "./sky-software.js";
// Software projection of the same mesh for browsers with WebGL disabled.
import {createCabinMesh} from "./cabin-mesh.js";

const clamp = x => Math.max(0, Math.min(1,x));
const unit = (x,y,z) => {
  const length = Math.hypot(x,y,z);
  return [x/length,y/length,z/length];
};
const dot = (a,b) => Math.max(0,a[0]*b[0]+a[1]*b[1]+a[2]*b[2]);
const mix = (a,b,t) => a+(b-a)*t;
const linear = v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
const display = v => 255*(v<.0031308 ? v*12.92 : 1.055*v**(1/2.4)-.055);
const gasket = [.027, .029, .032];
const molding = [.38, .39, .40];

export async function softwareCabin(canvas,zoom) {
  const ctx = canvas.getContext("2d");
  const art = await Promise.all(["twilight.webp","airliner.webp","cloud-deck.webp"].map(async file => {
    const image = new Image();
    image.src = new URL(file,import.meta.url);
    await image.decode();
    return image;
  }));
  const sample = document.createElement("canvas");
  sample.width = 320;
  sample.height = 480;
  const outside = sample.getContext("2d", {willReadFrequently:true});
  outside.drawImage(art[0],0,0,320,480);
  const skyPixels = outside.getImageData(0,0,320,480).data;
  function skyAt(x,y) {
    const col = Math.round(clamp(x)*319), row = Math.round(clamp(y)*479);
    const i = (row*320 + col)*4;
    return [0,1,2].map(c => linear(skyPixels[i+c]/255));
  }
  const lights = [.24,.76,.52].map(y => {
    const points = [.22,.5,.78].map(x => skyAt(x,y));
    return [0,1,2].map(i=>(points[0][i]+2*points[1][i]+points[2][i])*.25);
  });
  const ambient = lights[0].map((v,i)=>mix(mix(v,lights[1][i],.68),lights[2][i],.20));
  const mesh = createCabinMesh();
  const linerSurface = document.createElement("canvas");
  const linerContext = linerSurface.getContext("2d");
  let image, depth;
  let previousShade, width, height, wasFlying = false;
  return function paint(w,h,time,shade,view) {
    if (!view && !wasFlying && width===w && height===h && previousShade===shade) return;
    wasFlying = Boolean(view);
    previousShade=shade; width=w; height=h;
    if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; }
    else ctx.clearRect(0,0,w,h);
    if (view?.advance >= 3.49) {
      drawSky(ctx,w,h,view,art[2],art[1],time);
      return;
    }
    if (!image || image.width !== w || image.height !== h) {
      image = ctx.createImageData(w,h);
      depth = new Float32Array(w*h);
    } else image.data.fill(0);
    depth.fill(Infinity);
    const points = [];
    const sinPitch = Math.sin(view?.pitch ?? 0), cosPitch = Math.cos(view?.pitch ?? 0);
    for (let i=0; i<mesh.vertices.length; i+=10) {
      const [x,y0,z,nx,ny,nz,mat,exposure,u,v] = mesh.vertices.subarray(i,i+10);
      const y = y0 - (mat===4 ? shade*1.51 : 0);
      const heightAtLens = y-.017+.065*z-(view?.lift ?? 0);
      const forward = 3.25+z-(view?.advance ?? 0);
      const depthAtLens = heightAtLens*sinPitch + forward*cosPitch;
      const n = [nx,ny,nz], perspective = .5*w*(view?.width ?? 1)*2.81*zoom/Math.max(.02,depthAtLens);
      const px=w*(view?.x ?? .5)+x*perspective;
      const py=h*(view?.y ?? .5)-(heightAtLens*cosPitch-forward*sinPitch)*perspective;
      const sky=dot(n,unit(-x,.61-y,.47-z)), cloud=dot(n,unit(-x,-.48-y,.47-z));
      const inner=dot(n,unit(-x,-y,.48-z));
      const glassX = .5 + .72*x, glassY = .5 - .52*y;
      const local = skyAt(glassX,glassY);
      const upper = skyAt(glassX+.035,glassY-.025), lower = skyAt(glassX-.035,glassY+.025);
      const reach = 2**(-Math.max(u-.548,0)/.023);
      const bevel = clamp((u-.535)/.016);
      const shadow = clamp((y-.69+shade*1.51+.17)/.34);
      const visibility = 1-shade*(.75+.22*shadow*shadow*(3-2*shadow));
      const eye = unit(-x,.045-y,-3.25-z), glass = unit(-x,-y,.48-z);
      const reflection = dot(n,unit(eye[0]+glass[0],eye[1]+glass[1],eye[2]+glass[2]))**22;
      const color = ambient.map((a,c)=>{
        if (mat===4) {
          const grip = Math.exp(-((Math.abs(u)/.13)**6)-((v-.053)/.016)**2);
          const opening = 1-shade;
          const t = clamp(opening/.42);
          const spill = Math.exp(-3.8*v)*t*t*(3-2*t);
          const side = clamp((Math.abs(u)-.24)/.31);
          const wrap = .76+.24*dot(n,[0,.55,-.835]);
          const reflected = mix(lights[0][c],lights[1][c],.28);
          const light = lights[0][c]*(.045+.12*opening) + reflected*.18*spill;
          const face = (.002 + light*wrap*(1-.30*side*side))*(1-.30*grip);
          return display(face + reflected*spill*.020*Math.exp(-90*v));
        }
        const light = .5*local[c] + .25*(upper[c]+lower[c]);
        const bounce = .15*(lights[0][c]*sky + lights[1][c]*cloud);
        const incident = light*(.26+.76*inner) + bounce;
        const base = mix(gasket[c],molding[c],bevel*bevel*(3-2*bevel));
        return display(base*(incident*reach*visibility+.00065)*exposure + light*reflection*.10*reach*visibility);
      });
      const t = mat===4 ? 0 : clamp((u-.551)/(.637-.551));
      const blend = t*t*t*(t*(t*6-15)+10);
      const finish = color;
      points.push([px,py,z,...finish,255*(1-blend)]);
    }
    const aperture = new Path2D();
    points.slice(0,mesh.apertureCount).forEach(([x,y],i)=>{
      if (i===0) aperture.moveTo(x,y);
      else aperture.lineTo(x,y);
    });
    aperture.closePath();
    // Cache the geometric aperture once per draw for the shade depth test.
    ctx.fill(aperture);
    const stencil = ctx.getImageData(0,0,w,h).data;
    // Resolve all frame and blind triangles through one depth buffer.
    for (let i=0;i<mesh.indices.length;i+=3) {
      const a=points[mesh.indices[i]], b=points[mesh.indices[i+1]], c=points[mesh.indices[i+2]];
      const bx=b[0]-a[0], by=b[1]-a[1], cx=c[0]-a[0], cy=c[1]-a[1];
      const det=bx*cy-by*cx;
      if (Math.abs(det)<.00001) continue;
      const l=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))), r=Math.min(w,Math.ceil(Math.max(a[0],b[0],c[0])));
      const t=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))), end=Math.min(h,Math.ceil(Math.max(a[1],b[1],c[1])));
      for(let row=t;row<end;row++) for(let col=l;col<r;col++) {
        const dx=col+.5-a[0], dy=row+.5-a[1], u=(dx*cy-dy*cx)/det, v=(dy*bx-dx*by)/det, s=1-u-v;
        if (s<0 || u<0 || v<0) continue;
        const pixel=row*w+col, z=s*a[2]+u*b[2]+v*c[2];
        if (z>=depth[pixel] || (i>=mesh.trimIndexCount && !stencil[4*pixel+3])) continue;
        depth[pixel]=z;
        // Stable fine grain on the molded surfaces, before compositing the glass.
        const seed = (Math.imul(col, 1597334677) ^ Math.imul(row, 3812015801)) >>> 0;
        const grain = 1 + ((seed >>> 24) / 255 - .5) * .065;
        for (let k=0;k<3;k++) image.data[4*pixel+k]=(s*a[3+k]+u*b[3+k]+v*c[3+k])*grain;
        image.data[4*pixel+3]=s*a[6]+u*b[6]+v*c[6];
      }
    }
    if (view) {
      if (linerSurface.width !== w || linerSurface.height !== h) {
        linerSurface.width=w; linerSurface.height=h;
      }
      linerContext.putImageData(image,0,0);
      ctx.clearRect(0,0,w,h);
      ctx.save();
      ctx.clip(aperture);
      drawSky(ctx,w,h,view,art[2],art[1],time);
      ctx.restore();
      ctx.save();
      if (view.blur > .05) ctx.filter = `blur(${view.blur*devicePixelRatio}px)`;
      ctx.drawImage(linerSurface,0,0);
      ctx.restore();
      return;
    }
    ctx.putImageData(image,0,0);
    const sw=.435*w*zoom, sh=.44*1.5*w*zoom, top=h*.5+.003*w*zoom-sh*.5;
    ctx.save();
    ctx.clip(aperture);
    ctx.globalCompositeOperation="destination-over";
    ctx.drawImage(art[1],w*.5-.04*sw,top+.444*sh,.18*sw,.038*sh);
    ctx.drawImage(art[0],(w-sw)*.5,top,sw,sh);
    ctx.restore();
  };
}
