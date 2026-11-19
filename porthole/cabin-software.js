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
const base = [[.031,.033,.037],[.58,.536,.463],[.229,.239,.24],[.073,.082,.092]];

export async function softwareCabin(canvas,zoom) {
  const ctx = canvas.getContext("2d");
  const art = await Promise.all(["twilight.webp","airliner.webp"].map(async file => {
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
  const lights = [.24,.76,.52].map(y => {
    const points = [.22,.5,.78].map(x=>outside.getImageData(Math.floor(320*x),Math.floor(480*y),1,1).data);
    return [0,1,2].map(i=>(linear(points[0][i]/255)+2*linear(points[1][i]/255)+linear(points[2][i]/255))*.25);
  });
  const ambient = lights[0].map((v,i)=>mix(mix(v,lights[1][i],.68),lights[2][i],.20));
  const mesh = createCabinMesh();
  let previousShade, width, height;
  return function paint(w,h,time,shade) {
    const scale = Math.min(1,720/Math.max(w,h));
    w = Math.round(w*scale);
    h = Math.round(h*scale);
    if (width===w && height===h && previousShade===shade) return;
    previousShade=shade; width=w; height=h;
    canvas.width=w; canvas.height=h;
    const image = ctx.createImageData(w,h);
    const depth = new Float32Array(w*h).fill(Infinity);
    const points = [];
    for (let i=0; i<mesh.vertices.length; i+=10) {
      const [x,y0,z,nx,ny,nz,mat,exposure,u,v] = mesh.vertices.subarray(i,i+10);
      const y = y0 - (mat===4 ? shade*1.51 : 0);
      const n = [nx,ny,nz], perspective = .5*w*2.81*zoom/(3.25+z);
      const px=w*.5+x*perspective, py=h*.5-(y-.017+.065*z)*perspective;
      const sky=dot(n,unit(-x,.61-y,.47-z)), cloud=dot(n,unit(-x,-.48-y,.47-z));
      const inner=dot(n,unit(-x,-y,.48-z));
      const shadow=1-.38*clamp((y-.62)/.36);
      const visibility=1-shade*(.48+.42*clamp((y-.69+shade*1.51+.17)/.34));
      const color = ambient.map((a,c)=>{
        if (mat===4) {
          const grip = Math.exp(-((Math.abs(u)/.13)**6)-((v-.053)/.016)**2);
          return display(([.129,.116,.099][c]*(.073+.095*dot(n,[0,.592,-.806]))+a*(.018+.060*Math.exp(-v*9)*(1-.75*shade)))*(1-grip*.35)*(.9-.2*shade));
        }
        return display(base[mat][c]*exposure*((a*(.34+.66*inner)+lights[0][c]*sky*.67+lights[1][c]*cloud*.78)*visibility*shadow+.009));
      });
      const t = mat===4 ? 0 : clamp((u-.665)/.315);
      const blend = t*t*t*(t*(t*6-15)+10);
      const finish = color.map((v,i)=>mix(v, Math.max(v,17+i*2), blend));
      points.push([px,py,z,...finish,255*(1-blend)]);
    }
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
        if (z>=depth[pixel]) continue;
        depth[pixel]=z;
        for(let k=0;k<4;k++) image.data[4*pixel+k]=s*a[3+k]+u*b[3+k]+v*c[3+k];
      }
    }
    ctx.putImageData(image,0,0);
    const sw=.435*w*zoom, sh=.44*1.5*w*zoom, top=h*.5+.003*w*zoom-sh*.5;
    ctx.globalCompositeOperation="destination-over";
    ctx.drawImage(art[1],w*.5-.04*sw,top+.444*sh,.18*sw,.038*sh);
    ctx.drawImage(art[0],(w-sw)*.5,top,sw,sh);
    ctx.globalCompositeOperation="source-over";
  };
}
