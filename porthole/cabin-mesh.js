// Window trim from porthole-3d-mac/source/CabinMesh.swift. Each section carries
// its original half-width, half-height, depth, material ID and light exposure.
const sections = [
  [.535,.756,.320,0,.25], [.543,.768,.300,0,.42],
  [.552,.781,.270,1,.78], [.563,.799,.190,1,1],
  // A small return at the joint between the light inner liner and the outer molding.
  [.574,.815,.110,1,1], [.576,.818,.100,1,1], [.578,.821,.105,2,.86],
  [.580,.823,.080,2,1],
  [.598,.846,-.034,1,.94], [.615,.866,-.085,1,.81], [.640,.900,-.097,1,.68],
  [.656,.920,-.087,2,.41], [.662,.930,-.066,0,.25], [.670,.940,-.075,2,.38],
  // Beyond the gasket, the recessed fuselage panel rolls back into the cabin wall.
  [.677,.949,-.068,3,.5], [.690,.964,-.078,3,.7], [.723,1.005,-.068,3,.8],
  [.781,1.082,-.032,3,.9], [.862,1.193,.042,3,1], [1.02,1.394,.090,3,1],
];

function difference(a, b) {
  return a.map((value, i) => value - b[i]);
}

function normal(a, b) {
  const cross = [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
  const length = Math.hypot(...cross);
  return cross.map(value => value / length);
}

// Closely spaced cross sections resolve the rounded hem and finger pull.
const shadeSections = [
  [0, .027], [.001, .018], [.0035, .008], [.008, .002], [.014, 0],
  ...Array.from({length:32}, (_, i) => [.020 + .0035*i, 0]),
  ...Array.from({length:26}, (_, i) => [.14 + .062*i, 0]),
];
const shadeColumns = 96;
function shadeVertex(row, col) {
  const [h, hemDepth] = shadeSections[row];
  const x = (col/shadeColumns - .5)*1.28;
  const across = x/.64;
  const distance = Math.hypot(Math.max(0,Math.abs(x)-.085), (h-.068)*1.12);
  const t = Math.max(0,Math.min(1,(.033-distance)/.025));
  const grip = t*t*(3-2*t);
  const y = .690 + h + .036*across*across;
  const z = .360 + .053*across*across + .027*grip + hemDepth;
  return [x,y,z,grip,h];
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
  const rows = shadeSections.length;
  const stride = shadeColumns + 1;
  const shadeRows = shadeSections.map((_,row) =>
    Array.from({length:stride}, (_,col) => shadeVertex(row,col)));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < stride; col++) {
      const [x,y,z,grip,h] = shadeRows[row][col];
      const vertical = difference(shadeRows[Math.min(row+1,rows-1)][col], shadeRows[Math.max(row-1,0)][col]);
      const horizontal = difference(shadeRows[row][Math.min(col+1,shadeColumns)], shadeRows[row][Math.max(col-1,0)]);
      vertices.push(x,y,z, ...normal(vertical,horizontal), 4,grip,x,h);
      if (row+1 < rows && col < shadeColumns) {
        const a = offset + row*stride + col;
        indices.push(a, a+1, a+stride, a+stride, a+1, a+stride+1);
      }
    }
  }
  return {vertices: new Float32Array(vertices), indices: new Uint16Array(indices), apertureCount: segments, trimIndexCount};
}
