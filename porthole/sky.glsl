#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2D;
// FocusFlights/FocusMap/PortholeSky.metal, rendered in the branch's evening palette.
uniform sampler3D shapeNoise, detailNoise;
uniform sampler2D weatherNoise;
uniform vec2 resolution;
uniform vec4 view; // optical centre and field of view, in viewport units
uniform vec3 camera; // pitch, metres climbed, metres forward
uniform sampler2D aircraft;
uniform float elapsed;
layout(location = 0) out vec4 pixel;
layout(location = 1) out vec4 cabinLight;
const float cloudBase = 160., cloudCeiling = 1120.;
const float earthRadius = 6371000.;
const float sceneHour = 19.55;
struct Palette { vec3 zenith; vec3 sky; vec3 horizon; vec3 shadow; vec3 light; float stars; };
float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 rgb(uint hex) {
    return vec3(hex >> 16u, (hex >> 8u) & 255u, hex & 255u) / 255.0;
}


Palette twilight() {
    float t = (sceneHour - 19.2) / (21.0 - 19.2);
    return Palette(mix(rgb(0x17243fu), rgb(0x091327u), t), mix(rgb(0x3e5074u), rgb(0x182a49u), t),
        mix(rgb(0xad8495u), rgb(0x455472u), t), mix(rgb(0x222d47u), rgb(0x121c31u), t),
        mix(rgb(0x90869du), rgb(0x626f8du), t), mix(.35, 1., t));
}
uint skyHash(uvec2 cell) {
    uint seed = cell.x * 1973u + cell.y * 9277u + 89173u;
    seed = (seed ^ 61u) ^ (seed >> 16u);
    seed *= 9u;
    seed ^= seed >> 4u;
    seed *= 668265261u;
    return seed ^ (seed >> 15u);
}

float starsAt(vec2 uv) {
    if (uv.y >= .54) return 0.;
    vec2 grid = uv * vec2(15.,23.);
    uint seed = skyHash(uvec2(ivec2(floor(grid))));
    vec2 center = .15 + .7 * vec2(seed & 255u, (seed >> 8u) & 255u) / 255.;
    float star = 1. - smoothstep(.018,.064,length(fract(grid)-center));
    float brightness = float((seed >> 16u) & 255u) / 255.;
    return star * smoothstep(.82,1.,brightness) * (1.-smoothstep(.1,.54,uv.y));
}

vec3 skyColor(vec2 uv, Palette palette, float elevation, float lift) {
    vec3 color = mix(palette.zenith, palette.sky, saturate(uv.y / .38));
    color = mix(color, palette.horizon, saturate((uv.y-.38)/.20));
    color = mix(color, palette.shadow, saturate((uv.y-.58)/.42));
    vec3 blue = mix(rgb(0x5576a0u), rgb(0x182e53u), smoothstep(-.12,.89,elevation));
    color = mix(color,blue,lift);
    return mix(color,rgb(0xdee7fbu),palette.stars*starsAt(uv)*(1.-.45*lift));
}

float density(vec3 point, float terrainScale) {
    float altitude = point.y + dot(point.xz, point.xz) / (2.0 * earthRadius);
    if (altitude > cloudCeiling || altitude < cloudBase) return 0.0;

    point.x += 72.0 * elapsed;
    vec2 weatherUV = point.xz * vec2(0.82, 1.24) / 31000.0 + vec2(0.29, 0.63);
    vec2 weather = textureLod(weatherNoise, weatherUV, 0.0).rg;
    float banks = textureLod(weatherNoise, weatherUV * 0.49 + vec2(0.31, 0.18), 0.0).r;
    float coverage = smoothstep(0.31, 0.68, weather.r * 0.56 + banks * 0.44);
    vec3 shapeUV = point * vec3(1.0, 1.62, 1.0) / 4050.0;
    vec4 shape = textureLod(shapeNoise, shapeUV, 0.0);
    // Perlin-Worley rolls and Worley billows from the Sky Preview noise volumes.
    float rolls = (shape.r - 0.668) / 0.078;
    float billows = (dot(shape.gba, vec3(0.5, 0.3, 0.2)) - 0.477) / 0.11;
    float top = mix(360.0, 970.0, coverage) + (weather.g - 0.5) * 210.0;
    float edge = top + (rolls * 79.0 + billows * 30.0) * mix(0.4, 1.0, terrainScale) - altitude;
    if (edge < -40.0) return 0.0;

    float baseShape = clamp(32.0 + billows * 33.0 + (weather.g - 0.5) * 95.0, 0.0, 110.0);
    if (altitude <= cloudBase + baseShape) return 0.0;
    if (terrainScale > 0.0) {
        vec3 detail = textureLod(detailNoise, point / 950.0 + vec3(0.13, 0.21, 0.39), 0.0).rgb;
        float erosion = dot(detail, vec3(0.55, 0.30, 0.15)) - 0.46;
        edge += erosion * 155.0 * terrainScale;
    }
    float base = smoothstep(cloudBase + baseShape, cloudBase + 240.0 + baseShape, altitude);
    return smoothstep(-18.0, 160.0, edge) * base * mix(0.35, 1.0, coverage);
}
float terrainAt(float distance) {
    return 1.0 - smoothstep(7000.0, 26000.0, distance);
}

