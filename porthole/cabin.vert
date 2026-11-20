#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec4 finish;
uniform vec2 resolution;
uniform float shade;
uniform float zoom;
uniform vec4 projection;
uniform vec2 tilt;
uniform sampler2D skyMap;
out vec3 point, surfaceNormal;
out vec4 material;
out vec3 windowLight;
flat out vec3 skyLight;

vec3 linearRGB(vec3 c) {
    return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), greaterThan(c, vec3(.04045)));
}
vec3 lightAt(float y) {
    return .25 * linearRGB(textureLod(skyMap, vec2(.22, 1.-y), 0.).rgb)
         + .50 * linearRGB(textureLod(skyMap, vec2(.50, 1.-y), 0.).rgb)
         + .25 * linearRGB(textureLod(skyMap, vec2(.78, 1.-y), 0.).rgb);
}
void main() {
    point = position;
    if (finish.x == 4.) point.y -= .08 + 1.43 * shade;
    float z = 3.25 + point.z - projection.w;
    float y = point.y - .017 + point.z*.065 - tilt.y;
    vec2 lens = mat2(cos(tilt.x),sin(tilt.x),-sin(tilt.x),cos(tilt.x)) * vec2(y,z);
    z = lens.y;
    vec2 projected = 2.81 * vec2(point.x, lens.x * resolution.x/resolution.y);
    gl_Position = vec4(zoom * projection.z * projected + projection.xy*z, z-.04, z);
    surfaceNormal = normal;
    material = finish;
    // Sample a small patch just inside the corresponding part of the aperture.
    vec2 uv = vec2(.5) + vec2(.72, .52) * point.xy;
    windowLight = .5 * linearRGB(textureLod(skyMap, uv, 0.).rgb)
                + .25 * linearRGB(textureLod(skyMap, uv + vec2(.035,.025), 0.).rgb)
                + .25 * linearRGB(textureLod(skyMap, uv - vec2(.035,.025), 0.).rgb);
    skyLight = lightAt(.24);
}
