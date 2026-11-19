// Window trim from porthole-3d-mac/source/CabinMesh.swift. Each section carries
// its original half-width, half-height, depth, material ID and light exposure.
const sections = [
  [.535,.756,.320,0,.25], [.543,.768,.300,0,.42],
  [.552,.781,.270,1,.78], [.563,.799,.190,1,1], [.580,.823,.080,1,1],
  [.598,.846,-.034,1,.94], [.615,.866,-.085,1,.81], [.640,.900,-.097,1,.68],
  [.656,.920,-.087,2,.41], [.662,.930,-.066,0,.25], [.670,.940,-.075,2,.38],
  // The final return tapers into the page. The surrounding fuselage is omitted.
];

function difference(a, b) {
  return a.map((value, i) => value - b[i]);
}

function normal(a, b) {
  const cross = [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
  const length = Math.hypot(...cross);
  return cross.map(value => value / length);
}

function shadePosition(row, column) {
  const x = (column / 64 - .5) * 1.28;
  const t = row / 22;
  const h = t * (.23 + 1.44 * t);
  const grip = Math.exp(-((Math.abs(x)/.136)**6) - ((h-.053)/.025)**2);
  return [x, .690 + h + .011*x*x, .375 + .036*(x/.64)**2 + .022*grip + .019*Math.exp(-h*160)];
}

export function createCabinMesh() {
  const vertices = [];
  const indices = [];
  const segments = 128;
  const rings = sections.map(([width, height, depth]) =>
    Array.from({length: segments}, (_, i) => {
      const angle = i * 2 * Math.PI / segments;
      const c = Math.cos(angle), s = Math.sin(angle);
      const x = Math.sign(c) * Math.abs(c)**.69 * width * (1 - .032*s);
      const y = Math.sign(s) * Math.abs(s)**.75 * height;
      return [x, y, depth + .025*y];
    })
  );
  rings.forEach((ring, row) => {
    for (let col = 0; col < segments; col++) {
      const next = (col + 1) % segments;
      const tangent = difference(ring[next], ring[(col + segments - 1) % segments]);
      const across = difference(rings[Math.min(row+1,rings.length-1)][col], rings[Math.max(0,row-1)][col]);
      vertices.push(...ring[col], ...normal(tangent,across), sections[row][3], sections[row][4], sections[row][0], 0);
      if (row + 1 < rings.length) {
        const a = row*segments + col, b = row*segments + next;
        indices.push(a, b, a+segments, a+segments, b, b+segments);
      }
    }
  });

  const offset = vertices.length / 10;
  const trimIndexCount = indices.length;
  for (let row = 0; row <= 22; row++) {
    for (let col = 0; col <= 64; col++) {
      const p = shadePosition(row, col);
      const vertical = difference(shadePosition(row+1,col), shadePosition(row-1,col));
      const horizontal = difference(shadePosition(row,col+1), shadePosition(row,col-1));
      vertices.push(...p, ...normal(vertical,horizontal), 4, 1, p[0], p[1]-.690);
      if (row < 22 && col < 64) {
        const a = offset + row*65 + col;
        indices.push(a, a+1, a+65, a+65, a+1, a+66);
      }
    }
  }
  return {vertices: new Float32Array(vertices), indices: new Uint16Array(indices), apertureCount: segments, trimIndexCount};
}
