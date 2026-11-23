float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + 1.), f.x), f.y);
}

float mist(vec2 p) {
  return .55 * noise(p) + .29 * noise(p * 2.13 + 25.) + .16 * noise(p * 4.37 + 94.);
}

// The archived runway's aircraft, wet ground and lamps share one contact point.
vec3 runwayColor(vec2 screen, float aspect, float travel, float seconds) {
  vec2 p=vec2(screen.x*aspect,screen.y+1.)*.5;
  float spanAtRest=min(.74*aspect,.94);
  float settle=smoothstep(0.,1.,travel);
  float viewScale=mix(.86,1.,settle);
  float wheelsAtRest=mix(.205,.11,smoothstep(.65,1.4,aspect));
  vec3 aircraft=vec3(spanAtRest*viewScale,spanAtRest*(502./1682.)*viewScale,
    wheelsAtRest-.48*(1.-travel));
  vec2 entrance=vec2(smoothstep(.05,.88,travel),smoothstep(.09,.77,travel));
  float approach = mix(.962, 1., entrance.y);
  float span = aircraft.x * approach, height = aircraft.y * approach, wheels = aircraft.z;
  float eye = max(.017, height * .11);
  float horizon = wheels + eye;
  // Start the sweep once the runway clears the bottom of the viewport.
  float lampArrival = clamp((horizon - .015) / (wheelsAtRest + eye - .015), 0., 1.);
  float above = p.y - horizon;
  float skyY = max(above, 0.);
  float fieldHeight = max(.21, height * .92) * mix(.53, 1., entrance.x);
  vec2 atmosphere = vec2(p.x / (span * .82), skyY / fieldHeight);
  vec2 drift = vec2(seconds * .014, seconds * .002);
  float vapor = mist(atmosphere * vec2(6., 4.) + drift + vec2(9., 13.));
  float wide = exp(-dot(atmosphere, atmosphere) * 1.85);
  vec2 core = vec2(p.x / (span * .48), (skyY - height * .12) / (fieldHeight * .59));
  float glow = .47 * wide + .54 * exp(-dot(core, core) * 1.35);
  float luminance = mix(.12, 1., entrance.x) * glow * (.86 + .23 * vapor);
  vec3 color = vec3(.018,.023,.030) + luminance * vec3(.934,.941,.948);

  if (above < 0.) {
    // Inverse perspective maps each asphalt sample back to the ground plane.
    float distanceFromEye = -above;
    float depth = eye / max(distanceFromEye, .0007);
    vec2 ground = vec2(p.x * depth / span, depth);
    vec3 air = color;
    float ripple = noise(vec2(p.x * 145. + 5., p.y * 2100.));
    float roughness = mist(ground * vec2(73., 56.));
    float wet = exp(-abs(p.x) / (span * .49));
    float streak = noise(vec2(ground.x * 185., ground.y * 4.));
    float sheen = (.15 + .23 * roughness + .12 * streak + .055 * ripple) * wet;
    color = vec3(.021,.025,.030) + vec3(sheen) * (.29 + .71 * exp(-distanceFromEye * 13.));
    // Faint weathered centreline glimpsed through the reflections.
    float paint = (1. - smoothstep(.002, .004, abs(ground.x))) *
      smoothstep(.20,.26,fract(depth * 5.)) * (1. - smoothstep(.69,.76,fract(depth * 5.)));
    color += vec3(.095 * paint * roughness);
    // The same transparent cutout reflects below its wheel contact, broken by wet asphalt.
    // Main bogies meet the runway slightly farther away than the nose gear.
    float contact = wheels + height * mix(.005,.023,smoothstep(.028,.075,abs(p.x)/span));
    float reflectedY = (contact - p.y) * 1.16 / height;
    if (reflectedY > 0. && reflectedY < 1.) {
      vec2 uv = vec2(.5 + p.x / span + (ripple - .5) * (.001 + .024 * reflectedY),
        1. - (contact - wheels) / height - reflectedY);
      float reflection = texture2D(airliner, vec2(uv.x,1.-uv.y)).a;
      color *= 1. - entrance.y * reflection * exp(-reflectedY * 3.6) * (.79 - .28 * roughness);
    }
    float edge = abs(abs(ground.x) - .55);
    float stripe = 1. - smoothstep(.0008,.0035 + .001 * depth,edge);
    color += vec3(.082 * stripe * (.2 + roughness)) * smoothstep(.12,.5,depth);
    vec2 contactOffset = vec2(p.x / (span * .205), (p.y - wheels) / (height * .027));
    float contactShade = exp(-dot(contactOffset, contactOffset));
    color *= 1. - entrance.y * .49 * contactShade;
    color = mix(color, air, .90 * exp(-distanceFromEye / (eye * .16)));
  }

  // Equal intervals along each runway edge foreshorten toward the same eye line.
  for (int i = 0; i < 18; ++i) {
    float z = .58 + float(i) * .38;
    vec2 lamp = vec2(span * .55 / z, horizon - eye / z);
    vec2 d = vec2(abs(p.x) - lamp.x, p.y - lamp.y);
    float r = max(.0006, min(.00155, height * .005) / z);
    // Each pair catches together, from the vanishing point toward the viewer.
    float ignition = mix(.22, .49, 1. - log(z / .58) / log(7.04 / .58));
    float age = lampArrival - ignition;
    float lit = smoothstep(0., .055, age);
    float flash = lit * (1. - smoothstep(.07, .48, age));
    // Breathe over 4.8 seconds, with the foreground following the far end slightly.
    float phase = seconds * (6.283185 / 4.8) + float(i) * .055;
    float breath = smoothstep(.32, .50, age) * sin(phase);
    float bloom = 1. + 2.9 * flash + .42 * breath;
    float bulb = exp(-dot(d,d) / (r*r * bloom));
    float halo = exp(-length(d / vec2(3.5,2.6)) / (r * bloom));
    float spill = exp(-abs(d.x) / (r * 1.65) - abs(d.y) / (r * 12. * bloom)) * step(d.y, 0.);
    float lampPower = lit * (1. + 1.65 * flash + .38 * breath);
    color += lampPower * vec3(1., .985, .953) * (.77 * bulb + .19 * halo + .12 * spill) / (1. + .13*z);
  }
  color += (hash(gl_FragCoord.xy) - .5) * (.008 + .012 * luminance);
  vec2 planeUV=vec2(.5+p.x/span,(p.y-wheels)/height);
  if (min(planeUV.x,planeUV.y)>=0. && max(planeUV.x,planeUV.y)<=1.) {
    vec4 plane=texture2D(airliner,planeUV);
    color=mix(color,plane.rgb,plane.a*entrance.y);
  }
  return color;
}
