#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D shapeNoise, detailNoise;
uniform sampler2D weatherNoise, aircraftShadow;
uniform vec2 resolution, aircraftOffset;
uniform float elapsed, night, aircraftDistance;
uniform vec3 shadowColor, lightColor, skyMid, skyHorizon;
out vec4 cloud;

const float cameraHeight = 1240.0;
const float cloudBase = 160.0;
const float cloudCeiling = 1120.0;
const float earthRadius = 6371000.0;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

float density(vec3 point, float distanceToEye) {
  float altitude = point.y + dot(point.xz, point.xz) / (2.0 * earthRadius);
  if (altitude > cloudCeiling || altitude < cloudBase) return 0.0;

  point.x += 72.0 * elapsed;
  vec2 weatherUV = vec2(point.x * 0.82, point.z * 1.24) / 31000.0 + vec2(0.29, 0.63);
  vec3 weather = textureLod(weatherNoise, weatherUV, 0.0).rgb;
  float banks = textureLod(weatherNoise, weatherUV * 0.49 + vec2(0.31, 0.18), 0.0).r;
  float coverage = smoothstep(0.31, 0.68, weather.r * 0.56 + banks * 0.44);
  vec3 shapeUV = vec3(point.x, point.y * 1.62, point.z) / 4050.0;
  vec4 shape = textureLod(shapeNoise, shapeUV, 0.0);
  // Perlin-Worley rolls and Worley billows, adapted from Halo Above the Clouds.
  float rolls = (shape.r - 0.668) / 0.078;
  float billows = (dot(shape.gba, vec3(0.5, 0.3, 0.2)) - 0.477) / 0.11;
  float terrainScale = 1.0 - smoothstep(7000.0, 26000.0, distanceToEye);
  float top = mix(360.0, 970.0, coverage) + (weather.g - 0.5) * 210.0;
  float edge = top + (rolls * 79.0 + billows * 30.0) * mix(0.4, 1.0, terrainScale) - altitude;
  if (edge < -40.0) return 0.0;

  if (terrainScale > 0.0) {
    vec3 detail = textureLod(detailNoise, point / 950.0 + vec3(0.13, 0.21, 0.39), 0.0).rgb;
    float erosion = dot(detail, vec3(0.55, 0.30, 0.15)) - 0.46;
    edge += erosion * 155.0 * terrainScale;
  }
  float base = smoothstep(cloudBase, cloudBase + 240.0, altitude);
  return smoothstep(-18.0, 160.0, edge) * base * mix(0.35, 1.0, coverage);
}

float firstIntersection(vec3 ray, float height) {
  float a = dot(ray.xz, ray.xz) / (2.0 * earthRadius);
  float c = cameraHeight - height;
  float discriminant = ray.y * ray.y - 4.0 * a * c;
  if (discriminant <= 0.0) return 1e7;
  return 2.0 * c / (-ray.y + sqrt(discriminant));
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec3 ray = normalize(vec3((uv.x - 0.5) * min(aspect, 2.15), (uv.y - 0.452) * 0.86, 1.0));
  cloud = vec4(0.0);
  if (ray.y >= -0.006) return;
  float start = firstIntersection(ray, cloudCeiling);
  float finish = min(firstIntersection(ray, cloudBase), 47000.0);
  if (finish <= start) return;

  vec3 origin = vec3(260.0, cameraHeight, -830.0);
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
  float minimumStep = max(12.0, (finish - start) / 112.0);
  float t = start;
  vec3 hazeColor = mix(skyMid, skyHorizon, clamp((1.0 - uv.y - 0.38) / 0.20, 0.0, 1.0));
  for (int i = 0; i < 112; ++i) {
    if (t >= finish) break;
    float stepLength = min(finish - t, max(minimumStep, t * 0.0026));
    vec3 point = origin + ray * (t + (0.30 + jitter * 0.40) * stepLength);
    t += stepLength;
    float fog = density(point, t);
    if (fog < 0.002) continue;
    float extinction = 1.0 - exp(-fog * stepLength * 0.019);
    float towardLight = density(point + toLight * 56.0, t) * 0.68
                      + density(point + toLight * 153.0, t) * 0.90
                      + density(point + toLight * 355.0, t) * 1.10;
    float lighting = 0.20 + 0.80 * exp(-towardLight * 1.7);
    vec2 projection = point.xz + toLight.xz * ((1365.0 + aircraftOffset.y - point.y) / toLight.y);
    vec2 shadowUV = (projection - aircraftCenter) / 880.0 + 0.5;
    if (all(greaterThan(shadowUV, vec2(0.0))) && all(lessThan(shadowUV, vec2(1.0)))) {
      float silhouette = textureLod(aircraftShadow, shadowUV, 0.0).r;
      lighting *= 1.0 - silhouette * mix(0.46, 0.33, night);
    }
    vec3 rgb = mix(shadowColor, lightColor, lighting);
    rgb = mix(rgb, hazeColor, 1.0 - exp(-t * 0.000095));
    scattering += transmittance * extinction * rgb;
    transmittance *= 1.0 - extinction;
    if (transmittance < 0.012) break;
  }

  float opacity = 1.0 - transmittance;
  float horizonFade = 1.0 - smoothstep(10500.0, 43000.0, start);
  // Keep cloud color weighted by opacity for canvas compositing.
  cloud = vec4(scattering, opacity) * horizonFade;
}
