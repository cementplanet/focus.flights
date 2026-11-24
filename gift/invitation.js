// The invitation lies in the XY plane. Its two render passes use the same
// deformed paper surface, so a lifting flap casts its own moving shadow.
export function prepareInvitation(gl, program, project, shadows, studioAir, atlas) {
  const vertex = `
    attribute vec3 point;
    attribute vec2 uv;
    attribute float panel;
    uniform float shot, shadowPass;
    uniform vec3 cardLayout; // welcome print width and centre in viewport units
    uniform vec3 flight; // lift, separation, breathing phase
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
      bool card=panel==2. || panel>=6.;
      float stack=panel==6. ? -1. : (panel==7. ? 1. : 0.);
      float fall=smoothstep(.26,.455,shot);
      float seated=smoothstep(.355,.48,shot);
      float open=smoothstep(.475,.79,shot);
      float extract=smoothstep(.79,.985,shot);
      if (panel==4.) {
        float reach=.865-p.y;
        // The crease moves first. Flex travels to the free tip, then relaxes.
        float angle=3.135*open-.39*sin(open*3.14159)*reach/1.132;
        float camber=.045*sin(reach/1.132*3.14159)*sin(angle);
        p.y=.865-reach*cos(angle)+camber*sin(angle);
        p.z+=reach*sin(angle)+camber*cos(angle)-.050*open;
        n=vec3(0.,sin(angle),cos(angle));
      } else if (card) {
        p.xy=turn(-stack*.065)*p.xy;
        p.x+=stack*.145;
        p.y+=(.58-.045*abs(stack))*extract;
        if (panel==2.) {
          // Clear the highest edge of the pocket before turning toward camera.
          p.y+=.92*smoothstep(0.,.48,flight.y);
        }
        // At any given point above the sleeve, all three sheets have the
        // same bend. Their original depth offsets keep the order consistent.
        p.z+=.108*extract*smoothstep(.65,.93,p.y);
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
      float rise=flight.x, release=flight.y, air=flight.z;
      if (rise>0. || release>0.) {
        // Let the print lead while the sleeve drifts down behind it.
        float retreat=release*release*release;
        p.xy=turn(-.095*retreat)*p.xy+vec2(-.24,-2.75)*retreat;
        n.xy=turn(-.095*retreat)*n.xy;
        if (panel==2.) {
          p.z+=.58*smoothstep(.39,.56,release);
          // Resolve into the camera plane. Final drift is entirely parallel
          // to the screen so the printed baselines stay level.
          float free=smoothstep(.45,.96,release);
          vec3 centre=vec3(0.,2.48,1.30);
          float depth=dot(centre-eye,forward);
          vec2 viewSize=2.*depth/lens;
          float width=cardLayout.x*viewSize.x;
          vec2 offset=cardLayout.yz*viewSize;
          vec3 facing=eye+forward*depth+right*(offset.x+point.x*width/1.08)
                            +up*(offset.y+point.y*width/1.08+.012*(1.-release)*sin(air*.85));
          p=mix(p,facing,free);
          p-=forward*(.36*sin(3.14159*free)*rise);
          n=normalize(mix(n,-forward,free));
        }
      }
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
    uniform vec3 flight;
    ${shadows}
    ${studioAir}
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
      // A broad source on the viewer's side lights the print and the wax.
      vec3 toLamp=vec3(-2.3,-3.2,7.4)-world;
      vec3 key=normalize(toLamp);
      float diffuse=max(dot(n,key),0.);
      float irradiance=1./(1.+.0025*dot(toLamp,toLamp));
      float shade=.87+.155*diffuse*irradiance;
      vec3 color=texel.rgb;
      if (abs(face-2.)>.25 && face<4.5) {
        float paper=.108+.032*texCoord.y+.028*(1.-texCoord.x)+texel.r*.53;
        if (abs(face-1.)<.25) paper*=.82;
        if (abs(face-3.)<.25) paper+=.016*(1.-texCoord.x);
        if (abs(face-4.)<.25) paper+=.023;
        color=vec3(1.055,1.,.94)*paper;
        shade+=.08*pow(max(0.,dot(n,normalize(view+key))),12.);
      }
      if (abs(face-6.)<.25) {
        // Brushed silver catches the softbox while black printing absorbs it.
        float reflection=pow(max(dot(n,normalize(view+key)),0.),18.);
        color+=vec3(.018*reflection*texel.g);
      }
      // Separated, flat sheets receive the studio light directly. The height
      // map is for the stacked paper and sleeve; it cannot resolve self-shadow
      // on a tilted, nearly edge-on sheet in light space.
      float shadow=paperShadow(world,.028);
      if (abs(face-2.)<.25 || face>5.5) shadow*=1.-smoothstep(.82,1.,flight.y);
      vec3 surfaceColor=color*shade*(1.-.32*shadow);
      float haze=airLight(eye,-view,length(world-eye),flight.x);
      // Keep the print close to the original stock even under the shaft.
      gl_FragColor=vec4(mix(surfaceColor,vec3(.84),.008*min(haze,2.)),1.);
    }`;
  const pass=program(gl,vertex,fragment,["point","uv","panel"]);
  const layout=gl.getUniformLocation(pass.handle,"cardLayout");
  const flight=gl.getUniformLocation(pass.handle,"flight");
  const shot=gl.getUniformLocation(pass.handle,"shot");
  const shadowPass=gl.getUniformLocation(pass.handle,"shadowPass");
  gl.useProgram(pass.handle);
  gl.uniform1i(gl.getUniformLocation(pass.handle,"shadowMap"),1);
  const vertices=[];
  const stock=[2,962,1020,756], seal=[1088,960,384,372];
  const envelope=[-1.24,-.865,1.24,.865];
  function polygon(points,layer,height,region=stock,bounds=envelope) {
    const [left,bottom,right,top]=bounds;
    for(let i=1;i<points.length-1;i++) {
      for(const [x,y] of [points[0],points[i],points[i+1]]) {
        const u=(region[0]+region[2]*(x-left)/(right-left))/2048;
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
  const insert=[-.54,-.72,.54,.72];
  const radius=.026;
  function cardWidth(y) {
    const dy=Math.max(0,Math.abs(y)-(.72-radius));
    return .54-radius+Math.sqrt(Math.max(0,radius*radius-dy*dy));
  }
  function strips(rows,layer,z,region,bounds,columns=1) {
    for(let i=1;i<rows.length;i++) {
      const [y0,w0]=rows[i-1], [y1,w1]=rows[i];
      // Fanned sheets cross the sleeve lip diagonally. Sample across each row
      // as well as along it so a rear corner cannot bridge through the front.
      for(let col=0;col<columns;col++) {
        const left=2*col/columns-1, right=2*(col+1)/columns-1;
        polygon([[left*w0,y0],[right*w0,y0],[right*w1,y1],[left*w1,y1]],layer,z,region,bounds);
      }
    }
  }
  const cardRows=[];
  for(let i=0;i<=48;i++) {
    const y=.72*Math.sin((i/48-.5)*Math.PI);
    cardRows.push([y,cardWidth(y)]);
  }
  // Welcome on top, brushed silver and airmail stock just behind its edges.
  strips(cardRows,7,.013,[1372,4,672,896],insert,12);
  // Black Week is temporarily hidden. Restore this sheet with its campaign slide.
  // strips(cardRows,6,.021,[688,4,672,896],insert,12);
  strips(cardRows,2,.029,[4,4,672,896],insert,12);
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
  return (t,camera,shadow,lift,slip,air,cardLayout)=>{
    camera(pass);
    gl.uniform3fv(layout,cardLayout);
    gl.uniform3f(flight,lift,slip,air);
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
