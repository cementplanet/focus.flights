#version 300 es
precision highp float;
uniform sampler2D skyMap;
uniform vec2 resolution;
uniform float zoom;
out vec4 pixel;

vec3 linearRGB(vec3 c) {
    return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), greaterThan(c, vec3(.04045)));
}
void main() {
    vec2 screen = vec2(gl_FragCoord.x, resolution.y-gl_FragCoord.y) / resolution;
    vec2 scale = zoom * vec2(1., 1.5*resolution.x/resolution.y);
    vec2 uv = ((screen-.5)/scale - vec2(0.,.002)) / vec2(.435,.44) + .5;
    if (any(lessThan(uv, vec2(-.02))) || any(greaterThan(uv, vec2(1.02)))) discard;
    vec3 outside = texture(skyMap, vec2(uv.x, 1.-uv.y)).rgb;
    vec2 edgeUV = (uv-.5)*vec2(2.,2.35);
    float thickness = smoothstep(.40,1.66,dot(edgeUV,edgeUV));
    float streak = uv.x-.225+(uv.y-.5)*.08;
    float reflected = exp(-streak*streak*109.) * (1.-smoothstep(.07,.44,abs(uv.y-.52)));
    vec3 light = .25*linearRGB(texture(skyMap, vec2(.22,.76)).rgb)
               + .50*linearRGB(texture(skyMap, vec2(.50,.76)).rgb)
               + .25*linearRGB(texture(skyMap, vec2(.78,.76)).rgb);
    vec3 glass = linearRGB(outside) * (.984-.043*thickness) + light*reflected*.027;
    pixel = vec4(mix(glass*12.92, 1.055*pow(glass, vec3(1./2.4))-.055, greaterThan(glass,vec3(.0031308))), 1.);
}
