const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const ramp = (t) => smooth(Math.max(0, Math.min(t, 1)));

function hash(x, y) {
  const bits = Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801);
  return (Math.imul(bits ^ (bits >>> 16), 0x45d9f3b) >>> 0) / 4294967296;
}

function noise(x, y) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = smooth(x - i);
  const v = smooth(y - j);
  return mix(mix(hash(i, j), hash(i + 1, j), u), mix(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}

export function startContrails(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const image = ctx.createImageData(canvas.width, canvas.height);
  let lastFrame = 0;
  paintContrails(ctx, image, 0);

  return (seconds) => {
    if (seconds === null || seconds - lastFrame < 1 / 30) return;
    lastFrame = seconds;
    paintContrails(ctx, image, seconds);
  };
}

function paintContrails(ctx, image, seconds) {
  const { width, height, data } = image;
  data.fill(0);
  // Aft outlet centres projected through the bake camera, far engine first.
  for (const [nozzleX, nozzleY, seed, strength, descent, slope] of [
    [604.6, 292.3, 23, .72, 7, -.0075],
    [538.5, 306.8, 71, 1, 21, -.0106],
  ]) {
    for (let x = 1; x < nozzleX; x++) {
      const age = nozzleX - x;
      const spread = Math.min(age / 470, 1);
      const radius = 1.7 + 10 * spread ** .85;
      const density = strength * ramp((age - 12) / 38) * ramp((x - 12) / 175) * (1 - .65 * spread);
      if (!density) continue;

      // Sample by emission position so each puff moves aft while widening and fading with age.
      const wake = age - seconds * 178;
      const centre = nozzleY - 256 + age * slope + descent * spread ** 1.35
        + radius * (noise(wake / 46, seed) - .5) * ramp(age / 85);
      const firstRow = Math.max(0, Math.floor(centre - 3 * radius));
      const lastRow = Math.min(height - 1, Math.ceil(centre + 3 * radius));
      for (let y = firstRow; y <= lastRow; y++) {
        const across = (y - centre) / radius;
        const folds = noise(wake / 18, across * 1.5 + seed);
        const wisps = noise(wake / 6, across * 3 + seed);
        const edge = across + (folds - .5) * .92 + (wisps - .5) * .38;
        const body = Math.exp(-1.3 * edge * edge);
        const curl = Math.exp(-5 * (edge - .94) ** 2) * spread * (.11 + .28 * folds);
        const alpha = Math.min(.94, density * (body + curl) * (.37 + .56 * folds + .34 * wisps));
        const light = ramp(.58 - .26 * edge + .48 * (folds - .5));

        const pixel = 4 * (y * width + x);
        const behind = data[pixel + 3] / 255 * (1 - alpha);
        const combined = alpha + behind;
        if (combined < 1 / 255) continue;
        const foreground = alpha / combined;
        data[pixel] = mix(data[pixel], mix(154, 246, light), foreground);
        data[pixel + 1] = mix(data[pixel + 1], mix(161, 240, light), foreground);
        data[pixel + 2] = mix(data[pixel + 2], mix(181, 243, light), foreground);
        data[pixel + 3] = combined * 255;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
}
