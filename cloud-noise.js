const textures = [
  { name: "shapeNoise", file: "shape64.bin", size: 64, channels: 4, volume: true },
  { name: "detailNoise", file: "detail32-rgb.bin", size: 32, channels: 3, volume: true },
  { name: "weatherNoise", file: "weather512-rg.bin", size: 512, channels: 2, volume: false },
];

export const cloudNoiseUniforms = textures.map(({ name }) => name);

let loading;
export function loadCloudNoise() {
  loading ??= Promise.all(textures.map(async ({ file, size, channels, volume }) => {
    const response = await fetch(new URL(`data/noise/${file}`, import.meta.url));
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    const pixels = new Uint8Array(await response.arrayBuffer());
    if (pixels.length !== size ** (volume ? 3 : 2) * channels) {
      throw new Error(`Invalid size for ${file}`);
    }
    return pixels;
  })).catch(error => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export function bindCloudNoise(gl, pixels) {
  const formats = [null, null, [gl.RG8, gl.RG], [gl.RGB8, gl.RGB], [gl.RGBA8, gl.RGBA]];
  textures.forEach(({ size, channels, volume }, unit) => {
    const target = volume ? gl.TEXTURE_3D : gl.TEXTURE_2D;
    const [internalFormat, format] = formats[channels];
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, gl.createTexture());
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (volume) {
      gl.texImage3D(target, 0, internalFormat, size, size, size, 0, format, gl.UNSIGNED_BYTE, pixels[unit]);
    } else {
      gl.texImage2D(target, 0, internalFormat, size, size, 0, format, gl.UNSIGNED_BYTE, pixels[unit]);
    }
  });
}
