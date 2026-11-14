// Ice Patrol's view out of the canopy, in WebGL (SPEC §10.34): the snowfield,
// the sky, the falling snow, the wingmen and the far lights. The cockpit is a
// 2D canvas on top (ice-cockpit.js).
//
// The ground is a stack of square grids centred on the pilot, each twice as
// coarse as the one inside it, so there are metres between vertices
// underfoot and most of a kilometre at the horizon. Every vertex reads its
// height from the two noise textures with the formula IceLogic.terrain uses,
// and every pixel reads the slopes from the same textures for its light, so
// the far mountains keep their creases however coarse their grid is. Where
// two grids meet, the finer one's vertices slide onto the coarser one's
// (and its texture reads blur to match), which closes the seam.
//
// Everything the camera sees is relative to the camera: the world's own
// coordinates only ever exist in JavaScript's doubles, so an endless flight
// never runs the shaders out of precision.

const ICE_GLSL = {
    head: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`,

    // The fields, as the textures hold them: height in RG, slopes in BA.
    fields: shape => `
#define MTN ${shape.mountain.toFixed(1)}
#define GULLY ${shape.gully.toFixed(1)}
#define CUT ${shape.cut.toFixed(3)}
#define HILL ${shape.hill.toFixed(1)}
#define ROLL ${shape.roll.toFixed(1)}
#define DRIFT ${shape.drift.toFixed(2)}
#define M0 ${shape.m0.toFixed(3)}
#define M1 ${shape.m1.toFixed(3)}
#define K0 ${shape.k0.toFixed(3)}
#define K1 ${shape.k1.toFixed(3)}
uniform sampler2D uA, uB;
uniform vec4 uLayM[9];   // each layer's world-to-tile matrix (u = xy . p, v = zw . p)
uniform vec2 uLayO[9];   // and where the camera sits in its tile
vec2 uvOf(vec4 m, vec2 o, vec2 p) { return vec2(dot(m.xy, p), dot(m.zw, p)) + o; }
float hOf(vec4 t) { return dot(t.rg, vec2(0.99610895, 0.00389105)); }
`,

    // The sky without its lamps: also the colour distance fades to.
    sky: `
uniform vec3 uZenith, uHorizon, uGlow, uSunDir;
vec3 atmosphere(vec3 d) {
    float h = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, 1.0 - pow(1.0 - h, 3.4));
    vec2 dxz = d.xz / max(length(d.xz), 1e-4), sxz = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
    float toward = max(dot(dxz, sxz), 0.0), sd = max(dot(d, uSunDir), 0.0);
    c += uGlow * (pow(1.0 - h, 7.0) * (0.22 + 0.78 * toward * toward * toward) * 0.6 + pow(sd, 22.0) * 0.32);
    return c;
}
vec3 tone(vec3 c, vec2 px) {
    c = pow(1.0 - exp(-c), vec3(0.4545));
    return c + (fract(sin(dot(px, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;   // dither: no bands in the dusk
}
`,
};

const ICE_SHADERS = {
    terrainVS: shape => `
precision highp float;
attribute vec2 aGrid;
uniform mat4 uVP;
uniform vec2 uOrigin;      // this grid's centre, from the camera
uniform float uCell, uHalf, uCamY;
uniform float uLod[6];     // each layer's mip at this grid's spacing (below zero: finer than its texels)
varying vec3 vRel;
${ICE_GLSL.fields(shape)}
#define TAP(s, i) hOf(texture2DLod(s, uvOf(uLayM[i], uLayO[i], p), max(uLod[i] + k, 0.0)))
void main() {
    // Towards the rim, odd vertices slide onto their even neighbours and
    // the reads blur one mip: by the edge this grid is the next one out.
    float k = smoothstep(0.70, 0.94, max(abs(aGrid.x), abs(aGrid.y)) / uHalf);
    vec2 g = aGrid - fract(aGrid * 0.5) * 2.0 * k;
    vec2 p = uOrigin + g * uCell;
    float a0 = TAP(uA, 0);
    float m = smoothstep(M0, M1, a0), kk = 0.3 + 0.7 * smoothstep(K0, K1, a0);
    float h = m * (MTN * TAP(uB, 1) + GULLY * (TAP(uB, 5) - CUT)) + HILL * kk * (TAP(uA, 2) - 0.5) + ROLL * (TAP(uA, 3) - 0.5) + DRIFT * (TAP(uA, 4) - 0.5);
    vRel = vec3(p.x, h - uCamY, p.y);
    gl_Position = uVP * vec4(vRel, 1.0);
}`,

    terrainFS: (shape, steps) => `
${ICE_GLSL.head}
#define SHADOW_STEPS ${steps}
varying vec3 vRel;
uniform vec3 uHole;        // the finer grid inside this one: centre and half-width
uniform vec2 uGmax;
uniform sampler2D uBS;     // the ridged field's slopes, 16 bits each
uniform vec3 uLightDir, uLight, uFill, uAim, uLamp;
uniform float uFog, uFar, uCamY, uShadow, uCloudShade, uSparkle;
uniform vec2 uCellOff;
${ICE_GLSL.fields(shape)}
${ICE_GLSL.sky}
// A layer's value and its slope in world x and z.
#define LAY(s, i, g) lay(s, uLayM[i], uLayO[i], g, p)
vec3 lay(sampler2D s, vec4 m, vec2 o, float gmax, vec2 p) {
    vec4 t = texture2D(s, uvOf(m, o, p));
    vec2 g = (t.ba * 2.0 - 1.0) * gmax;
    return vec3(hOf(t), g.x * m.x + g.y * m.z, g.x * m.y + g.y * m.w);
}
#define RIDGE(i) ridge(uLayM[i], uLayO[i], p)
// The ridged field: its slopes come from their own 16-bit texture.
vec3 ridge(vec4 m, vec2 o, vec2 p) {
    vec2 uv = uvOf(m, o, p);
    vec4 s = texture2D(uBS, uv);
    vec2 g = (vec2(dot(s.rg, vec2(0.99610895, 0.00389105)), dot(s.ba, vec2(0.99610895, 0.00389105))) * 2.0 - 1.0) * uGmax.y;
    return vec3(hOf(texture2D(uB, uv)), g.x * m.x + g.y * m.z, g.x * m.y + g.y * m.w);
}
#if SHADOW_STEPS > 0
// The big shapes only, from blurred reads: what casts a shadow worth drawing.
float bulk(vec2 p) {
    float a0 = hOf(texture2D(uA, uvOf(uLayM[0], uLayO[0], p), 1.0));
    float m = smoothstep(M0, M1, a0), kk = 0.3 + 0.7 * smoothstep(K0, K1, a0);
    return MTN * m * hOf(texture2D(uB, uvOf(uLayM[1], uLayO[1], p), 1.5)) + HILL * kk * (hOf(texture2D(uA, uvOf(uLayM[2], uLayO[2], p), 1.5)) - 0.5);
}
// A face the light only grazes would shadow itself in a lattice (the
// blurred field is flat between its texels), so the march starts a little
// way out along the slope's normal, its first steps are forgiving, and the
// caller lets go of it where the light is nearly edge-on anyway.
float shadow(vec2 p, vec3 face) {
    p += face.xz * 20.0;
    float base = bulk(p) + 6.0 + 6.0 * face.y, lit = 1.0, t = 40.0;
    for (int i = 0; i < SHADOW_STEPS; i++) {
        float clear = base + uLightDir.y * t - bulk(p + uLightDir.xz * t);
        lit = min(lit, 0.5 + clear / (t * 0.1 + 34.0));
        t *= ${steps > 7 ? '1.85' : '2.5'};
    }
    return clamp(lit, 0.0, 1.0);
}
#endif
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
    vec2 p = vRel.xz, off = abs(p - uHole.xy);
    if (max(off.x, off.y) < uHole.z) discard;
    vec3 l0 = LAY(uA, 0, uGmax.x), l1 = RIDGE(1), l2 = LAY(uA, 2, uGmax.x), l3 = LAY(uA, 3, uGmax.x), l4 = LAY(uA, 4, uGmax.x);
    vec3 lg = RIDGE(5), l5 = RIDGE(6), l6 = LAY(uA, 7, uGmax.x);
    float t0 = clamp((l0.x - M0) / (M1 - M0), 0.0, 1.0), m = t0 * t0 * (3.0 - 2.0 * t0), dm = 6.0 * t0 * (1.0 - t0) / (M1 - M0);
    float t1 = clamp((l0.x - K0) / (K1 - K0), 0.0, 1.0), kk = 0.3 + 0.7 * t1 * t1 * (3.0 - 2.0 * t1), dk = 4.2 * t1 * (1.0 - t1) / (K1 - K0);
    vec2 big = m * (MTN * l1.yz + GULLY * lg.yz) + (MTN * l1.x + GULLY * (lg.x - CUT)) * dm * l0.yz + HILL * (kk * l2.yz + (l2.x - 0.5) * dk * l0.yz) + ROLL * l3.yz;
    float dist = length(vRel), steep = length(big);
    vec3 toEye = -vRel / dist;
    // Rock where it is too steep for snow to hold; blue ice where the wind has scoured the flats.
    // Its edge is ragged: broadly everywhere, finely only close by (small tiles repeat, and from afar that shows).
    float rock = smoothstep(0.92, 1.3, steep + (l3.x - 0.5) * 0.7 + (l4.x - 0.5) * 0.4 * exp(-dist / 500.0) + (l6.x - 0.5) * 0.3 * exp(-dist / 90.0));
    // Drifts, wind-carved ridges (on snow only) and grain: light, not geometry.
    // They are small tiles, so they fade with distance before they can be seen to repeat.
    vec2 grad = big + DRIFT * l4.yz * exp(-dist / 1500.0) + (0.16 * l5.yz * (1.0 - rock) + 0.07 * l6.yz) * exp(-dist / 280.0);
    vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
    float ice = smoothstep(0.665, 0.75, l3.x) * (1.0 - smoothstep(0.08, 0.26, steep)) * 0.75;
    vec3 stone = mix(vec3(0.06, 0.062, 0.072), vec3(0.17, 0.155, 0.15), mix(l3.x, l6.x, exp(-dist / 90.0))) * (0.72 + 0.6 * lg.x) + 0.03 * sin((vRel.y + uCamY) * 0.13 + l4.x * 7.0) * exp(-dist / 900.0);
    vec3 albedo = mix(vec3(0.90, 0.925, 0.96) * (0.93 + 0.07 * l3.x), vec3(0.42, 0.62, 0.74), ice);
    albedo = mix(albedo, stone, rock);

    float ndl = max((dot(n, uLightDir) + 0.06) / 1.06, 0.0), lit = 1.0;
#if SHADOW_STEPS > 0
    if (uShadow > 0.0) {
        vec3 face = normalize(vec3(-big.x, 1.0, -big.y));
        lit = mix(1.0, shadow(p, face), uShadow * smoothstep(0.02, 0.3, dot(face, uLightDir)));
    }
#endif
    // Cloud shadows crossing the open snow.
    lit *= 1.0 - uCloudShade * smoothstep(0.5, 0.72, hOf(texture2D(uA, uvOf(uLayM[8], uLayO[8], p))));
    // Sky light from above, and the bright horizon under the sun lighting the slopes that face it.
    vec2 sunward = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
    vec3 col = albedo * (uLight * ndl * lit + uFill * (0.55 + 0.45 * n.y) + (uHorizon + uGlow) * 0.16 * max(dot(n.xz, sunward) + 0.15, 0.0));
    // Sheen off the crust (more off the ice), and the glitter of single crystals close by.
    vec3 hv = normalize(uLightDir + toEye);
    float gloss = max(dot(n, hv), 0.0), wet = (1.0 - rock) * lit;
    col += uLight * wet * (pow(gloss, 48.0) * 0.16 + ice * pow(gloss, 220.0) * 1.6);
    if (uSparkle > 0.0 && dist < 150.0) {
        vec2 cell = floor((p + uCellOff) * 7.0);
        float h = hash(cell), flick = fract(h * 91.7 + dot(toEye, vec3(13.0, 7.0, 17.0)) * 3.0);
        col += uLight * step(0.965, h) * pow(max(0.0, 1.0 - abs(flick - 0.5) * 9.0), 2.0) * wet * ndl * (1.0 - dist / 150.0) * uSparkle;
    }
    // The landing lamps: a soft pool thrown ahead and a little down.
    float beam = max(dot(-toEye, uAim), 0.0);
    col += albedo * uLamp * (pow(beam, 14.0) * 0.5 + pow(beam, 90.0)) * (0.35 + 0.65 * max(dot(n, toEye), 0.0)) / (1.0 + dist * dist / 12000.0);

    float fog = 1.0 - exp(-dist * uFog);
    fog = max(fog, smoothstep(0.72, 0.98, dist / uFar));
    vec3 dir = -toEye;
    col = mix(col, atmosphere(normalize(vec3(dir.x, max(dir.y, 0.0) * 0.5, dir.z))), fog);
    gl_FragColor = vec4(tone(col, gl_FragCoord.xy), 1.0);
}`,

    skyVS: `
attribute vec2 aPos;
uniform vec3 uRight, uUp, uFwd;
uniform vec2 uTan;
varying vec3 vDir;
void main() {
    vDir = uFwd + uRight * aPos.x * uTan.x + uUp * aPos.y * uTan.y;
    gl_Position = vec4(aPos, 0.99999, 1.0);
}`,

    skyFS: `
${ICE_GLSL.head}
varying vec3 vDir;
uniform sampler2D uA;
uniform vec3 uSunCol, uFill, uMoon[2], uMoonCol, uCloud;   // uCloud: threshold, softness, drift
uniform vec2 uCloudOff, uMoonSize;
uniform float uStars, uAurora, uTime, uHalo, uSunLit, uFog;
${ICE_GLSL.sky}
float hOf(vec4 t) { return dot(t.rg, vec2(0.99610895, 0.00389105)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// A moon: a lit ball, so its phase is whatever the sun makes it.
vec4 moon(vec3 d, vec3 at, float size, float seed) {
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), at)), up = cross(at, right);
    vec2 q = vec2(dot(d, right), dot(d, up)) / size;
    float r2 = dot(q, q);
    if (r2 > 1.0 || dot(d, at) < 0.0) return vec4(0.0);
    vec3 n = q.x * right + q.y * up - sqrt(1.0 - r2) * at;
    float lit = smoothstep(-0.08, 0.3, dot(n, uSunDir)), seas = 0.5 + 0.5 * smoothstep(0.38, 0.6, hOf(texture2D(uA, q * 0.11 + seed)));
    // Darker towards the limb, as a ball is.
    return vec4(uMoonCol * seas * (lit * (0.55 + 0.45 * sqrt(1.0 - r2)) + 0.03), smoothstep(1.0, 0.92, r2));
}
void main() {
    vec3 d = normalize(vDir);
    vec3 c = atmosphere(d);
    float up = max(d.y, 0.0), mask = 1.0;

    vec4 m0 = moon(d, uMoon[0], uMoonSize.x, 0.13), m1 = moon(d, uMoon[1], uMoonSize.y, 0.61);
    mask -= max(m0.a, m1.a);
    if (uStars > 0.01 && d.y > -0.02) {
        // One star to a cell of a cube's faces; a few of them bright.
        vec3 a = abs(d);
        vec2 uv; float face;
        if (a.y >= a.x && a.y >= a.z) { uv = d.xz / a.y; face = 0.0; }
        else if (a.x >= a.z) { uv = d.yz / a.x; face = 1.0 + step(0.0, d.x); }
        else { uv = d.xy / a.z; face = 3.0 + step(0.0, d.z); }
        vec2 g = uv * 58.0, id = floor(g) + face * 71.0, f = fract(g);
        float h = hash(id), mag = pow(hash(id + 4.1), 7.0);
        vec2 at = 0.2 + 0.6 * vec2(hash(id + 1.7), hash(id + 9.2));
        float star = step(0.42, h) * smoothstep(0.05 + 0.05 * mag, 0.0, length(f - at)) * (0.18 + 1.6 * mag);
        star *= 0.78 + 0.22 * sin(uTime * (2.0 + 5.0 * h) + h * 50.0);
        // The galaxy's band, tilted across the sky.
        float band = exp(-pow(dot(d, vec3(0.42, 0.56, -0.71)) * 4.2, 2.0));
        float dust = band * (0.3 + 0.7 * hOf(texture2D(uA, uv * 0.6 + face * 0.37))) * 0.035;
        vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.7), hash(id + 2.9));
        c += (tint * star * (1.0 + band) * 2.2 + vec3(0.6, 0.7, 1.0) * dust) * uStars * mask * smoothstep(-0.02, 0.12, d.y);
    }
    if (uAurora > 0.01 && d.y > 0.03) {
        // Curtains hung over the northern sky: a sharp hem, rays fading upward.
        vec2 q = d.xz / (d.y + 0.22);
        float glow = 0.0;
        for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float hem = 2.3 + fi * 0.95 + 0.4 * sin(q.x * 0.8 + uTime * 0.045 + fi * 2.1) + 0.16 * sin(q.x * 2.3 - uTime * 0.07 + fi);
            float t = q.y - hem;
            float fold = t > 0.0 ? exp(-t * t * 70.0) : exp(t * 1.9);
            float rays = hOf(texture2D(uA, vec2(q.x * 0.21 + fi * 0.31, uTime * 0.0035 + fi * 0.17)));
            glow += fold * (0.25 + 1.5 * rays * rays) * (0.6 + 0.4 * sin(uTime * 0.11 + fi * 1.9));
        }
        vec3 hue = mix(vec3(0.10, 1.0, 0.42), vec3(0.50, 0.22, 0.95), smoothstep(0.1, 0.5, d.y));
        c += hue * glow * 0.7 * uAurora * mask * smoothstep(0.02, 0.1, d.y);
    }
    c += m0.rgb * m0.a + m1.rgb * m1.a;
    // The big moon's glow in the air about it.
    c += uMoonCol * 0.06 * pow(max(dot(d, uMoon[0]), 0.0), 160.0) * step(0.0, uMoon[0].y);

    // The sun, its glare, and in ice-crystal air its halo and sun dogs.
    float sd = dot(d, uSunDir);
    c += uSunCol * (smoothstep(0.99988, 0.99996, sd) * 40.0 + pow(max(sd, 0.0), 900.0) * 3.0 + pow(max(sd, 0.0), 90.0) * 0.35);
    if (uHalo > 0.01) {
        float ang = acos(clamp(sd, -1.0, 1.0)), ring = ang - 0.384;
        float halo = exp(-ring * ring * (ring < 0.0 ? 9000.0 : 900.0));
        vec2 dxz = normalize(d.xz), sxz = normalize(uSunDir.xz);
        float side = abs(dxz.x * sxz.y - dxz.y * sxz.x) / max(dot(dxz, sxz), 0.2);
        float dogs = exp(-pow((side - 0.42) * 16.0, 2.0)) * exp(-pow((d.y - uSunDir.y) * 22.0, 2.0)) * step(0.0, dot(dxz, sxz));
        c += uSunCol * (halo * vec3(0.16, 0.13, 0.11) + dogs * vec3(0.55, 0.4, 0.3)) * uHalo;
    }
    if (d.y > 0.0) {
        // Cloud: a sheet overhead, lit from the sun's side, thinning to the horizon.
        vec2 q = d.xz / (d.y + 0.11) * 0.42 + uCloudOff;
        float body = hOf(texture2D(uA, q * 0.21)) * 0.7 + hOf(texture2D(uA, q * 0.83 + 0.4)) * 0.3;
        float cover = smoothstep(uCloud.x, uCloud.x + uCloud.y, body);
        float lit = clamp(0.62 + (body - hOf(texture2D(uA, (q + uSunDir.xz * 0.07) * 0.21))) * 5.0, 0.2, 1.3);
        vec3 cloud = uFill * 1.9 + uSunCol * uSunLit * 0.5 * lit + uHorizon * 0.25;
        c = mix(c, cloud, cover * uCloud.z * smoothstep(0.0, 0.13, d.y));
    }
    // The air itself: a little haze low down on a clear day, everything in a blizzard.
    float veil = 1.0 - exp(-uFog * 1300.0 / (max(d.y, 0.0) + 0.02));
    c = mix(c, atmosphere(normalize(vec3(d.x, 0.0, d.z))), veil);
    gl_FragColor = vec4(tone(c, gl_FragCoord.xy), 1.0);
}`,

    // Snow: each flake a streak as long as it travels while the eye's shutter is open.
    snowVS: `
