#version 300 es
// Translated from the T7 prototype's Cabin.metal.
precision highp float;
in vec3 point, surfaceNormal;
in vec4 material;
in vec3 windowLight;
flat in vec3 skyLight;
uniform float shade;
out vec4 pixel;

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

    vec3 apertureCenter = vec3(0.0, 0.0, 0.48);
    vec3 toGlass = normalize(apertureCenter - p);
    float exposure = surface.y;
    vec3 sky = skyLight;
    if (surface.x > 3.9) {
        float u = surface.z, h = surface.w, recess = surface.y;
        float opening = 1.-shade;
        float left = smoothstep(-.53,.53,-u);
        float underHood = smoothstep(.10,.212,(p.y-.017+.065*p.z)/(3.25+p.z));
        float toTrack = pow(abs(u)/.54,2.90) + pow(abs(p.y)/.76,2.70);
        float contact = 1. - .55*smoothstep(.77,1.03,toTrack);
        float sideBounce = exp2(-abs(abs(u)-.52)/.125) * (.23+.77*left);
        float lowerBounce = exp2(-h/.26) * (.68+.32*left);
        float wrap = max(dot(n,normalize(vec3(-.50,-.77,-.40))),0.);
        vec3 trimLight = mix(vec3(.69,.77,.87), vec3(1.,.89,.75), .30+.66*left);
        vec3 spill = trimLight*(.105*sideBounce+.085*lowerBounce) + windowLight*.19;
        vec3 light = vec3(.015,.015,.014) + sky*.035
                   + spill*(.11+.89*opening)*(.56+.90*wrap)*(1.-.79*underHood);
        // The finger well and rolled edge catch the same grazing light as the face.
        vec3 color = vec3(.57,.55,.50)*light*contact*(1.-.47*recess);
        float grazing = max(-n.y,0.);
        float bevel = grazing*grazing;
        color += trimLight*(.024*pow(wrap,4.) + .040*bevel)
               * (.20+.80*opening)*(1.-.65*underHood);
        color *= 1. + .050*moldedGrain(vec2(u,h)*vec2(185.,220.));
        pixel = vec4(displayRGB(color), 1.0);
        return;
    }
    float w = surface.z;
    float left = smoothstep(-.60, .60, -p.x);
    float low = smoothstep(-.76, .71, -p.y);
    float sideLight = .23 + .51 * left + .43 * low;
    float opening = 1. - shade;
    float shadeEdge = .61 - shade * 1.43;
    float visible = 1. - shade * (.62 + .36 * smoothstep(shadeEdge-.18, shadeEdge+.16, p.y));

    // Cast the upper housing's shadow across all its returns in the same projected plane.
    float screenY = (p.y-.017+.065*p.z) / (3.25+p.z);
    float penumbra = smoothstep(.568, .745, w);
    float hood = smoothstep(mix(.169,.130,penumbra), mix(.198,.294,penumbra),
                            screenY + .010*p.x*p.x);
    vec3 sourceColor = mix(vec3(.72,.81,.93), vec3(1.,.88,.71), .22+.58*left+.14*low);
    vec3 irradiance = (.68*sourceColor + .65*windowLight) * sideLight;
    irradiance *= (.09 + .91*opening) * visible * (1.-.944*hood);

    // The oblique liner faces the opening. Its outer skirt curves away from it.
    float towardGlass = max(dot(n,toGlass),0.);
    vec3 liner = vec3(.89,.87,.80) * irradiance * (.64+.36*towardGlass);
    float rolledEdge = exp(-pow(abs(w-.575)/.003,2.));
    float joint = exp(-pow(abs(w-.578)/.0018,2.));
    liner += rolledEdge * .09 * irradiance;
    float skirtLight = mix(.39,.065,smoothstep(.582,.656,w));
    vec3 skirt = vec3(.83,.85,.82)*irradiance * skirtLight * (.75+.25*towardGlass);
    vec3 body = mix(liner,skirt,smoothstep(.575,.578,w)) * (1.-.46*joint);
    body *= .83+.17*exposure;
    body += vec3(.0019,.0022,.0026);

    // The seal sits in a narrow recess. Light scattered on the wall is strongest
    // alongside the seal and dies away over a much greater distance than its width.
    float seal = smoothstep(.650,.663,w);
    body = mix(body, vec3(.0019,.0023,.0027) + .013*irradiance, seal);
    float distanceToSeal = max(w-.673,0.);
    float spill = .054*exp2(-distanceToSeal/.026) + .038*exp2(-distanceToSeal/.095);
    vec3 wall = vec3(.0034,.0039,.0043) + irradiance*spill*(.35+.85*left+.35*low);
    body = mix(body, wall, smoothstep(.670,.684,w));
    float grain = moldedGrain(p.xy * 185. + p.z * 92.);
    body *= 1. + grain * .052;
    float coverage = 1. - smoothstep(.78,1.02,w);
    pixel = vec4(displayRGB(body)*coverage, coverage);
}
