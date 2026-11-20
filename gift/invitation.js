// All dimensions are in studio metres. Local z faces the viewer. The envelope,
// insert and flaps share the model's depth buffer, including the lip of the box.
export function prepareInvitation(gl, program, project, atlas) {
  const vertex = `
    attribute vec3 point;
    attribute vec2 uv;
    attribute float panel;
    uniform float shot;
    varying highp vec2 texCoord;
    varying mediump float face, shade;
    ${project}
    void main() {
      float lift = smoothstep(.51,.84,shot);
      float open = smoothstep(.69,.92,shot);
      float extract = smoothstep(.77,.985,shot);
      vec3 p = point;
      if (panel == 2.) p.y += .57*extract;
      if (panel == 4.) {
        float hinge = p.y-.865;
        float angle = open*3.79;
        p.y = .865+hinge*cos(angle);
        p.z += -hinge*sin(angle) - .21*open;
      }
      float roll = -.12*(1.-lift) + .045*sin(lift*3.14159) + .014*lift;
      p.xy = mat2(cos(roll),sin(roll),-sin(roll),cos(roll))*p.xy;
      float pitch = .54*(1.-lift) + .08*lift;
      float height = p.y*cos(pitch)+p.z*sin(pitch);
      float depth = p.z*cos(pitch)-p.y*sin(pitch);
      float yaw = .26 + .16*lift;
      vec3 world = vec3(p.x*cos(yaw)+depth*sin(yaw),p.x*sin(yaw)-depth*cos(yaw),
                        height+1.08+2.63*lift+.44*extract);
      vec3 delta = world-eye;
      float d = dot(delta,forward);
      gl_Position = vec4(dot(delta,right)*lens.x,dot(delta,up)*lens.y,1.002*d-.1001,d);
      texCoord=uv;
      face=panel;
      shade=.72+.28*lift;
      if (panel==4.) shade*=1.-.32*sin(open*3.14159);
    }`;
  const fragment = `
    precision highp float;
    varying highp vec2 texCoord;
    varying mediump float face, shade;
    uniform sampler2D surface;
    void main() {
      vec4 sampleColor=texture2D(surface,texCoord);
      if (sampleColor.a < .46) discard;
      vec3 color=sampleColor.rgb;
      if (face != 2. && face != 5.) {
        float y=clamp((texCoord.y-.30)/.37,0.,1.);
        float grain=sampleColor.r*.59;
        float light=.052+.077*y+.035*(1.-texCoord.x);
        if (face==1.) light*=.63;
        if (face==3.) light+=.024*(1.-texCoord.x);
        if (face==4.) light+=.03;
        color=vec3(light*1.06,light,light*.93)+grain;
      }
      gl_FragColor=vec4(color*shade,1.);
    }`;
  const pass = program(gl,vertex,fragment,["point","uv","panel"]);
  const shot = gl.getUniformLocation(pass.handle,"shot");
  const data = [];
  const paper = [2,662,1020,756], card = [1,1,1022,644], seal = [5,1440,384,372];
  const halfWidth = 1.24, halfHeight = .865;
  function polygon(points, layer, depth, region = paper, bounds = [-halfWidth,-halfHeight,halfWidth,halfHeight]) {
    const [left,bottom,right,top] = bounds;
    for (let i=1;i<points.length-1;i++) {
      for (const [x,y] of [points[0],points[i],points[i+1]]) {
        const u = (region[0]+region[2]*(x-left)/(right-left))/1024;
        const v = 1-(region[1]+region[3]*(top-y)/(top-bottom))/2048;
        data.push(x,y,depth,u,v,layer);
      }
    }
  }
  function rectangle(left,bottom,right,top,layer,depth,region) {
    polygon([[left,bottom],[right,bottom],[right,top],[left,top]],layer,depth,region,[left,bottom,right,top]);
  }
  // Pocket, insert, overlapped side folds and the pressed bottom seam.
  rectangle(-1.24,-.865,1.24,.865,0,-.06,paper);
  const cw=1.14, ch=.72, r=.065;
  const rounded=[];
  for (const [x,y,start] of [[cw-r,ch-r,0],[-cw+r,ch-r,90],[-cw+r,-ch+r,180],[cw-r,-ch+r,270]]) {
    for(let j=0;j<=5;j++) {
      const angle=(start+j*18)*Math.PI/180;
      rounded.push([x+r*Math.cos(angle),y+r*Math.sin(angle)]);
    }
  }
  polygon(rounded,2,-.015,card,[-cw,-ch,cw,ch]);
  for(const side of [-1,1]) {
    polygon([[side*1.24,-.865],[side*1.24,.65],[side*1.14,.63],[0,-.29]],1,.023);
  }
  polygon([[-1.24,-.865],[1.24,-.865],[1.24,-.74],[.16,-.24],[0,-.212],[-.16,-.24],[-1.24,-.74]],3,.035);
  polygon([[-1.24,.865],[1.24,.865],[1.24,.60],[.16,-.24],[0,-.267],[-.16,-.24],[-1.24,.60]],4,.06);
  // The broken seal stays on the pocket as the upper flap lifts free.
  rectangle(-.24,-.508,.24,-.043,5,.078,seal);
  const buffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  return (t,camera)=>{
    if (t<=.51) return;
    camera(pass);
    gl.uniform1f(shot,t);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for (const [slot,size,offset] of [[pass.point,3,0],[pass.uv,2,12],[pass.panel,1,20]]) {
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot,size,gl.FLOAT,false,24,offset);
    }
    gl.bindTexture(gl.TEXTURE_2D,atlas);
    gl.drawArrays(gl.TRIANGLES,0,data.length/6);
    for (const slot of [pass.point,pass.uv,pass.panel]) gl.disableVertexAttribArray(slot);
  };
}