precision highp float;
attribute vec4 aSeed;
attribute vec2 aCorner;
uniform mat4 uVP;
uniform vec3 uBox, uShift, uVel, uAim;
uniform vec2 uView;
uniform float uCount, uStreak, uSize, uFog, uTime;
varying vec3 vShade;       // side to side, end to end, strength
varying float vLamp;
void main() {
    vec3 p = mod(aSeed.xyz * uBox - uShift, uBox) - 0.5 * uBox;
    p.xz += 0.35 * sin(uTime * (1.0 + aSeed.w * 2.0) + aSeed.yx * 40.0);   // flutter
    vec4 c0 = uVP * vec4(p, 1.0), c1 = uVP * vec4(p - uVel * uStreak, 1.0);
    float dist = length(p);
    if (aSeed.w > uCount || c0.w < 0.35 || c1.w < 0.35) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 a = c0.xy / c0.w, b = c1.xy / c1.w, along = (b - a) * uView;
    float len = length(along);
    vec2 dir = len > 1e-3 ? along / len : vec2(0.0, 1.0);
    float width = clamp(uSize * (0.6 + 0.8 * fract(aSeed.w * 37.0)) / c0.w, 0.9, 7.0);
    vec2 px = mix(a, b, aCorner.x) * uView + vec2(-dir.y, dir.x) * aCorner.y * width + dir * (aCorner.x * 2.0 - 1.0) * width;
    gl_Position = vec4(px / uView, mix(c0.z / c0.w, c1.z / c1.w, aCorner.x), 1.0);
    // A long streak spreads its light thin.
    float fade = smoothstep(0.35, 1.6, c0.w) * exp(-dist * uFog) * min(1.0, (2.0 * width + 2.0) / (len + 2.0 * width));
    vShade = vec3(aCorner.y, aCorner.x * 2.0 - 1.0, fade);
    vLamp = pow(max(dot(p / dist, uAim), 0.0), 10.0) / (1.0 + dist * dist / 1600.0);
}`,

    snowFS: `
