#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D shapeNoise, detailNoise;
uniform sampler2D weatherNoise, aircraftShadow;
uniform vec2 resolution, aircraftOffset;
uniform float elapsed, night, aircraftDistance;
uniform float cameraHeight, deckDepth;
uniform vec3 shadowColor, lightColor, skyMid, skyHorizon;
out vec4 cloud;

const float cloudBase = 160.0;
const float cloudCeiling = 1120.0;
const float earthRadius = 6371000.0;
const float rayHorizon = 0.452;

float terrainAt(float distanceToEye) {
  return 1.0 - smoothstep(7000.0, 26000.0, distanceToEye);
}

float density(vec3 point, float terrainScale) {
  float altitude = point.y + dot(point.xz, point.xz) / (2.0 * earthRadius);
  if (altitude > cloudCeiling || altitude < cloudBase) return 0.0;

  point.x += 72.0 * elapsed;
  vec2 weatherUV = vec2(point.x * 0.82, point.z * 1.24) / 31000.0 + vec2(0.29, 0.63);
  vec2 weather = textureLod(weatherNoise, weatherUV, 0.0).rg;
  float banks = textureLod(weatherNoise, weatherUV * 0.49 + vec2(0.31, 0.18), 0.0).r;
  float coverage = smoothstep(0.31, 0.68, weather.r * 0.56 + banks * 0.44);
  vec3 shapeUV = vec3(point.x, point.y * 1.62, point.z) / 4050.0;
  vec4 shape = textureLod(shapeNoise, shapeUV, 0.0);
  // Perlin-Worley rolls and Worley billows, adapted from Halo Above the Clouds.
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

vec2 cloudSpan(vec3 ray) {
  const float far = 47000.0;
  float a = dot(ray.xz, ray.xz) / (2.0 * earthRadius);
  float b = ray.y;
  float ceiling = cameraHeight - cloudCeiling;
  float discriminant = b * b - 4.0 * a * ceiling;
  if (discriminant <= 0.0 || (ceiling >= 0.0 && b >= 0.0)) return vec2(0.0);
  float topRoot = sqrt(discriminant);
  float start = ceiling > 0.0 ? 2.0 * ceiling / (-b + topRoot) : 0.0;
  float topExit = b > 0.0 ? -2.0 * ceiling / (b + topRoot) : (topRoot - b) / (2.0 * a);
  float localRange = mix(6800.0, far, smoothstep(730.0, cloudCeiling, cameraHeight));
  return vec2(start, min(topExit, localRange));
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec3 ray = normalize(vec3((uv.x - 0.5) * min(aspect, 2.15), (uv.y - rayHorizon) * 0.86, 1.0));
  cloud = vec4(0.0);
  vec3 origin = vec3(260.0, cameraHeight, -830.0);
  vec2 span = cloudSpan(ray);
  float start = span.x;
  float finish = span.y;
  float undercast = smoothstep(-560.0, 125.0, cameraHeight);

  // Near-lens mist breaks up the cloud base as it passes upward through the frame.
  float nearDeck = smoothstep(-500.0, 265.0, cameraHeight) * (1.0 - smoothstep(520.0, 1040.0, cameraHeight));
  float veil = 0.0;
  if (nearDeck > 0.0) {
    vec3 nearPoint = origin + ray * 530.0 + vec3(elapsed * 48.0, 0.0, 0.0);
    vec3 broadUV = nearPoint / vec3(1640.0, 760.0, 1340.0) + vec3(0.26, 0.0, 0.37);
    vec3 warp = textureLod(detailNoise, broadUV * 0.67, 0.0).rgb - 0.5;
    float broad = textureLod(shapeNoise, broadUV + warp * 0.33, 0.0).r;
    float soft = textureLod(shapeNoise, broadUV * 1.8 + vec3(0.42, 0.17, 0.0), 0.0).r;
    float streaks = smoothstep(0.43, 0.77, broad * 0.74 + soft * 0.26);
    veil = nearDeck * (0.22 + 0.43 * streaks);
  }
  vec3 veilLight = mix(shadowColor, lightColor, mix(0.78, 0.46, night));
  float throughDeck = 1.0 - smoothstep(430.0, 940.0, cameraHeight);
  float horizonFade = 1.0 - smoothstep(mix(7200.0, 2800.0, throughDeck),
    mix(43000.0, 13200.0, throughDeck), start);
  if (finish <= start || horizonFade == 0.0 || undercast == 0.0 || veil == 1.0) {
    cloud = vec4(veilLight * veil, veil);
    return;
  }
  // The light direction also defines the aircraft's baked shadow projection.
  vec3 toLight = normalize(vec3(-0.36, 0.84, -0.40));
  vec2 aircraftCenter = vec2(origin.x + aircraftOffset.x, origin.z + aircraftDistance);
  float transmittance = 1.0;
  vec3 scattering = vec3(0.0);
  uvec2 pixel = uvec2(gl_FragCoord.xy);
  uint seed = pixel.x * 1973u + pixel.y * 9277u + 89173u;
  seed = (seed ^ 61u) ^ (seed >> 16u);
  seed *= 9u;
  seed ^= seed >> 4u;
  seed *= 668265261u;
  seed ^= seed >> 15u;
  float jitter = float(seed & 65535u) / 65535.0;
  // Anchor step spacing to the entry point so the far intersection cannot shift near samples.
  float stepGrowth = mix(0.049, 0.032, deckDepth);
  // Keep adjacent rays at nearly the same depth so small highlights do not sparkle.
  float sampleOffset = 0.5 + (jitter - 0.5) * mix(0.22, 0.10, deckDepth);
  float t = start;
  float horizonLight = smoothstep(0.46, 0.78, 1.0 - uv.y) * (1.0 - throughDeck);
  vec3 hazeColor = mix(skyMid, skyHorizon, horizonLight);
  hazeColor = mix(hazeColor, shadowColor, throughDeck * 0.58);
  // Long grazing rays join the sky haze.
  float grazing = 1.0 - smoothstep(0.008, 0.075, abs(ray.y));
  float horizonBlend = max(throughDeck, grazing * 0.80);
  float hazeRate = 0.000095 + grazing * 0.00018;
  for (int i = 0; i < 112; ++i) {
    if (t >= finish) break;
    float stepLength = min(finish - t, stepGrowth * (420.0 + t - start));
    float sampleDepth = t + sampleOffset * stepLength;
    vec3 point = origin + ray * sampleDepth;
    t += stepLength;
    float fog = density(point, terrainAt(sampleDepth));
    if (fog <= 0.0) continue;
    float distant = smoothstep(2100.0, 8400.0, t);
    float rangeFade = 1.0 - throughDeck * smoothstep(3500.0, 6600.0, t);
    float extinction = 1.0 - exp(-fog * stepLength * 0.019 * rangeFade * (1.0 - distant * throughDeck * 0.94));
    float lightTerrain = terrainAt(t);
    float towardLight = density(point + toLight * 56.0, lightTerrain) * 0.68
                      + density(point + toLight * 153.0, lightTerrain) * 0.90
                      + density(point + toLight * 355.0, lightTerrain) * 1.10;
    float lighting = 0.20 + 0.80 * exp(-towardLight * 1.7);
    float horizonScatter = distant * horizonBlend;
    lighting = mix(lighting, 0.32, horizonScatter);
    vec2 projection = point.xz + toLight.xz * ((1365.0 + aircraftOffset.y - point.y) / toLight.y);
    vec2 shadowUV = (projection - aircraftCenter) / 880.0 + 0.5;
    if (all(greaterThan(shadowUV, vec2(0.0))) && all(lessThan(shadowUV, vec2(1.0)))) {
      float silhouette = textureLod(aircraftShadow, shadowUV, 0.0).r;
      lighting *= 1.0 - silhouette * mix(0.46, 0.33, night);
    }
    vec3 rgb = mix(shadowColor, lightColor, lighting);
    rgb = mix(rgb, hazeColor, 1.0 - exp(-t * hazeRate));
    scattering += transmittance * extinction * rgb;
    transmittance *= 1.0 - extinction;
    if (transmittance < 0.012) break;
  }

  float opacity = 1.0 - transmittance;
  // Keep cloud color weighted by opacity for canvas compositing.
  float neutral = dot(lightColor, vec3(0.2126, 0.7152, 0.0722));
  scattering = mix(scattering, vec3(neutral * opacity), nearDeck * 0.15);
  cloud = vec4(scattering, opacity) * horizonFade * undercast;
  cloud = vec4(veilLight * veil, veil) + cloud * (1.0 - veil);
  // Feather grazing rays near the horizon while keeping the nearby cloud detail.
  float aboveDeck = smoothstep(1040.0, cloudCeiling, cameraHeight);
  cloud *= 1.0 - aboveDeck * smoothstep(rayHorizon - 0.042, rayHorizon, uv.y);
}
