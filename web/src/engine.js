// --------------------------------------------------------------- gl helpers
export function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) + "\n" + src.split("\n")
        .map((l, i) => (i + 1) + ": " + l).slice(0, 90).join("\n"));
    gl.attachShader(p, s);
  }
  // Every VAO here assumes slot 0 is position, 1 is colour or instance data,
  // 2 is the second instance stream or a UV. The linker is free to assign
  // otherwise, and silently did for the cab, so pin them by name.
  for (const [name, loc] of [
    ["aPos", 0], ["aGrid", 0], ["aCorner", 0],
    ["aCol", 1], ["aPosSize", 1], ["aPosRow", 1],
    ["aUv", 2], ["aRotHgtCls", 2], ["aAngN", 2], ["aNrm", 2], ["aBld", 3],
  ]) gl.bindAttribLocation(p, loc, name);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p));
  const u = {}, a = {};
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++) {
    const n = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, "");
    u[n] = gl.getUniformLocation(p, n);
  }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) {
    const n = gl.getActiveAttrib(p, i).name;
    a[n] = gl.getAttribLocation(p, n);
  }
  return { p, u, a };
}

export function texFromImage(gl, img, { filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE } = {}) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, img.width, img.height);
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, img.width, img.height, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(d.data.buffer));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return { tex: t, w: img.width, h: img.height, data: d.data };
}

export function gridMesh(gl, n, holeFrac = 0) {
  // an n x n quad grid in -1..1; holeFrac carves out the middle so that
  // nested rings tile the plane instead of overlapping.
  //
  // Neighbouring rings sample the heightmap at different spacings, so their
  // shared edge does not line up and daylight shows through the seam. Each
  // ring therefore carries a skirt: a copy of its boundary pushed straight
  // down, which plugs the gap without needing the grids to agree.
  const side = (n + 1) * (n + 1);
  const verts = new Float32Array((side + (n + 1) * 16) * 3);
  let k = 0;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      verts[k++] = (i / n) * 2 - 1;
      verts[k++] = (j / n) * 2 - 1;
      verts[k++] = 0;
    }
  const idx = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (holeFrac > 0) {
        const cx = Math.abs(((i + 0.5) / n) * 2 - 1);
        const cy = Math.abs(((j + 0.5) / n) * 2 - 1);
        if (cx < holeFrac && cy < holeFrac) continue;
      }
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }

  // skirts along the four outer edges, and around the hole if there is one
  let sk = side;
  const addSkirt = (getIdx, count) => {
    const base = sk;
    for (let i = 0; i <= count; i++) {
      const v = getIdx(i);
      verts[sk * 3] = verts[v * 3];
      verts[sk * 3 + 1] = verts[v * 3 + 1];
      verts[sk * 3 + 2] = 1;
      sk++;
    }
    for (let i = 0; i < count; i++) {
      const a = getIdx(i), b = getIdx(i + 1);
      idx.push(a, base + i, b, b, base + i, base + i + 1);
    }
  };
  addSkirt(i => i, n);                                   // south edge
  addSkirt(i => n * (n + 1) + i, n);                     // north edge
  addSkirt(i => i * (n + 1), n);                         // west edge
  addSkirt(i => i * (n + 1) + n, n);                     // east edge
  if (holeFrac > 0) {
    // and around the hole, or the finer ring inside shows a gap wherever it
    // happens to sit lower than this one
    const lo = Math.round((1 - holeFrac) / 2 * n), hi = n - lo;
    addSkirt(i => lo * (n + 1) + (lo + i), hi - lo);
    addSkirt(i => hi * (n + 1) + (lo + i), hi - lo);
    addSkirt(i => (lo + i) * (n + 1) + lo, hi - lo);
    addSkirt(i => (lo + i) * (n + 1) + hi, hi - lo);
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  const Arr = sk > 65535 ? Uint32Array : Uint16Array;
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Arr(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: idx.length, type: Arr === Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
}

// ------------------------------------------------------------------ matrices
export const M4 = {
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  },
  lookAt(eye, at, up) {
    const z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([
      x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
      -dot(x,eye), -dot(y,eye), -dot(z,eye), 1]);
  },
  /** column-major 4x4 times a vec4 */
  apply(m, v) {
    return [
      m[0]*v[0] + m[4]*v[1] + m[8]*v[2]  + m[12]*v[3],
      m[1]*v[0] + m[5]*v[1] + m[9]*v[2]  + m[13]*v[3],
      m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]*v[3],
      m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15]*v[3],
    ];
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  },
  invert(m) {
    const o = new Float32Array(16), inv = new Float64Array(16);
    inv[0]=m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
    inv[4]=-m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
    inv[8]=m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
    inv[12]=-m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
    inv[1]=-m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
    inv[5]=m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
    inv[9]=-m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
    inv[13]=m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
    inv[2]=m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
    inv[6]=-m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
    inv[10]=m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
    inv[14]=-m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
    inv[3]=-m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
    inv[7]=m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
    inv[11]=-m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
    inv[15]=m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
    let det = m[0]*inv[0]+m[1]*inv[4]+m[2]*inv[8]+m[3]*inv[12];
    if (!det) return o;
    det = 1 / det;
    for (let i = 0; i < 16; i++) o[i] = inv[i] * det;
    return o;
  },
};
export const sub = (a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const add = (a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const scale = (a,s)=>[a[0]*s,a[1]*s,a[2]*s];
export const dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const len = a=>Math.hypot(a[0],a[1],a[2]);
export const norm = a=>{const l=len(a)||1; return [a[0]/l,a[1]/l,a[2]/l];};
