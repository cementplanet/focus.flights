// The invitation lies in the XY plane. Its two render passes use the same
// deformed paper surface, so a lifting flap casts its own moving shadow.
export function prepareInvitation(gl, program, project, shadows, atlas) {
  const vertex = `
    attribute vec3 point;
    attribute vec2 uv;
    attribute float panel;
    uniform float shot, shadowPass;
    varying highp vec2 texCoord;
    varying highp vec3 world;
    varying mediump vec3 normal;
    varying mediump float face;
    ${project}
    ${shadows}
    mat2 turn(float angle) {
      float c=cos(angle), s=sin(angle);
      return mat2(c,s,-s,c);
    }
    void main() {
      vec3 p=point;
      vec3 n=vec3(0.,0.,1.);
      float fall=smoothstep(.30,.54,shot);
      float seated=smoothstep(.43,.58,shot);
      float open=smoothstep(.555,.83,shot);
      float extract=smoothstep(.715,.98,shot);
      if (panel==4.) {
        float reach=.865-p.y;
        // The crease moves first. Flex travels to the free tip, then relaxes.
        float angle=3.135*open-.39*sin(open*3.14159)*reach/1.132;
        float camber=.045*sin(reach/1.132*3.14159)*sin(angle);
        p.y=.865-reach*cos(angle)+camber*sin(angle);
        p.z+=reach*sin(angle)+camber*cos(angle)-.033*open;
        n=vec3(0.,sin(angle),cos(angle));
      } else if (panel==2.) {
        p.y+=.57*extract;
        // The insert stays beneath the pocket up to its lip. Only the exposed
        // sheet lifts clear of the opened flap.
        p.z+=smoothstep(.64,.91,p.y)*(.087*extract+.075*sin(extract*3.14159));
      }
      // The lower corner meets the ground first; the far edge settles after it.
      float bank=.165*(1.-seated);
      float tilt=.24*(1.-seated);
      p.xz=turn(-bank)*p.xz;
      p.yz=turn(tilt)*p.yz;
      n.xz=turn(-bank)*n.xz;
      n.yz=turn(tilt)*n.yz;
      float yaw=-.047+.24*(1.-seated)-.055*sin(fall*3.14159);
      p.xy=turn(yaw)*p.xy;
      n.xy=turn(yaw)*n.xy;
      p.xy+=vec2(-.32,.22)*(1.-seated);
      p.z+=.91*(1.-fall)+1.24*sin(bank)+.865*sin(tilt)+.009;
      world=p;
      normal=n;
      texCoord=uv;
      face=panel;
      if (shadowPass>.5) {
        gl_Position=vec4(shadowUV(p)*2.-1.,.98-p.z*.80,1.);
      } else {
        vec3 delta=p-eye;
        float d=dot(delta,forward);
        gl_Position=vec4(dot(delta,right)*lens.x,dot(delta,up)*lens.y,1.002*d-.1001,d);
      }
    }`;
  const fragment = `
    precision highp float;
    varying highp vec2 texCoord;
    varying highp vec3 world;
    varying mediump vec3 normal;
    varying mediump float face;
    uniform sampler2D surface;
    uniform float shadowPass;
    uniform vec3 eye;
    ${shadows}
    void main() {
      vec4 texel=texture2D(surface,texCoord);
      if (texel.a<.46) discard;
      if (shadowPass>.5) {
        gl_FragColor=vec4(clamp(world.z/2.4,0.,1.),exp(-6.*world.z),1.,1.);
        return;
      }
      vec3 n=normalize(normal);
      vec3 view=normalize(eye-world);
      if(dot(n,view)<0.) n=-n;
      vec3 key=normalize(vec3(-.54,.73,1.));
      float light=dot(n,key);
      float shade=.76+.34*max(light,0.);
      vec3 color=texel.rgb;
      if (face!=2. && face!=5.) {
        float paper=.108+.032*texCoord.y+.028*(1.-texCoord.x)+texel.r*.53;
        if (face==1.) paper*=.82;
        if (face==3.) paper+=.016*(1.-texCoord.x);
        if (face==4.) paper+=.023;
        color=vec3(1.055,1.,.94)*paper;
        shade+=.08*pow(max(0.,dot(n,normalize(view+key))),12.);
      }
      float shadow=paperShadow(world,.028);
      gl_FragColor=vec4(color*shade*(1.-.32*shadow),1.);
    }`;
  const pass=program(gl,vertex,fragment,["point","uv","panel"]);
  const shot=gl.getUniformLocation(pass.handle,"shot");
  const shadowPass=gl.getUniformLocation(pass.handle,"shadowPass");
  gl.useProgram(pass.handle);
  gl.uniform1i(gl.getUniformLocation(pass.handle,"shadowMap"),1);
  const vertices=[];
  const stock=[2,662,1020,756], card=[1,1,1022,644], seal=[5,1440,384,372];
  const envelope=[-1.24,-.865,1.24,.865];
  function polygon(points,layer,height,region=stock,bounds=envelope) {
    const [left,bottom,right,top]=bounds;
    for(let i=1;i<points.length-1;i++) {
      for(const [x,y] of [points[0],points[i],points[i+1]]) {
        const u=(region[0]+region[2]*(x-left)/(right-left))/1024;
        const v=1-(region[1]+region[3]*(top-y)/(top-bottom))/2048;
        vertices.push(x,y,height,u,v,layer);
      }
    }
  }
  function rectangle(bounds,layer,height,region) {
    const [l,b,r,t]=bounds;
    polygon([[l,b],[r,b],[r,t],[l,t]],layer,height,region,bounds);
  }
  rectangle(envelope,0,0,stock);
  // Horizontal sections let the insert and flap bend along their paper grain.
  const insert=[-1.14,-.72,1.14,.72];
  const radius=.065;
  function cardWidth(y) {
    const dy=Math.max(0,Math.abs(y)-(.72-radius));
    return 1.14-radius+Math.sqrt(Math.max(0,radius*radius-dy*dy));
  }
  function strips(rows,layer,z,region,bounds) {
    for(let i=1;i<rows.length;i++) {
      const [y0,w0]=rows[i-1], [y1,w1]=rows[i];
      polygon([[-w0,y0],[w0,y0],[w1,y1],[-w1,y1]],layer,z,region,bounds);
    }
  }
  const cardRows=[];
  for(let i=0;i<=48;i++) {
    const y=.72*Math.sin((i/48-.5)*Math.PI);
    cardRows.push([y,cardWidth(y)]);
  }
  strips(cardRows,2,.021,card,insert);
  for(const side of [-1,1]) {
    polygon([[side*1.24,-.865],[side*1.24,.65],[side*1.14,.63],[0,-.29]],1,.039);
  }
  polygon([[-1.24,-.865],[1.24,-.865],[1.24,-.74],[.16,-.24],[0,-.212],[-.16,-.24],[-1.24,-.74]],3,.047);
  const flap=[];
  for(const [y0,w0,y1,w1,count] of [[.865,1.24,.60,1.24,5],[.60,1.24,-.24,.16,24],[-.24,.16,-.267,.025,5]]) {
    for(let i=0;i<count;i++) flap.push([y0+(y1-y0)*i/count,w0+(w1-w0)*i/count]);
  }
  flap.push([-.267,.025]);
  strips(flap,4,.056,stock,envelope);
  rectangle([-.24,-.508,.24,-.043],5,.075,seal);
  const buffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
  return (t,camera,shadow)=>{
    camera(pass);
    gl.uniform1f(shot,t);
    gl.uniform1f(shadowPass,shadow?1:0);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for(const [slot,size,offset] of [[pass.point,3,0],[pass.uv,2,12],[pass.panel,1,20]]) {
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot,size,gl.FLOAT,false,24,offset);
    }
    gl.bindTexture(gl.TEXTURE_2D,atlas);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
    for(const slot of [pass.point,pass.uv,pass.panel]) gl.disableVertexAttribArray(slot);
  };
}