vec2 cloudSpan(vec3 ray, float height) {
    float ceiling = height - cloudCeiling;
    float a = dot(ray.xz, ray.xz) / (2.0 * earthRadius);
    float discriminant = ray.y * ray.y - 4.0 * a * ceiling;
    if (ray.y >= 0.0 || discriminant <= 0.0) return vec2(0.0);
    float root = sqrt(discriminant);
    return vec2(2.0 * ceiling / (root - ray.y), min((root - ray.y) / (2.0 * a), 47000.0));
}

vec3 atmosphere(vec2 position, vec2 uv, vec3 ray, float height) {
    Palette palette = twilight();
    float lift = camera.y / 1250.;
    vec3 sky = skyColor(uv,palette,ray.y,lift);
    vec2 span = cloudSpan(ray, height);
    float fade = 1.0 - smoothstep(7200.0, 43000.0, span.x);
    if (span.y <= span.x || fade <= 0.0) return sky;

    vec3 origin = vec3(260.0, height, -830.0 + camera.z);
    // Lower light at twilight, using the site's shadow and highlight palette throughout the day.
    float lightHeight = 0.29 + 0.55 * saturate(1.0 - abs(sceneHour - 12.0) / 6.0);
    vec3 toLight = normalize(vec3(-0.36, lightHeight, -0.40));
    float jitter = float(skyHash(uvec2(position.xy)) & 65535u) / 65535.0;
    float sampleOffset = 0.5 + (jitter - 0.5) * 0.22;
    vec3 haze = mix(palette.sky, palette.horizon, smoothstep(0.46, 0.78, uv.y));
    float grazing = 1.0 - smoothstep(0.008, 0.075, abs(ray.y));
    float hazeRate = 0.000095 + grazing * 0.00018;
    vec3 scattering = vec3(0.0);
    float transmittance = 1.0;
    float t = span.x;
    for (int i = 0; i < 112 && t < span.y; ++i) {
        float stepLength = min(span.y - t, 0.049 * (420.0 + t - span.x));
        float depth = t + sampleOffset * stepLength;
        vec3 point = origin + ray * depth;
        t += stepLength;
        float fog = density(point, terrainAt(depth));
        if (fog <= 0.0) continue;

        float extinction = 1.0 - exp(-fog * stepLength * 0.019);
        float terrain = terrainAt(t);
        float towardLight = density(point + toLight * 56.0, terrain) * 0.68
                          + density(point + toLight * 153.0, terrain) * 0.90
                          + density(point + toLight * 355.0, terrain) * 1.10;
        float lighting = 0.20 + 0.80 * exp(-towardLight * 1.7);
        lighting = mix(lighting, 0.32, smoothstep(2100.0, 8400.0, t) * grazing * 0.80);
        vec3 color = mix(palette.shadow, palette.light, lighting);
        color = mix(color, mix(haze, sky, grazing), 1.0 - exp(-t * hazeRate));
        scattering += transmittance * extinction * color;
        transmittance *= 1.0 - extinction;
        if (transmittance < 0.012) break;
    }

    return sky * (1.0 - fade * (1.0 - transmittance)) + scattering * fade;
}


void main() {
    vec2 position = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y);
    vec2 filmUV = (position / resolution - view.xy) / view.zw + .5;
    vec3 ray = vec3((filmUV.x - .5) * (2. / 3.), (.548 - filmUV.y) * .86, 1.);
    float c = cos(camera.x), s = sin(camera.x);
    ray.yz = mat2(c, -s, s, c) * ray.yz;
    ray = normalize(ray);
    vec2 slope = ray.xy / ray.z;
    vec2 uv = vec2(.5 + 1.5 * slope.x, .548 - slope.y / .86);
    vec3 color = atmosphere(position, uv, ray, 1240. + camera.y);
    // One display-level dither keeps the long blue gradient smooth at 8 bits.
    float grain = fract(52.9829189 * fract(dot(floor(position),vec2(.06711056,.00583715)))) - .5;
    // Cabin surfaces receive ambient sky light without the passing aircraft or its trail.
    cabinLight = vec4(color + grain / 255., 1.);

    // Intersect this ray with the passing aircraft's plane, 6 km beyond the glass.
    vec2 distant = slope * (1. - camera.z / 6000.) + vec2(0., camera.y / 6000.);
    vec2 world = vec2(.5 + 1.5 * distant.x, .548 - distant.y / .86);
    vec2 center = vec2(.55 + .095*sin(elapsed*.052), .463 + .006*cos(elapsed*.052));
    vec2 sprite = (world-center)/vec2(.18,.038) + .5;
    float trail = smoothstep(-.44,-.055,world.x-center.x) * (1.-smoothstep(-.070,-.054,world.x-center.x));
    float trailY = center.y+.004-(world.x-center.x)*.008;
    color = mix(color, vec3(.81,.79,.81), .14*trail*exp(-abs(world.y-trailY)*560.));
    if (all(greaterThanEqual(sprite,vec2(0.))) && all(lessThanEqual(sprite,vec2(1.)))) {
        vec4 plane = texture(aircraft, sprite);
        color = mix(color, plane.rgb, plane.a);
    }
    pixel = vec4(color + grain / 255., 1.);
}