${ICE_GLSL.head}
varying vec3 vShade;
varying float vLamp;
uniform vec3 uFlake, uLamp;
void main() {
    float soft = (1.0 - vShade.x * vShade.x) * (1.0 - vShade.y * vShade.y);
    vec3 c = uFlake + uLamp * vLamp * 3.0;
    gl_FragColor = vec4(pow(1.0 - exp(-c), vec3(0.4545)), soft * vShade.z);
}`,

    // Craft: flat-shaded hulls, with engines that glow.
    craftVS: `
precision highp float;
attribute vec3 aPos, aNormal;
attribute vec4 aColour;    // a: how much of it is its own light
uniform mat4 uVP, uModel;
varying vec3 vNormal, vRel;
varying vec4 vColour;
void main() {
    vec4 world = uModel * vec4(aPos, 1.0);
    vRel = world.xyz;
    vNormal = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNormal;
    vColour = aColour;
    gl_Position = uVP * world;
}`,

    craftFS: `
${ICE_GLSL.head}
varying vec3 vNormal, vRel;
varying vec4 vColour;
uniform vec3 uLightDir, uLight, uFill, uSnow;
uniform float uFog, uBurn;
${ICE_GLSL.sky}
void main() {
    vec3 n = normalize(vNormal);
    float dist = length(vRel);
    // Lit from above by the sky and from below by the snow it skims.
    vec3 col = vColour.rgb * (uLight * max(dot(n, uLightDir), 0.0) + uFill * (0.55 + 0.45 * n.y) + uSnow * max(-n.y, 0.0));
    col = mix(col, vColour.rgb * uBurn, vColour.a);
    vec3 dir = vRel / dist;
    col = mix(col, atmosphere(normalize(vec3(dir.x, max(dir.y, 0.0) * 0.5, dir.z))), 1.0 - exp(-dist * uFog));
    gl_FragColor = vec4(tone(col, gl_FragCoord.xy), 1.0);
}`,

    // Lights: beacons, strobes, engine glare. Added to whatever is behind them.
    lightVS: `
