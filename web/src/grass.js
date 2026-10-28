import { compile } from "./engine.js";
// Ground cover near the camera: grass tufts, with flowers in them in the
// growing season, crops in the fields (wheat, maize, sunflower), reeds in the wetland, ferns under the trees and pebbles on
// rough ground. The terrain is one colour a texel and looked bald close up
// (the owner: "like something was forgotten there").
//
// Nothing is baked and there is no instance buffer. Every instance is a cell
// of a grid round the camera (snapped, so the tufts stay put as it moves);
// GRASS_VS works out from the cell alone whether anything grows there and
// what, from the land cover (the same texture the terrain uses), and drops
// the rest. Past 28 m only one cell in four is kept, drawn bigger.
//
// What it must not grow on: roads, pavements, platforms, tracks, ditches.
// Those are drawn from above into a mask (GRASS_MASK_*) every few frames.
// The same pass draws the corridor (the ground beside the railway, which is
// its own mesh, not the terrain) with its HEIGHT and greenness packed into
// the mask, so the grass beside the line stands on the corridor and only
// where it is green, not on the ballast.

const GRASS_MASK_VS = `#version 300 es
in vec3 aPos; in vec3 aCol;
out float vH; out vec3 vCol;
uniform mat4 uVP;
void main(){ vH = aPos.y; vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
const GRASS_MASK_FS = `#version 300 es
precision highp float;
in float vH; in vec3 vCol; out vec4 fc;
uniform int uMode;      // 0: the corridor (height + greenness), 1: blocked
void main(){
  if (uMode == 1) { fc = vec4(1.0); return; }
  float v = clamp((vH - 50.0) * 50.0, 0.0, 65535.0);       // 2 cm steps from 50 m
  float green = clamp((vCol.g - max(vCol.r, vCol.b)) * 9.0, 0.0, 1.0);
  // farmland's colour (geom.js COVER_COL[4]) is not green, but plants grow on it
  float field = 1.0 - smoothstep(0.03, 0.06, distance(vCol, vec3(0.55, 0.51, 0.29)));
  fc = vec4(0.0, floor(v / 256.0) / 255.0, mod(v, 256.0) / 255.0, max(green, field));
}`;

const GRASS_VS = `#version 300 es
in vec3 aPos;                 // blade vertex: x across, y 0 (root) or 1 (tip), z along
out vec3 vCol; out float vDist; out float vTip;
uniform mat4 uVP; uniform vec3 uEye;
uniform vec2 uOrigin; uniform float uSpacing; uniform int uSide; uniform float uR;
uniform sampler2D uHeightNear, uHeightFar, uCover, uMask;
uniform vec2 uNearSize, uFarSize, uNearStep, uFarStep, uFarOffset;
uniform vec4 uMaskBox;        // centre x, z, size
uniform vec4 uSeason;         // leaf, autumn, fresh, crop
uniform float uTime, uSnow, uDay;   // uDay: day of the year, 1–365
uniform vec4 uCityBox;
float decode(vec3 c){ return (c.r*255.0*256.0 + c.g*255.0) * 0.1; }
float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sampleH(vec2 w){
  vec2 nuv = vec2(w.x, -w.y) / (uNearSize * uNearStep);
  if (nuv.x > 0.002 && nuv.x < 0.998 && nuv.y > 0.002 && nuv.y < 0.998)
    return decode(texture(uHeightNear, vec2(nuv.x, 1.0 - nuv.y)).rgb);
  vec2 fuv = (w + uFarOffset) / (uFarSize * uFarStep);
  return decode(texture(uHeightFar, vec2(clamp(fuv.x,0.0,1.0), 1.0 - clamp(fuv.y,0.0,1.0))).rgb);
}
void drop(){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); vDist = 0.0; vTip = 0.0; }
void main(){
  int n = uSide;
  vec2 cell = vec2(float(gl_InstanceID % n), float(gl_InstanceID / n)) - float(n) * 0.5;
  vec2 base = uOrigin + cell * uSpacing;
  float d = length(base - uEye.xz);
  // past 28 m, one cell in four, twice the size
  bool far = d > 28.0;
  ivec2 ic = ivec2(floor(base / uSpacing + 0.5));
  if (far && ((ic.x & 1) == 1 || (ic.y & 1) == 1)) { drop(); return; }
  if (d > uR) { drop(); return; }
  float r1 = gh(base * 0.731), r2 = gh(base * 1.37 + 4.1), r3 = gh(base * 0.29 + 9.7);
  vec2 w = base + (vec2(r1, r2) - 0.5) * uSpacing * (far ? 1.8 : 0.9);

  // the mask: blocked (roads etc.), or the corridor's own ground
  vec2 muv = (w - uMaskBox.xy) / uMaskBox.z + 0.5;
  vec4 mk = texture(uMask, muv);
  if (mk.r > 0.5) { drop(); return; }
  vec2 nuv = vec2(w.x, -w.y) / (uNearSize * uNearStep);
  if (nuv.x <= 0.0 || nuv.x >= 1.0 || nuv.y <= 0.0 || nuv.y >= 1.0) { drop(); return; }
  vec4 cc = texture(uCover, vec2(nuv.x, 1.0 - nuv.y));
  float cov = floor(cc.r * 255.0 + 0.5);
  float ground;
  float dens;
  bool corridor = cc.b * 255.0 < 86.0;
  if (corridor) {
    // the corridor mesh owns the ground here: its height from the mask, and
    // plants only where it is grass or field, not ballast or cess
    if (mk.a < 0.5) { drop(); return; }
    ground = (mk.g * 255.0 * 256.0 + mk.b * 255.0) / 50.0 + 50.0;
  } else ground = sampleH(w);
  dens = cov < 0.5 ? 0.9 : cov < 1.5 ? 0.35 : cov < 2.5 ? 0.7 : cov < 3.5 ? 1.0
       : cov < 4.5 ? 1.0 : cov < 5.5 ? 0.85 : cov < 6.5 ? 0.45 : cov < 7.5 ? 0.0
       : cov < 8.5 ? 0.15 : cov < 9.5 ? 0.0 : cov < 10.5 ? 0.25 : cov < 11.5 ? 1.0
       : cov < 12.5 ? 0.2 : cov < 13.5 ? 0.95 : cov < 14.5 ? 0.15 : 0.0;
  // residential: only the lawn plots (the same plots as TERRAIN_FS), and in
  // the city fewer, as it is mostly paved there
  if (cov > 6.5 && cov < 7.5) {
    vec2 plot = floor(w / vec2(14.0, 17.0));
    float h1 = fract(sin(dot(plot, vec2(127.1, 311.7))) * 43758.5453);
    bool inCity = w.x > uCityBox.x && w.x < uCityBox.z && -w.y > uCityBox.y && -w.y < uCityBox.w;
    dens = h1 < 0.45 ? (inCity ? 0.35 : 0.9) : 0.0;
  }

  // Farmland: what is standing in the field, by the day of the year (the
  // field's own tint, cover G, picks the crop the way TERRAIN_FS does and
  // moves each field's dates by up to ±8 days). Winter wheat: sown in
  // October, green all winter, tall in May, gold in late June, cut through
  // July (field by field), stubble in August, ploughed in September. One
  // field in four is maize or sunflower: sown in April, tallest in August,
  // cut in September and October.
  // crop: 0 nothing, 1 stubble, 2 wheat, 3 maize, 4 sunflower
  int crop = 0;
  float cropT = 0.0, ripe = 0.0;
  if (cov > 3.5 && cov < 4.5) {
    float ft = cc.g;
    float dd = uDay + (fract(ft * 6.1) - 0.5) * 16.0;
    float cutAt = fract(ft * 4.3);                    // when in the harvest window this field is cut
    if (fract(ft * 9.7) > 0.72) {
      bool sun = fract(ft * 3.7) > 0.6;
      float harvest = sun ? 255.0 + cutAt * 20.0 : 265.0 + cutAt * 30.0;
      if (dd > 112.0 && dd < harvest) {
        crop = sun ? 4 : 3;
        cropT = smoothstep(112.0, 205.0, dd);
        ripe = smoothstep(sun ? 225.0 : 235.0, harvest, dd);
      } else if (dd >= harvest && dd < 320.0) crop = 1;
      if (crop >= 3) {
        // rows 0.75 m apart, along the field's own direction
        float ra = fract(ft * 11.3) * 3.14159;
        vec2 across = vec2(-sin(ra), cos(ra));
        float o = dot(w, across);
        w -= across * (o - (floor(o / 0.75) + 0.5) * 0.75);
      }
    } else {
      float sowY = mod(dd + 365.0 - 290.0, 365.0);      // days since sowing (~17 Oct)
      float harvest = 182.0 + cutAt * 22.0;
      if (dd >= harvest && dd < 250.0) crop = 1;
      else if (dd >= 250.0 && dd < 290.0) crop = 0;     // ploughed
      else {
        crop = 2;
        // 0.05 m when it comes up, 0.15 m through the winter, 0.85 m by June
        cropT = sowY < 40.0 ? 0.05 + 0.10 * sowY / 40.0
              : sowY < 135.0 ? 0.15 : 0.15 + 0.70 * smoothstep(135.0, 225.0, sowY);
        ripe = smoothstep(152.0, 178.0, dd) * step(dd, 250.0);
      }
    }
    if (crop == 0) { drop(); return; }
  }
  if (r3 > dens) { drop(); return; }

  // what grows: 0 grass, 1 flowering, 2 reeds, 3 fern, 4 pebble
  float k = gh(base * 2.11 + 1.3);
  int kind = 0;
  if (cov > 10.5 && cov < 11.5 && k < 0.6) kind = 2;
  else if (cov > 0.5 && cov < 1.5) kind = k < 0.7 ? 3 : 0;
  else if ((cov < 0.5 || cov > 9.5 && cov < 10.5 || cov > 11.5 && cov < 12.5 || cov > 13.5) && k < 0.12) kind = 4;
  else if (k < 0.10 * clamp(uSeason.x * 1.4 - uSeason.y, 0.0, 1.0) && cov != 13.0) kind = 1;
  else if (cov > 12.5 && cov < 13.5 && k < 0.03) kind = 1;

  if (crop > 0) kind = 5;
  // the blade's shape
  float hgt = kind == 2 ? 1.3 : kind == 3 ? 0.55 : kind == 4 ? 0.10 : kind == 1 ? 0.45 : 0.32;
  if (crop == 1) hgt = 0.12;
  if (crop == 2) hgt = cropT;
  if (crop == 3) hgt = 2.3 * cropT;
  if (crop == 4) hgt = 1.8 * cropT;
  if (cov > 12.5 && cov < 13.5 && kind == 0) hgt = 0.14;   // a park is mown
  hgt *= kind == 5 ? 0.88 + 0.24 * gh(base * 3.3) : 0.7 + 0.6 * gh(base * 3.3);   // (a crop is even)
  float wid = kind == 3 ? 0.55 : kind == 4 ? 0.22 : kind == 2 ? 0.30 : 0.26;
  if (crop == 2) wid = 0.20;
  if (crop >= 3) wid = 0.50;
  float sz = far ? 1.7 : 1.0;
  float fade = smoothstep(uR, uR * 0.72, d);
  hgt *= fade * (1.0 - clamp(uSnow * 1.3, 0.0, 1.0));
  if (hgt < 0.02) { drop(); return; }
  float ang = crop == 4 ? 0.0 : r1 * 6.2832;
  float ca = cos(ang), sa = sin(ang);
  vec3 lp = vec3(aPos.x * wid * sz, aPos.y * hgt, aPos.z * wid * sz);
  if (kind == 3) lp.xz *= 1.0 + aPos.y * 0.8;               // fern fronds spread
  // a sunflower's first two blades are its head: a diamond 0.4 m across on
  // top of the stalk, facing east (as they do), from July
  bool head = crop == 4 && gl_VertexID / 3 < 2 && uDay > 185.0;
  if (head) {
    int vi = gl_VertexID % 3;
    float up = gl_VertexID / 3 == 0 ? 1.0 : -1.0;
    lp = vi == 0 ? vec3(0.0, hgt, -0.2) : vi == 1 ? vec3(0.0, hgt, 0.2) : vec3(0.05, hgt + up * 0.2, 0.0);
  }
  vec3 p = vec3(w.x + ca * lp.x - sa * lp.z, ground - 0.06 + lp.y, w.y + sa * lp.x + ca * lp.z);
  // wind
  float sway = sin(uTime * 1.6 + w.x * 0.35 + w.y * 0.21) * 0.5 + sin(uTime * 2.7 + w.x * 0.9) * 0.25;
  p.xz += vec2(0.7, 0.4) * sway * (head ? 1.0 : aPos.y) * min(hgt, 1.0) * (kind == 4 ? 0.0 : 0.35);

  // colour, with the seasons as the terrain has them
  float leaf = uSeason.x, aut = uSeason.y, fresh = uSeason.z;
  vec3 green = mix(vec3(0.27, 0.40, 0.15), vec3(0.36, 0.50, 0.19), gh(base * 5.1));
  green = mix(green, vec3(0.36, 0.53, 0.18), fresh * 0.6);
  vec3 straw = vec3(0.56, 0.50, 0.30);
  vec3 col = mix(straw, green, clamp(leaf * 1.2 - aut * 0.6, 0.0, 1.0));
  col = mix(col, vec3(0.45, 0.41, 0.30), (1.0 - leaf) * 0.5);
  if (kind == 2) col = mix(vec3(0.42, 0.44, 0.24), vec3(0.62, 0.55, 0.36), aut + (1.0 - leaf) * 0.6);
  if (kind == 3) col = mix(vec3(0.17, 0.30, 0.11), vec3(0.50, 0.33, 0.14), aut * 0.8 + (1.0 - leaf) * 0.5);
  if (kind == 4) col = vec3(0.52, 0.50, 0.46) * (0.8 + 0.3 * gh(base * 7.7));
  if (crop == 1) col = vec3(0.76, 0.70, 0.50);                                      // stubble, paler than the soil
  if (crop == 2) col = mix(vec3(0.30, 0.47, 0.17), vec3(0.80, 0.66, 0.26), ripe);  // wheat, green to ripe
  if (crop >= 3) col = mix(vec3(0.24, 0.42, 0.14), vec3(0.62, 0.55, 0.36), ripe); // maize, sunflower leaves
  // sunflower heads: two blades of each plant, yellow in July and August,
  // brown as they ripen
  if (head) col = mix(vec3(0.95, 0.74, 0.08), vec3(0.32, 0.24, 0.12), smoothstep(225.0, 245.0, uDay));
  // a flowering tuft: three of its seven blades are stems with a flower
  if (kind == 1 && aPos.y > 0.5 && gl_VertexID / 3 < 3) {
    float f = gh(base * 9.1);
    col = f < 0.30 ? vec3(0.92, 0.90, 0.84)                 // daisy, yarrow
        : f < 0.55 ? vec3(0.92, 0.78, 0.18)                 // buttercup, dandelion
        : f < 0.78 ? vec3(0.55, 0.42, 0.78)                 // knapweed, sage
        : vec3(0.82, 0.16, 0.12);                           // poppy
  }
  vCol = col * (0.85 + 0.3 * gh(base * 4.4));
  vTip = head ? 1.0 : aPos.y;
  vDist = length(p - uEye);
  gl_Position = uVP * vec4(p, 1.0);
}`;
const GRASS_FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vDist; in float vTip; out vec4 fc;
uniform vec3 uSunDir, uSunCol, uSkyCol, uFogCol;
uniform float uFogDensity, uLift, uWet;
void main(){
  // dark at the root (the tufts shade their own bases), lit at the tip
  float ao = mix(0.50, 1.0, vTip);
  vec3 c = vCol * mix(1.0, 0.65, uWet);
  vec3 col = c * (uSunCol * max(uSunDir.y, 0.0) * 0.80 * ao + uSkyCol * (0.50 + uLift * 0.38) * ao + 0.05 + uLift * 0.08);
  float f = 1.0 - exp(-vDist * uFogDensity);
  fc = vec4(mix(col, uFogCol, clamp(f, 0.0, 1.0)), 1.0);
}`;

