#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec4 finish;
uniform vec2 resolution;
uniform float shade;
uniform float zoom;
uniform sampler2D skyMap;
out vec3 point, surfaceNormal;
out vec4 material;
flat out vec3 skyLight, cloudLight, horizonLight;

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
    if (finish.x == 4.) point.y -= 1.51 * shade;
    float z = 3.25 + point.z;
    vec2 projected = 2.81 * vec2(point.x, (point.y - .017 + point.z*.065) * resolution.x/resolution.y);
    gl_Position = vec4(zoom * projected, 2.*(.17*z-.23)-z, z);
    surfaceNormal = normal;
    material = finish;
    skyLight = lightAt(.24);
    cloudLight = lightAt(.76);
    horizonLight = lightAt(.52);
}