precision highp float;
attribute vec3 aPos;
attribute vec4 aColour;    // a: size in metres
uniform mat4 uVP;
uniform float uScale, uFog;
varying vec3 vColour;
void main() {
    gl_Position = uVP * vec4(aPos, 1.0);
    float size = aColour.a * uScale / max(gl_Position.w, 0.1);
    gl_PointSize = clamp(size, 2.0, 96.0);
    // Too far to fill two pixels: dimmer instead of smaller.
    vColour = aColour.rgb * exp(-length(aPos) * uFog * 0.6) * min(1.0, size * size / 4.0 + 0.25);
}`,

    lightFS: `
${ICE_GLSL.head}
varying vec3 vColour;
void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0, glow = max(0.0, 1.0 - r);
    gl_FragColor = vec4(vColour * (glow * glow * 0.6 + smoothstep(0.35, 0.0, r)), 1.0);
}`,
};

// A wingman's speeder, in its own metres: x right, y up, z forward. Blocky on
// purpose: it is a few pixels of hull and two engines for most of its life.
const IceCraft = (() => {
    const WHITE = [0.82, 0.84, 0.86, 0], GREY = [0.36, 0.38, 0.42, 0], DARK = [0.1, 0.11, 0.13, 0];
    const TEAL = [0.08, 0.42, 0.5, 0], GLASS = [0.03, 0.05, 0.08, 0], BURN = [1.0, 0.55, 0.2, 1];
    const out = [];
    // A six-sided block from its eight corners: back face (left-bottom,
    // right-bottom, right-top, left-top) then the front face the same way.
    function hull(c, colour, ends = {}) {
        const quad = (a, b, d, e, col) => {
            const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
            const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            const len = Math.hypot(...n) || 1;
            for (const corner of [a, b, d, a, d, e]) out.push(...corner, n[0] / len, n[1] / len, n[2] / len, ...col);
        };
        quad(c[1], c[0], c[3], c[2], ends.back || colour);    // back
        quad(c[4], c[5], c[6], c[7], ends.front || colour);   // front
        quad(c[0], c[4], c[7], c[3], colour);                 // left
        quad(c[5], c[1], c[2], c[6], colour);                 // right
        quad(c[3], c[7], c[6], c[2], ends.top || colour);     // top
        quad(c[0], c[1], c[5], c[4], ends.bottom || colour);  // bottom
    }
    // A block between two cross-sections: [x, y, z, half-width, half-height].
    const span = (a, b, colour, ends) => hull([
        [a[0] - a[3], a[1] - a[4], a[2]], [a[0] + a[3], a[1] - a[4], a[2]], [a[0] + a[3], a[1] + a[4], a[2]], [a[0] - a[3], a[1] + a[4], a[2]],
        [b[0] - b[3], b[1] - b[4], b[2]], [b[0] + b[3], b[1] - b[4], b[2]], [b[0] + b[3], b[1] + b[4], b[2]], [b[0] - b[3], b[1] + b[4], b[2]],
    ], colour, ends);

    span([0, 0.1, -2.0, 1.25, 0.42], [0, 0.0, 0.6, 1.05, 0.36], WHITE, { bottom: GREY });          // body
    span([0, 0.0, 0.6, 1.05, 0.36], [0, -0.12, 2.9, 0.34, 0.12], WHITE, { bottom: GREY });         // nose wedge
    span([0, 0.55, -1.5, 0.55, 0.2], [0, 0.42, 0.5, 0.42, 0.14], GLASS);                           // canopy
    span([0, 0.3, -1.95, 0.5, 0.06], [0, 0.2, 2.2, 0.16, 0.03], TEAL);                             // a stripe down the spine
    for (const side of [-1, 1]) {
        span([side * 1.75, 0.05, -2.3, 0.42, 0.36], [side * 1.7, 0.0, -0.2, 0.36, 0.3], GREY, { back: BURN });   // engine
        span([side * 1.7, 0.0, -0.2, 0.2, 0.16], [side * 1.55, -0.05, 2.5, 0.07, 0.07], DARK);                   // boom
        span([side * 1.15, 0.5, -2.35, 0.5, 0.03], [side * 1.15, 0.86, -1.5, 0.5, 0.03], TEAL);                  // air brake, cracked open
        span([side * 2.25, 0.02, -1.9, 0.5, 0.05], [side * 2.3, 0.0, -0.9, 0.3, 0.04], WHITE);                   // stub wing
    }
    return { vertices: new Float32Array(out), count: out.length / 10, engines: [[-1.75, 0.05, -2.45], [1.75, 0.05, -2.45]] };
})();

class IceRenderer {
    // world: { n, packs: { a, b } } from IceLogic.bake and pack.
    constructor(canvas, world) {
        this.canvas = canvas;
        this.world = world;
        this.gl = null;
        this.lost = false;
        this.quality = { cells: 64, shadowSteps: 0, flakes: 4000, sparkle: true };
        this.levels = 9;
        this.cell = 3;                         // metres between vertices underfoot
        this.box = [64, 44, 64];               // the volume the snow wraps in
        this.lights = new Float32Array(64 * 7);
        this.lodScratch = new Float32Array(6);
        this.matVP = new Float32Array(16);
    }

    // False when there is no WebGL to be had.
    init() {
        const options = { antialias: false, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' };
        const gl = this.gl = this.canvas.getContext('webgl2', options) || this.canvas.getContext('webgl', options);
        if (!gl) return false;
        this.depthBits = gl.getParameter(gl.DEPTH_BITS);
        // Drawn on the CPU (a VM, a remote desktop, headless Chrome): every pixel is dear.
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        this.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '');
        this.programs = {};
        this.sky = this.program('sky', ICE_SHADERS.skyVS, ICE_SHADERS.skyFS);
        this.snow = this.program('snow', ICE_SHADERS.snowVS, ICE_SHADERS.snowFS);
        this.craft = this.program('craft', ICE_SHADERS.craftVS, ICE_SHADERS.craftFS);
        this.light = this.program('light', ICE_SHADERS.lightVS, ICE_SHADERS.lightFS);
        this.texA = this.texture(this.world.packs.a.mips);
        this.texB = this.texture(this.world.packs.b.mips);
        this.texBS = this.texture(this.world.packs.b.slopeMips);
        this.triangle = this.buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
        this.craftBuffer = this.buffer(gl.ARRAY_BUFFER, IceCraft.vertices);
        this.lightBuffer = gl.createBuffer();
        this.terrain = null;
        this.grid = null;
        this.flakes = null;
        this.applyQuality(this.quality);
        return true;
    }

    program(name, vs, fs) {
        const gl = this.gl, program = gl.createProgram();
        for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`ice-patrol ${name} shader: ${gl.getShaderInfoLog(shader)}`);
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`ice-patrol ${name} program: ${gl.getProgramInfoLog(program)}`);
        const uniforms = new Map(), attributes = new Map();
        return {
            program,
            u: key => { if (!uniforms.has(key)) uniforms.set(key, gl.getUniformLocation(program, key)); return uniforms.get(key); },
            a: key => { if (!attributes.has(key)) attributes.set(key, gl.getAttribLocation(program, key)); return attributes.get(key); },
        };
    }

    texture(mips) {
        const gl = this.gl, texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        mips.forEach((bytes, level) => {
            const size = this.world.n >> level;
            gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        });
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        return texture;
    }

    buffer(target, data) {
        const gl = this.gl, buffer = gl.createBuffer();
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, gl.STATIC_DRAW);
        return buffer;
    }

    // { cells, shadowSteps, flakes, sparkle }: rebuilds only what changed,
    // and never the scene (that lives in the manager).
    applyQuality(quality) {
        const gl = this.gl, before = this.quality;
        this.quality = { ...quality };
        if (!gl) return;
        if (!this.terrain || before.shadowSteps !== quality.shadowSteps) {
            if (this.terrain) gl.deleteProgram(this.terrain.program);
            this.terrain = this.program('terrain', ICE_SHADERS.terrainVS(IceLogic.SHAPE), ICE_SHADERS.terrainFS(IceLogic.SHAPE, quality.shadowSteps));
        }
        if (!this.grid || this.grid.cells !== quality.cells) {
            if (this.grid) { gl.deleteBuffer(this.grid.vertices); gl.deleteBuffer(this.grid.indices); }
            const m = quality.cells, side = m + 1, vertices = new Float32Array(side * side * 2), indices = new Uint16Array(m * m * 6);
            for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) vertices.set([x - m / 2, z - m / 2], (z * side + x) * 2);
            let o = 0;
            for (let z = 0; z < m; z++) {
                for (let x = 0; x < m; x++) {
                    const i = z * side + x;
                    indices.set([i, i + side, i + 1, i + 1, i + side, i + side + 1], o);
                    o += 6;
                }
            }
            this.grid = { cells: m, count: indices.length, vertices: this.buffer(gl.ARRAY_BUFFER, vertices), indices: this.buffer(gl.ELEMENT_ARRAY_BUFFER, indices) };
        }
        if (!this.flakes || this.flakes.count !== quality.flakes) {
            if (this.flakes) { gl.deleteBuffer(this.flakes.vertices); gl.deleteBuffer(this.flakes.indices); }
            // Four corners a flake; its rank (w) decides how early it joins a snowfall.
            const count = Math.min(quality.flakes, 16000), vertices = new Float32Array(count * 4 * 6), indices = new Uint16Array(count * 6);
            const corners = [[0, -1], [0, 1], [1, 1], [1, -1]];
            for (let i = 0; i < count; i++) {
                const seed = [Math.random(), Math.random(), Math.random(), (i + 0.5) / count];
                corners.forEach((corner, c) => vertices.set([...seed, ...corner], (i * 4 + c) * 6));
                indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
            }
            this.flakes = { count, vertices: this.buffer(gl.ARRAY_BUFFER, vertices), indices: this.buffer(gl.ELEMENT_ARRAY_BUFFER, indices) };
        }
    }

    // How far the ground is drawn, metres.
    get reach() {
        return this.cell * 2 ** (this.levels - 1) * this.quality.cells / 2 * 0.97;
    }

    resize(width, height) {
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
    }

    // The camera: where it looks (unit vectors) and the matrix from the
    // world about it to the screen. tanY is the tangent of half the
    // vertical field of view.
    aim(cam, tanY, aspect) {
        const sh = Math.sin(cam.heading), ch = Math.cos(cam.heading), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
        const sr = Math.sin(cam.roll), cr = Math.cos(cam.roll);
        const f = [sh * cp, sp, ch * cp], r0 = [ch, 0, -sh];
        const u0 = [f[1] * r0[2] - f[2] * r0[1], f[2] * r0[0] - f[0] * r0[2], f[0] * r0[1] - f[1] * r0[0]];
        const r = r0.map((v, i) => v * cr - u0[i] * sr), u = u0.map((v, i) => v * cr + r0[i] * sr);
        const near = 1, far = 90000, sx = 1 / (tanY * aspect), sy = 1 / tanY, a = -(far + near) / (far - near), b = -2 * far * near / (far - near);
        // projection × view, column-major; view rows are r, u, -f.
        this.matVP.set([
            sx * r[0], sy * u[0], -a * f[0], f[0],
            sx * r[1], sy * u[1], -a * f[1], f[1],
            sx * r[2], sy * u[2], -a * f[2], f[2],
            0, 0, b, 0,
        ]);
        return { f, r, u, tan: [tanY * aspect, tanY] };
    }

    setCommon(p, scene) {
        const gl = this.gl;
        gl.uniform3fv(p.u('uZenith'), scene.light.zenith);
        gl.uniform3fv(p.u('uHorizon'), scene.light.horizon);
        gl.uniform3fv(p.u('uGlow'), scene.light.glow);
        gl.uniform3fv(p.u('uSunDir'), scene.sunDir);
    }

    // Each layer's matrix, and where the camera is in its tile (worked out
    // in doubles here, so the shader only ever adds small numbers to it).
    setLayers(p, scene) {
        const gl = this.gl, matrices = new Float32Array(36), offsets = new Float32Array(18);
        scene.layers.forEach((m, i) => {
            for (let j = 0; j < 4; j++) matrices[i * 4 + j] = m[j];
            const u = m[0] * scene.cam.x + m[1] * scene.cam.z + (m[4] || 0), v = m[2] * scene.cam.x + m[3] * scene.cam.z + (m[5] || 0);
            offsets[i * 2] = u - Math.floor(u);
            offsets[i * 2 + 1] = v - Math.floor(v);
        });
        gl.uniform4fv(p.u('uLayM[0]'), matrices);
        gl.uniform2fv(p.u('uLayO[0]'), offsets);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texA);
        gl.uniform1i(p.u('uA'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texB);
        gl.uniform1i(p.u('uB'), 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.texBS);
        gl.uniform1i(p.u('uBS'), 2);
    }

    attributes(p, layout, stride) {
        const gl = this.gl;
        for (const [name, size, offset] of layout) {
            const at = p.a(name);
            if (at < 0) continue;
            gl.enableVertexAttribArray(at);
            gl.vertexAttribPointer(at, size, gl.FLOAT, false, stride * 4, offset * 4);
        }
    }

    render(scene) {
        const gl = this.gl;
        if (!gl || gl.isContextLost()) return;
        const { width, height } = this.canvas, cam = scene.cam;
        gl.viewport(0, 0, width, height);
        const view = this.aim(cam, scene.tanY, width / height);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.clearDepth(1);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        // ---- The ground: the finest grid first, so the rest is mostly hidden behind it.
        const t = this.terrain, m = this.quality.cells, reach = this.reach;
        gl.useProgram(t.program);
        this.setCommon(t, scene);
        this.setLayers(t, scene);
        gl.uniformMatrix4fv(t.u('uVP'), false, this.matVP);
        gl.uniform1f(t.u('uCamY'), cam.y);
        gl.uniform1f(t.u('uHalf'), m / 2);
        gl.uniform2f(t.u('uGmax'), this.world.packs.a.gmax, this.world.packs.b.gmax);
        gl.uniform3fv(t.u('uLightDir'), scene.lightDir);
        gl.uniform3fv(t.u('uLight'), scene.lightCol);
        gl.uniform3fv(t.u('uFill'), scene.light.fill);
        gl.uniform3fv(t.u('uAim'), scene.lampAim);
        gl.uniform3fv(t.u('uLamp'), scene.lamp);
        gl.uniform1f(t.u('uFog'), scene.fog);
        gl.uniform1f(t.u('uFar'), reach);
        gl.uniform1f(t.u('uShadow'), scene.shadow);
        gl.uniform1f(t.u('uCloudShade'), scene.cloudShade);
        gl.uniform1f(t.u('uSparkle'), this.quality.sparkle ? scene.sparkle : 0);
        gl.uniform2f(t.u('uCellOff'), cam.x - Math.floor(cam.x / 64) * 64, cam.z - Math.floor(cam.z / 64) * 64);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.grid.vertices);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.grid.indices);
        this.attributes(t, [['aGrid', 2, 0]], 2);
        // With a shallow depth buffer the far grids can't be trusted to sort
        // themselves, so they are painted first instead.
        const order = [...Array(this.levels).keys()];
        if (this.depthBits < 24) order.reverse();
        const centre = level => {
            const snap = this.cell * 2 ** level * 2;
            return [Math.round(cam.x / snap) * snap - cam.x, Math.round(cam.z / snap) * snap - cam.z];
        };
        for (const level of order) {
            const cell = this.cell * 2 ** level, at = centre(level);
            gl.uniform1f(t.u('uCell'), cell);
            gl.uniform2f(t.u('uOrigin'), at[0], at[1]);
            for (let i = 0; i < 6; i++) this.lodScratch[i] = Math.log2(cell / (IceLogic.LAYERS[i].size / this.world.n));
            gl.uniform1fv(t.u('uLod[0]'), this.lodScratch);
            if (level) {
                const inner = centre(level - 1);
                gl.uniform3f(t.u('uHole'), inner[0], inner[1], cell / 2 * (m / 2) - cell * 0.02);
            } else gl.uniform3f(t.u('uHole'), 0, 0, -1);
            gl.drawElements(gl.TRIANGLES, this.grid.count, gl.UNSIGNED_SHORT, 0);
        }

        // ---- Craft.
        if (scene.craft.length) {
            const c = this.craft;
            gl.useProgram(c.program);
            this.setCommon(c, scene);
            gl.uniformMatrix4fv(c.u('uVP'), false, this.matVP);
            gl.uniform3fv(c.u('uLightDir'), scene.lightDir);
            gl.uniform3fv(c.u('uLight'), scene.lightCol);
            gl.uniform3fv(c.u('uFill'), scene.light.fill);
            gl.uniform3fv(c.u('uSnow'), scene.bounce);
            gl.uniform1f(c.u('uFog'), scene.fog);
            gl.uniform1f(c.u('uBurn'), scene.burn);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.craftBuffer);
            this.attributes(c, [['aPos', 3, 0], ['aNormal', 3, 3], ['aColour', 4, 6]], 10);
            for (const model of scene.craft) {
                gl.uniformMatrix4fv(c.u('uModel'), false, model);
                gl.drawArrays(gl.TRIANGLES, 0, IceCraft.count);
            }
        }

        // ---- The sky, wherever nothing else was drawn.
        const s = this.sky;
        gl.useProgram(s.program);
        this.setCommon(s, scene);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texA);
        gl.uniform1i(s.u('uA'), 0);
        gl.uniform3fv(s.u('uRight'), view.r);
        gl.uniform3fv(s.u('uUp'), view.u);
        gl.uniform3fv(s.u('uFwd'), view.f);
        gl.uniform2fv(s.u('uTan'), view.tan);
        gl.uniform3fv(s.u('uSunCol'), scene.light.sun);
        gl.uniform3fv(s.u('uFill'), scene.light.fill);
        gl.uniform3fv(s.u('uMoon[0]'), [...scene.moons[0], ...scene.moons[1]]);
        gl.uniform3fv(s.u('uMoonCol'), scene.moonCol);
        gl.uniform2f(s.u('uMoonSize'), 0.036, 0.015);
        gl.uniform3fv(s.u('uCloud'), scene.cloud);
        gl.uniform2fv(s.u('uCloudOff'), scene.cloudOff);
        gl.uniform1f(s.u('uStars'), scene.stars);
        gl.uniform1f(s.u('uAurora'), scene.aurora);
        gl.uniform1f(s.u('uTime'), scene.time);
        gl.uniform1f(s.u('uHalo'), scene.halo);
        gl.uniform1f(s.u('uSunLit'), scene.sunLit);
        gl.uniform1f(s.u('uFog'), scene.fog);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.triangle);
        this.attributes(s, [['aPos', 2, 0]], 2);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.enable(gl.BLEND);
        gl.depthMask(false);

        // ---- Lights.
        if (scene.lights.length) {
            const l = this.light, n = Math.min(scene.lights.length, 64);
            for (let i = 0; i < n; i++) this.lights.set(scene.lights[i], i * 7);
            gl.useProgram(l.program);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.uniformMatrix4fv(l.u('uVP'), false, this.matVP);
            gl.uniform1f(l.u('uScale'), height / (2 * scene.tanY));
            gl.uniform1f(l.u('uFog'), scene.fog);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.lights.subarray(0, n * 7), gl.DYNAMIC_DRAW);
            this.attributes(l, [['aPos', 3, 0], ['aColour', 4, 3]], 7);
            gl.drawArrays(gl.POINTS, 0, n);
        }

        // ---- Snow.
        if (scene.flakes > 0.004) {
            const f = this.snow;
            gl.useProgram(f.program);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.uniformMatrix4fv(f.u('uVP'), false, this.matVP);
            gl.uniform3fv(f.u('uBox'), this.box);
            gl.uniform3fv(f.u('uShift'), scene.snowShift);
            gl.uniform3fv(f.u('uVel'), scene.snowVel);
            gl.uniform3fv(f.u('uAim'), scene.lampAim);
            gl.uniform2f(f.u('uView'), width / 2, height / 2);
            gl.uniform1f(f.u('uCount'), scene.flakes);
            gl.uniform1f(f.u('uStreak'), scene.streak);
            gl.uniform1f(f.u('uSize'), 0.045 * height / (2 * scene.tanY));
            gl.uniform1f(f.u('uFog'), scene.fog);
            gl.uniform1f(f.u('uTime'), scene.time);
            gl.uniform3fv(f.u('uFlake'), scene.flakeCol);
            gl.uniform3fv(f.u('uLamp'), scene.lamp);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.flakes.vertices);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.flakes.indices);
            this.attributes(f, [['aSeed', 4, 0], ['aCorner', 2, 4]], 6);
            gl.drawElements(gl.TRIANGLES, this.flakes.count * 6, gl.UNSIGNED_SHORT, 0);
        }
        gl.depthMask(true);
    }

    dispose() {
        this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
        this.gl = null;
    }
}
