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
const cool = [.72,.81,.93], warm = [1,.88,.71];
const liner = [.89,.87,.80], skirt = [.83,.85,.82];
const sealColor = [.0019,.0023,.0027], wallColor = [.0034,.0039,.0043];
const shadeCool = [.69,.77,.87], shadeWarm = [1,.89,.75];
const shadePlastic = [.57,.55,.50], shadeFill = [.015,.015,.014];
const shadeLightDirection = unit(-.50,-.77,-.40);
const smooth = (a,b,x) => {
  const t = clamp((x-a)/(b-a));
  return t*t*(3-2*t);
};

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
  const probes = [.22,.5,.78].map(x => skyAt(x,.24));
  const skyLight = [0,1,2].map(c => (probes[0][c]+2*probes[1][c]+probes[2][c])*.25);
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
      const y = y0 - (mat===4 ? .08+shade*1.43 : 0);
      const heightAtLens = y-.017+.065*z-(view?.lift ?? 0);
      const forward = 3.25+z-(view?.advance ?? 0);
      const depthAtLens = heightAtLens*sinPitch + forward*cosPitch;
      const n = [nx,ny,nz], perspective = .5*w*(view?.width ?? 1)*2.81*zoom/Math.max(.02,depthAtLens);
      const px=w*(view?.x ?? .5)+x*perspective;
      const py=h*(view?.y ?? .5)-(heightAtLens*cosPitch-forward*sinPitch)*perspective;
      const inner=dot(n,unit(-x,-y,.48-z));
      const glassX = .5 + .72*x, glassY = .5 - .52*y;
      const local = skyAt(glassX,glassY);
      const upper = skyAt(glassX+.035,glassY-.025), lower = skyAt(glassX-.035,glassY+.025);
      if (mat===4) {
        const opening = 1-shade;
        const left = smooth(-.53,.53,-u);
        const hood = smooth(.10,.212,(y-.017+.065*z)/(3.25+z));
        const toTrack = (Math.abs(u)/.54)**2.90 + (Math.abs(y)/.76)**2.70;
        const contact = 1-.55*smooth(.77,1.03,toTrack);
        const sideBounce = 2**(-Math.abs(Math.abs(u)-.52)/.125)*(.23+.77*left);
        const lowerBounce = 2**(-v/.26)*(.68+.32*left);
        const wrap = dot(n,shadeLightDirection);
        const bevel = Math.max(-ny,0)**2;
        const color = shadePlastic.map((albedo,c)=>{
          const tint = mix(shadeCool[c],shadeWarm[c],.30+.66*left);
          const sample = .5*local[c]+.25*(upper[c]+lower[c]);
          const spill = tint*(.105*sideBounce+.085*lowerBounce)+sample*.19;
          const light = shadeFill[c]+skyLight[c]*.035 + spill*(.11+.89*opening)*(.56+.90*wrap)*(1-.79*hood);
          const sheen = tint*(.024*wrap**4+.040*bevel)*(.20+.80*opening)*(1-.65*hood);
          return display(albedo*light*contact*(1-.47*exposure)+sheen);
        });
        points.push([px,py,z,...color,255]);
        continue;
      }
      const left = smooth(-.60,.60,-x), low = smooth(-.76,.71,-y);
      const opening = 1-shade, shadeEdge = .61-shade*1.43;
      const visible = 1-shade*(.62+.36*smooth(shadeEdge-.18,shadeEdge+.16,y));
      const penumbra = smooth(.568,.745,u);
      const projectedY = (y-.017+.065*z)/(3.25+z) + .010*x*x;
      const hood = smooth(mix(.169,.130,penumbra),mix(.198,.294,penumbra),projectedY);
      const illumination = (.23+.51*left+.43*low)*(.09+.91*opening)*visible*(1-.944*hood);
      const rolledEdge = Math.exp(-(((u-.575)/.003)**2));
      const joint = Math.exp(-(((u-.578)/.0018)**2));
      const distanceToSeal = Math.max(0,u-.673);
      const spill = .054*2**(-distanceToSeal/.026) + .038*2**(-distanceToSeal/.095);
      const color = liner.map((albedo,c)=>{
        const outsideLight = .5*local[c] + .25*(upper[c]+lower[c]);
        const tint = mix(cool[c],warm[c],.22+.58*left+.14*low);
        const light = (.68*tint+.65*outsideLight)*illumination;
        const innerFace = albedo*light*(.64+.36*inner) + rolledEdge*.09*light;
        const outerFace = skirt[c]*light*mix(.39,.065,smooth(.582,.656,u))*(.75+.25*inner);
        let body = mix(innerFace,outerFace,smooth(.575,.578,u))*(1-.46*joint)*(.83+.17*exposure);
        body = mix(body+[.0019,.0022,.0026][c],sealColor[c]+.013*light,smooth(.650,.663,u));
        const wall = wallColor[c]+light*spill*(.35+.85*left+.35*low);
        return display(mix(body,wall,smooth(.670,.684,u)));
      });
      const coverage = 1-smooth(.78,1.02,u);
      points.push([px,py,z,...color,255*coverage]);
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
        const grain = 1 + ((seed >>> 24) / 255 - .5) * .032;
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