export class Grass {
  constructor(gl) {
    this.gl = gl;
    this.prog = compile(gl, GRASS_VS, GRASS_FS);
    this.maskProg = compile(gl, GRASS_MASK_VS, GRASS_MASK_FS);
    // one tuft: seven blades, each a triangle, at its own angle and lean
    const v = [];
    for (let b = 0; b < 7; b++) {
      const a = b * 2.39996, ca = Math.cos(a), sa = Math.sin(a);
      const r = 0.15 + 0.85 * ((b * 0.618) % 1);        // root off the centre
      const lean = 0.35 + 0.4 * ((b * 0.382) % 1);
      const ox = ca * r * 0.5, oz = sa * r * 0.5;
      const px = -sa * 0.18, pz = ca * 0.18;              // half the blade's width
      v.push(ox - px, 0, oz - pz,  ox + px, 0, oz + pz,  ox + ca * lean, 1, oz + sa * lean);
    }
    this.vcount = v.length / 3;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    // the mask: 512² over the grass's reach (180 m at 70 m), nearest sampling
    this.MS = 512; this.box = [0, 0, 180];
    this.maskTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.MS, this.MS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
                            [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, k, val);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.maskTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.frame = 0; this.last = null;
  }

  /** Redraw the mask round (cx, cz) (world x, z) when the camera has moved
   *  10 m, or every 20 frames (tiles come and go). corridor: one VAO;
   *  blocked: a list of VAOs ({vao, count}) drawn as "nothing grows here". */
  updateMask(cx, cz, corridor, blocked, R = 70) {
    const gl = this.gl;
    this.frame++;
    const snap = 10, bx = Math.round(cx / snap) * snap, bz = Math.round(cz / snap) * snap;
    // the mask spans the grass's reach and the 10 m snap, both sides
    const S = 2 * R + 40;
    if (this.last && this.last[0] === bx && this.last[1] === bz && this.last[2] === S && this.frame % 20) return;
    this.last = [bx, bz, S];
    this.box = [bx, bz, S];
    // top-down: world x → clip x, world z → clip y, height out of the way
    const k = 2 / S;
    const vp = new Float32Array([k, 0, 0, 0,  0, 0, 0, 0,  0, k, 0, 0,  -bx * k, -bz * k, 0, 1]);
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING), prevVp = gl.getParameter(gl.VIEWPORT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.MS, this.MS);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.maskProg.p);
    gl.uniformMatrix4fv(this.maskProg.u.uVP, false, vp);
    gl.uniform1i(this.maskProg.u.uMode, 0);
    if (corridor && corridor.count) { gl.bindVertexArray(corridor.vao); gl.drawArrays(gl.TRIANGLES, 0, corridor.count); }
    gl.uniform1i(this.maskProg.u.uMode, 1);
    gl.colorMask(true, false, false, false);
    for (const m of blocked) if (m && m.count) { gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.count); }
    gl.colorMask(true, true, true, true);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(prevVp[0], prevVp[1], prevVp[2], prevVp[3]);
    gl.enable(gl.DEPTH_TEST);
  }

  /** Draw. t: the terrain's textures and sizes; u: frame uniforms. */
  draw(vp, eye, R, t, u) {
    const gl = this.gl, p = this.prog, U = p.u;
    const spacing = 0.55, side = Math.ceil(2 * R / spacing) + 2;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(U.uVP, false, vp);
    gl.uniform3fv(U.uEye, eye);
    gl.uniform2f(U.uOrigin, Math.round(eye[0] / (2 * spacing)) * 2 * spacing, Math.round(eye[2] / (2 * spacing)) * 2 * spacing);
    gl.uniform1f(U.uSpacing, spacing);
    gl.uniform1i(U.uSide, side);
    gl.uniform1f(U.uR, R);
    gl.uniform2f(U.uNearSize, t.nearW, t.nearH);
    gl.uniform2f(U.uFarSize, t.farW, t.farH);
    gl.uniform2f(U.uNearStep, t.nearStep, t.nearStep);
    gl.uniform2f(U.uFarStep, t.farStep, t.farStep);
    gl.uniform2f(U.uFarOffset, t.farOffset[0], t.farOffset[1]);
    gl.uniform4f(U.uMaskBox, this.box[0], this.box[1], this.box[2], 0);
    gl.uniform4fv(U.uSeason, u.season);
    gl.uniform4fv(U.uCityBox, u.cityBox);
    gl.uniform1f(U.uTime, u.time);
    gl.uniform1f(U.uSnow, u.snow);
    gl.uniform1f(U.uDay, ((u.day - 1) % 365 + 365) % 365 + 1);
    gl.uniform3fv(U.uSunDir, u.sunDir);
    gl.uniform3fv(U.uSunCol, u.sunCol);
    gl.uniform3fv(U.uSkyCol, u.skyCol);
    gl.uniform3fv(U.uFogCol, u.fogCol);
    gl.uniform1f(U.uFogDensity, u.fog);
    gl.uniform1f(U.uLift, u.lift);
    gl.uniform1f(U.uWet, u.wet);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.near); gl.uniform1i(U.uHeightNear, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.far); gl.uniform1i(U.uHeightFar, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, t.cover); gl.uniform1i(U.uCover, 2);
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, this.maskTex); gl.uniform1i(U.uMask, 8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vcount, side * side);
    gl.bindVertexArray(null);
  }
}
