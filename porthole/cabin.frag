#version 300 es
// Translated from the T7 prototype's Cabin.metal.
precision highp float;
in vec3 point, surfaceNormal;
in vec4 material;
flat in vec3 skyLight, cloudLight, horizonLight;
uniform float shade;
out vec4 pixel;

float saturate(float x) { return clamp(x, 0., 1.); }
vec3 displayRGB(vec3 rgb) {
    rgb = clamp(rgb, 0., 1.);
    return mix(rgb*12.92, 1.055*pow(rgb, vec3(1./2.4))-.055, greaterThan(rgb, vec3(.0031308)));
}
float outerWallMask(float height) {
    return mix(.83, .36, smoothstep(-.85, 1.20, height));
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
    vec3 horizon = horizonLight;
    if (surface.x > 3.9) {
        float u = surface.z, h = surface.w;
        float edge = exp(-h * 90.0);
        vec2 recess = abs(vec2(u, h - 0.053)) - vec2(0.113, 0.009);
        float roundedEdge = length(max(recess, vec2(0.0))) + min(max(recess.x, recess.y), 0.0) - 0.008;
        float grip = 1.0 - smoothstep(-0.006, 0.010, roundedEdge);
        float lip = 1.0 - smoothstep(0.004, 0.015, abs(roundedEdge));
        vec3 bounce = mix(cloud, sky, 0.52);
        vec3 key = normalize(vec3(0.0, 0.58, -0.79));
        float facing = max(dot(n, key), 0.0);
        float edgeBounce = exp(-h * 9.0) * (1.0 - shade * 0.75);
        vec3 color = vec3(0.129, 0.116, 0.099) * (0.073 + facing * 0.095)
                     + bounce * (0.018 + 0.024 * edge + 0.060 * edgeBounce + 0.013 * facing);
        color *= (1.0 - grip * 0.35) * (0.90 - 0.2 * shade);
        color += bounce * lip * smoothstep(0.049, 0.067, h) * (0.013 + 0.016 * edgeBounce);
        pixel = vec4(displayRGB(color), 1.0);
        return;
    }
    vec3 ambient = mix(mix(sky, cloud, 0.68), horizon, 0.20);
    float ambientLuma = dot(ambient, vec3(0.213, 0.715, 0.072));
    ambient = mix(vec3(ambientLuma), ambient, 0.78);

    float finish = surface.x;
    vec3 base = mix(vec3(0.031, 0.033, 0.037), vec3(0.58, 0.536, 0.463), saturate(finish));
    base = mix(base, vec3(0.229, 0.239, 0.24), saturate(finish - 1.0));
    base = mix(base, vec3(0.073, 0.082, 0.092), saturate(finish - 2.0));

    // Fine molded grain. Fade it at the output pixel scale to avoid shimmer on bevels.
    vec2 grainUV = p.xy * vec2(410.0, 530.0) + p.z * 194.0;
    vec2 cell = floor(grainUV);
    float grain = fract(52.9829189 * fract(dot(cell, vec2(0.06711056, 0.00583715))));
    float grainWeight = 1.0 - smoothstep(0.35, 1.5, length(fwidth(grainUV)));
    base *= 1.0 + (grain - 0.5) * grainWeight * mix(0.030, 0.13, smoothstep(1.5, 3.0, finish));
    float split = smoothstep(0.62, 0.98, p.y);
    float diffuseSky = max(dot(n, toSky), 0.0);
    float diffuseCloud = max(dot(n, toCloud), 0.0);
    float diffuseFace = max(dot(n, toGlass), 0.0);
    float shadeEdge = 0.69 - shade * 1.51;
    float shaded = smoothstep(shadeEdge - 0.17, shadeEdge + 0.17, p.y);
    float shadow = 1.0 - 0.38 * split;
    exposure *= 1.0 - shade * (0.48 + 0.42 * shaded);
    vec3 irradiance = ambient * (0.34 + 0.66 * diffuseFace)
                      + sky * diffuseSky * 0.67 + cloud * diffuseCloud * 0.78;
    vec3 diffuse = base * (irradiance * exposure * shadow + 0.009 * exposure);
    float wall = smoothstep(2.65, 3.0, finish);
    float rimDistance = length(p.xy * vec2(1.0, 0.70)) - .83;
    float rimFalloff = exp(-26.0 * rimDistance * rimDistance);
    diffuse += wall * rimFalloff * ambient * (0.015 * outerWallMask(p.y));

    vec3 key = normalize(vec3(0.0, 0.62, -0.67));
    float broad = pow(max(dot(n, normalize(key + view)), 0.0), 8.0);
    float glassReflection = pow(max(dot(n, normalize(toGlass + view)), 0.0), mix(35.0, 14.0, saturate(finish - 1.0)));
    float specularScale = mix(0.026, 0.11, smoothstep(2.0, 4.0, finish));
    float fresnel = 0.25 + 0.75 * pow(1.0 - saturate(dot(n, view)), 3.0);
    vec3 sheen = (ambient * glassReflection * 0.26 + (sky * 0.60 + cloud * 0.40) * broad * specularScale)
                 * exposure * fresnel * shadow;
    float outerFade = 1.0 - smoothstep(0.83, 1.54, length(p.xy * vec2(0.97, 0.73)));
    // Join the molded return to the page along the actual cross sections.
    // The quintic blend has zero slope and curvature at both ends.
    float join = clamp((surface.z - .665) / .315, 0., 1.);
    float blend = join*join*join * (join*(join*6.0 - 15.0) + 10.0);
    float coverage = 1.0 - blend;
    vec3 finishRGB = displayRGB((diffuse + sheen) * outerFade);
    vec3 cabinAmbient = vec3(.0667, .0745, .0824);
    finishRGB = mix(finishRGB, max(finishRGB, cabinAmbient), blend);
    pixel = vec4(finishRGB * coverage, coverage);
}
