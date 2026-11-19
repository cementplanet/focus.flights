#version 300 es
// Translated from the T7 prototype's Cabin.metal.
precision highp float;
in vec3 point, surfaceNormal;
in vec4 material;
in vec3 windowLight;
flat in vec3 skyLight, cloudLight;
uniform float shade;
out vec4 pixel;

float saturate(float x) { return clamp(x, 0., 1.); }
vec3 displayRGB(vec3 rgb) {
    rgb = clamp(rgb, 0., 1.);
    return mix(rgb*12.92, 1.055*pow(rgb, vec3(1./2.4))-.055, greaterThan(rgb, vec3(.0031308)));
}
float moldedGrain(vec2 uv) {
    vec2 cell = floor(uv);
    float noise = fract(52.9829189 * fract(dot(cell, vec2(0.06711056, 0.00583715))));
    return (noise - 0.5) * (1.0 - smoothstep(0.45, 1.6, length(fwidth(uv))));
}
void main() {
    vec4 surface = material;
    vec3 p = point;
    vec3 n = normalize(surfaceNormal);
    vec3 view = normalize(vec3(0.0, 0.045, -3.25) - p);

    vec3 apertureCenter = vec3(0.0, 0.0, 0.48);
    vec3 toGlass = normalize(apertureCenter - p);
    vec3 toSky = normalize(vec3(0.0, 0.61, 0.47) - p);
    vec3 toCloud = normalize(vec3(0.0, -0.48, 0.47) - p);
    float exposure = surface.y;
    vec3 sky = skyLight;
    vec3 cloud = cloudLight;
    if (surface.x > 3.9) {
        float u = surface.z, h = surface.w;
        float edge = exp(-h * 90.0);
        vec2 recess = abs(vec2(u, h - 0.053)) - vec2(0.113, 0.009);
        float roundedEdge = length(max(recess, vec2(0.0))) + min(max(recess.x, recess.y), 0.0) - 0.008;
        float grip = 1.0 - smoothstep(-0.006, 0.010, roundedEdge);
        float lip = 1.0 - smoothstep(0.004, 0.015, abs(roundedEdge));
        // Cabin-side fill and diffuse light returning through the uncovered opening.
        float opening = 1.0 - shade;
        float spill = exp(-3.8 * h) * smoothstep(0.0, 0.42, opening);
        float side = clamp((abs(u) - 0.24) / 0.31, 0.0, 1.0);
        float wrap = 0.76 + 0.24 * max(dot(n, vec3(0.0, 0.55, -0.835)), 0.0);
        vec3 reflected = mix(sky, cloud, 0.28);
        vec3 light = sky * (0.045 + 0.12 * opening) + reflected * (0.18 * spill);
        vec3 color = (vec3(0.002) + light * wrap * (1.0 - 0.30 * side * side))
                   * (1.0 - 0.30 * grip);
        color += reflected * spill * (0.020 * edge + 0.014 * lip * smoothstep(0.049, 0.067, h));
        color *= 1.0 + 0.14 * moldedGrain(vec2(u, h) * vec2(185., 220.));
        pixel = vec4(displayRGB(color), 1.0);
        return;
    }
    float finish = surface.x;
    float bevel = smoothstep(.535, .551, surface.z);
    vec3 base = mix(vec3(.027, .029, .032), vec3(.38, .39, .40), bevel);

    // Scale the grain in object space and filter it on foreshortened surfaces.
    vec2 uv = p.xy * vec2(190., 240.) + p.z * 95.;
    float grain = moldedGrain(uv) + 0.45 * moldedGrain(uv * 2.17);
    base *= 1.0 + grain * mix(0.15, 0.28, smoothstep(0.1, 1.0, finish));
    // The deeper, glass-facing bevel sees a much larger portion of the sky.
    float reach = exp2(-max(surface.z - .548, 0.) / .023);
    float facing = max(dot(n, toGlass), 0.);
    vec3 bounce = .15 * (sky * max(dot(n, toSky), 0.) + cloud * max(dot(n, toCloud), 0.));
    float shadeEdge = .69 - shade * 1.51;
    float occlusion = 1. - shade * (.75 + .22 * smoothstep(shadeEdge-.17, shadeEdge+.17, p.y));
    vec3 incident = windowLight * (.26 + .76 * facing) + bounce;
    float reflection = pow(max(dot(n, normalize(toGlass + view)), 0.), 22.);
    vec3 diffuse = base * (incident * reach * occlusion + vec3(.00065)) * exposure;
    vec3 sheen = windowLight * reflection * .10 * reach * occlusion;
    float edge = clamp((surface.z - .551) / (.637 - .551), 0., 1.);
    float coverage = 1.0 - edge*edge*edge * (edge*(edge*6.0 - 15.0) + 10.0);
    pixel = vec4(displayRGB(diffuse + sheen) * coverage, coverage);
}
