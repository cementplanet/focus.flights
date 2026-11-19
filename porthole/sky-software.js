// Project a ray for each scanline. The cloud deck and aircraft have finite
// distances, while the sky colour depends only on the direction of the ray.
export function drawSky(ctx, w, h, view, deck, aircraft, time) {
  const c = Math.cos(view.pitch), s = Math.sin(view.pitch);
  const sx = w * view.skyX, sy = h * view.skyY;
  const centerX = w * view.x, centerY = h * view.skyCenterY;
  const altitude = view.rise / 1250;
  const clamp = v => Math.max(0, Math.min(1, v));
  function rayAt(y) {
    const slope = .86 * (.048 - (y - centerY) / sy);
    const z = c - s * slope;
    return {slope: (c * slope + s) / z, z};
  }
  const stops = [[20,33,58],[55,73,108],[153,123,142],[32,42,67]];
  const field = ctx.createLinearGradient(0,0,0,h);
  for (let i = 0; i <= 32; i++) {
    const {slope} = rayAt(h*i/32);
    const uv = .548 - slope/.86;
    const band = uv < .38 ? 0 : uv < .58 ? 1 : 2;
    const blend = clamp((uv - [0,.38,.58][band]) / [.38,.2,.42][band]);
    const elevation = clamp((slope / Math.hypot(1,slope) + .12) / 1.01);
    const zenith = elevation*elevation*(3-2*elevation);
    const color = stops[band].map((v,k)=>{
      const twilight = v + (stops[band+1][k]-v)*blend;
      const high = [85,118,160][k] + ([24,46,83][k]-[85,118,160][k])*zenith;
      return Math.round(twilight + (high-twilight)*altitude);
    });
    field.addColorStop(i/32,`rgb(${color.join(" ")})`);
  }
  ctx.fillStyle = field;
  ctx.fillRect(0,0,w,h);
  // The atlas retains the lower half of a 4:1 angular projection.
  const fullHeight = deck.height * 2;
  for (let y = 0; y < h; y++) {
    const {slope,z} = rayAt(y + .5);
    if (slope > -.003) continue;
    // Reproject the wide cloud field against a deck at 600 metres.
    const ratio = 640 / (640 + view.rise + view.travel * slope);
    const v = .548 - slope * ratio / .86;
    const drawWidth = (deck.width/fullHeight) * sx * 1.5 * z / ratio;
    const sourceHeight = Math.max(1, fullHeight * ratio / (sy * z * z));
    const sourceY = Math.min(deck.height-sourceHeight, (v-.5) * fullHeight - sourceHeight/2);
    ctx.drawImage(deck,0,sourceY,deck.width,sourceHeight,centerX-drawWidth/2,y,drawWidth,1);
  }
  const planeY = (.548 - (.463 + .006*Math.cos(time*.052))) * .86;
  const depth = 1-view.travel/6000;
  const above = planeY-view.rise/6000;
  const z = s*above + c*depth;
  const x = centerX + sx*(.05+.095*Math.sin(time*.052))/z;
  const y = centerY + sy*(.048-(c*above-s*depth)/(.86*z));
  const width = .18*sx/z, height = .038*sy/z;
  ctx.drawImage(aircraft, x-width/2, y-height/2, width, height);
}
