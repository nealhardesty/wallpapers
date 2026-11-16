// Wayfarer's view, in WebGL (SPEC §10.38): the ground, everything standing
// on it, water, the sky, lights and weather. Hand-written WebGL 1, no
// extensions, no libraries.
//
// The world arrives as squares of triangles (WayModels.square), each in its
// own metres from its own corner. The shaders only ever see a square's
// corner *from the camera* (worked out in JavaScript's doubles), so the walk
// never runs them out of precision. Near squares are fine and carry
// everything; far ones are coarse, and give way (a hole) where the near ones
// are.

const WAY_GLSL = {
    head: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`,
    // The sky without its lamps (also what distance fades into), the light, and the painter's finish.
    common: `
uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uLightDir, uLight, uFill, uBounce;
uniform vec4 uFog;         // density, mist density, the mist's top (from the camera), how far the land is drawn
uniform sampler2D uPaint;
vec3 atmosphere(vec3 d) {
    float h = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, 1.0 - pow(1.0 - h, 2.6));
    vec2 dxz = d.xz / max(length(d.xz), 1e-4), sxz = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
    float toward = max(dot(dxz, sxz), 0.0), sd = max(dot(d, uSunDir), 0.0);
    return c + uGlow * (pow(1.0 - h, 5.0) * (0.2 + 0.8 * toward * toward * toward) * 0.7 + pow(sd, 20.0) * 0.35);
}
// Soft cel light: a wrapped terminator pulled part of the way into three steps.
vec3 lit(vec3 albedo, vec3 n, float aoSigned, float sun) {
    float ao = abs(aoSigned);
    float k = smoothstep(-0.14, 0.44, dot(n, uLightDir));
    k = mix(k, floor(k * 3.0 + 0.5) / 3.0, 0.4);
    // Where things meet (the foot of a wall, under the eaves, under a tree) the sky does not reach.
    return albedo * (uLight * (k * sun * (0.45 + 0.55 * ao) + 0.06) + mix(uBounce, uFill, n.y * 0.5 + 0.5) * (0.16 + 0.84 * ao * ao));
}
vec3 fogged(vec3 col, vec3 rel) {
    float dist = length(rel);
    float f = 1.0 - exp(-dist * (uFog.x + uFog.y * exp(-max(rel.y - uFog.z, 0.0) / 9.0)));
    f = max(f, smoothstep(0.78, 0.99, dist / uFog.w));
    vec3 dir = rel / dist;
    return mix(col, atmosphere(normalize(vec3(dir.x, max(dir.y, 0.0) * 0.4 + 0.015, dir.z))), f);
}
vec3 tone(vec3 c, vec2 px) {
    c = pow(1.0 - exp(-c * 1.3), vec3(0.4545));
    c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 1.14);
    return c + (fract(sin(dot(px, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}
`,
    // Lamps near the traveller: where (from the camera), and colour with reach in w.
    lamps: `
uniform vec4 uLampAt[4], uLampCol[4];
#define LAMP(i) { vec3 to = uLampAt[i].xyz - p; float d2 = dot(to, to), k = 1.0 / (1.0 + d2 / uLampCol[i].w); sum += uLampCol[i].rgb * (0.35 + 0.65 * max(dot(n, to * inversesqrt(d2 + 0.01)), 0.0)) * k * k; }
vec3 lamps(vec3 p, vec3 n) { vec3 sum = vec3(0.0); LAMP(0) LAMP(1) LAMP(2) LAMP(3) return sum; }
`,
    // The sun's shadows, from a picture of the scene taken from the sun: depth in three bytes.
    shadow: on => on ? `
uniform sampler2D uShadowMap;
uniform mat4 uShadowVP;
uniform vec2 uShadow;      // strength, a texel
float shadowTap(vec2 uv, float z) { return step(z, dot(texture2D(uShadowMap, uv).rgb, vec3(1.0, 1.0 / 255.0, 1.0 / 65025.0)) + 0.0012); }
float shadowed(vec3 rel, vec3 n) {
    vec4 s = uShadowVP * vec4(rel + n * 0.22, 1.0);
    vec3 q = s.xyz * 0.5 + 0.5;
    if (q.x < 0.02 || q.x > 0.98 || q.y < 0.02 || q.y > 0.98 || q.z > 1.0) return 1.0;
    // Four texels, weighed by where between them the point falls: a soft edge a texel wide.
    float t = uShadow.y;
    vec2 st = q.xy / t - 0.5, f = fract(st), base = (floor(st) + 0.5) * t;
    float sum = mix(mix(shadowTap(base, q.z), shadowTap(base + vec2(t, 0.0), q.z), f.x), mix(shadowTap(base + vec2(0.0, t), q.z), shadowTap(base + vec2(t, t), q.z), f.x), f.y);
    float edge = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
    return mix(1.0, sum, uShadow.x * smoothstep(0.02, 0.12, edge));
}
` : `
float shadowed(vec3 rel, vec3 n) { return 1.0; }
`,
    // Clouds and the far ranges: shared by the sky and by what the water mirrors.
    heavens: `
uniform vec3 uCloud;       // cover's threshold, softness, opacity
uniform vec4 uCloudCol;    // the clouds' lit colour, and how dark their undersides are
uniform vec2 uCloudOff;
uniform vec3 uRange;       // far mountains: height, where the walk has got to, snow line
vec3 heavens(vec3 d, vec3 c) {
    float up = max(d.y, 0.0);
    // Clouds: heaped, flat-bottomed, lit from the sun's side.
    vec2 q = d.xz / (up + 0.16) * 0.34 + uCloudOff;
    float body = texture2D(uPaint, q * 0.19).r * 0.62 + texture2D(uPaint, q * 0.53 + 0.3).g * 0.38;
    float cover = smoothstep(uCloud.x, uCloud.x + uCloud.y, body);
    float sunny = clamp(0.55 + (body - texture2D(uPaint, (q + uSunDir.xz * 0.09) * 0.19).r) * 5.0, 0.0, 1.0);
    vec3 cloud = mix(uFill * uCloudCol.a + uHorizon * 0.3, uCloudCol.rgb, sunny * sunny);
    c = mix(c, cloud, cover * uCloud.z * smoothstep(0.0, 0.1, d.y));
    // Two far ranges, the nearer darker; snow on the tops.
    float az = atan(d.x, d.z) / 6.2831853, el = d.y / max(length(d.xz), 1e-3);
    float r1 = uRange.x * (0.25 + 1.2 * texture2D(uPaint, vec2(az * 2.0 + uRange.y, 0.31)).r + 0.25 * texture2D(uPaint, vec2(az * 9.0, 0.57)).g);
    float r2 = uRange.x * (0.1 + 0.62 * texture2D(uPaint, vec2(az * 3.0 - uRange.y * 1.7, 0.83)).r + 0.12 * texture2D(uPaint, vec2(az * 14.0, 0.11)).g);
    vec3 haze = atmosphere(normalize(vec3(d.x, 0.03, d.z)));
    vec3 sunlit = uLight * (0.35 + 0.65 * max(dot(normalize(vec3(d.x, 0.4, d.z)), uLightDir), 0.0)) + uFill;
    vec3 m1 = mix(mix(vec3(0.2, 0.23, 0.32), vec3(0.8, 0.83, 0.9), smoothstep(uRange.z, uRange.z + 0.035, el)) * sunlit, haze, 0.62);
    vec3 m2 = mix(vec3(0.13, 0.2, 0.2) * sunlit, haze, 0.48);
    c = mix(c, m1, smoothstep(r1 + 0.004, r1 - 0.004, el));
    c = mix(c, m2, smoothstep(r2 + 0.004, r2 - 0.004, el));
    return c;
}
`,
};

const WAY_SHADERS = {
    solidVS: `
precision highp float;
attribute vec3 aPos;
attribute vec4 aNormal, aColour, aExtra;
uniform mat4 uVP;
uniform vec3 uOffset;
uniform vec4 uWind;        // x, z of the gust, time, how much things sway
varying vec3 vRel, vNormal;
varying vec4 vColour, vExtra;
varying vec3 vAt;
varying float vGloss;
void main() {
    vec3 p = aPos;
    vGloss = 1.0 - aColour.a;
#ifdef PROPS
    float ph = aExtra.w * 6.2831853, t = uWind.z;
    p.xz += uWind.xy * uWind.w * aExtra.x * (sin(t * 1.3 + ph + p.y * 0.3) * 0.6 + sin(t * 2.9 + ph * 1.7 + p.x * 0.7) * 0.25);
    p += aNormal.xyz * aExtra.z * uWind.w * sin(t * 5.0 + p.y * 2.4 + p.z * 1.6 + p.x * 1.1 + ph) * 0.42;
#endif
    vRel = p + uOffset;
    vNormal = aNormal.xyz;
    vColour = vec4(aColour.rgb * aColour.rgb, aNormal.w);
    vExtra = aExtra;
    vAt = aPos;
    gl_Position = uVP * vec4(vRel, 1.0);
}`,

    groundFS: shadows => `
${WAY_GLSL.head}
varying vec3 vRel, vNormal, vAt;
varying vec4 vColour, vExtra;
uniform vec4 uHole;        // the near squares, from the camera: min x, min z, max x, max z
uniform float uWet;
${WAY_GLSL.common}
${WAY_GLSL.lamps}
${WAY_GLSL.shadow(shadows)}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
    if (vRel.x > uHole.x && vRel.x < uHole.z && vRel.z > uHole.y && vRel.z < uHole.w) discard;
    float dist = length(vRel), near = exp(-dist / 55.0);
    vec2 uv = vAt.xz;
    vec4 broad = texture2D(uPaint, uv / 16.0), fine = texture2D(uPaint, uv / 4.0);
    vec3 n = normalize(vNormal);
    // Painted, not flat: broad washes, and dabs close by.
    // Laid on in three tones with a loaded brush: shade, body and a warm light, and small strokes close by.
    float wash = broad.r + (fine.g - 0.5) * 0.35 * near, far = exp(-dist / 260.0);
    vec3 albedo = vColour.rgb * mix(vec3(1.0), mix(vec3(0.7, 0.78, 0.86), vec3(1.2, 1.16, 0.95), smoothstep(0.38, 0.62, wash)), 0.75 * far);
    albedo *= 1.0 - 0.16 * smoothstep(0.56, 0.62, fine.b) * near * (1.0 - vExtra.w);
    albedo *= 1.0 - 0.2 * vExtra.z * smoothstep(0.35, 0.5, abs(fract(uv.x * 0.8 + uv.y * 0.6) - 0.5)) * exp(-dist / 40.0);       // furrows
    // The road: worn earth with a ragged edge, cobbles in town.
    float margin = (vExtra.x * 255.0 - 128.0) / 10.0 + (broad.g - 0.5) * 1.1 + (fine.r - 0.5) * 0.4 * near;
    float road = smoothstep(-0.22, 0.22, margin), cob = smoothstep(0.35, 0.65, vExtra.y + (broad.b - 0.5) * 0.3);
    vec3 dirt = vec3(0.4, 0.27, 0.15) * (0.8 + 0.4 * broad.b) * (1.0 - 0.18 * smoothstep(0.5, 0.8, fine.b) * near);
    dirt *= 1.0 - 0.12 * smoothstep(0.35, 0.0, abs(abs(margin - 1.9) - 0.75));                                // ruts
    vec2 q = uv * vec2(2.6, 3.4) + (fine.rg - 0.5) * 0.22;
    q.x += floor(q.y) * 0.37;
    vec2 f = abs(fract(q) - 0.5);
    float stone = smoothstep(0.5, 0.36, max(f.x, f.y)), shadeOf = hash(floor(q));
    vec3 cobbles = mix(vec3(0.19, 0.17, 0.16), vec3(0.42, 0.37, 0.31), shadeOf) * mix(0.85, 0.45 + 0.55 * stone, near);
    // Under snow the road is a trodden line, half showing.
    albedo = mix(albedo, mix(dirt, cobbles, cob), road * (1.0 - 0.6 * vExtra.w));
    albedo = mix(albedo, albedo * vec3(0.6, 0.62, 0.68), uWet * (1.0 - vExtra.w));
    float sun = shadowed(vRel, n);
    vec3 col = lit(albedo, n, vColour.a, sun) + albedo * lamps(vRel, n);
    // Wet ground and snow catch the light.
    vec3 hv = normalize(uLightDir + normalize(-vRel));
    col += uLight * sun * pow(max(dot(n, hv), 0.0), 40.0) * (0.25 * uWet * road + 0.12 * vExtra.w);
    gl_FragColor = vec4(tone(fogged(col, vRel), gl_FragCoord.xy), 1.0);
}`,

    propFS: shadows => `
${WAY_GLSL.head}
varying vec3 vRel, vNormal, vAt;
varying vec4 vColour, vExtra;
varying float vGloss;
uniform vec4 uHole;
uniform float uLit, uWet, uTime, uRound;
uniform vec2 uGhost;       // drawn half there: how solid, and how much of a shimmer (the rest of the time 0, 0)
uniform vec4 uCut;         // leaves between the eye and the traveller are cut away: the traveller from the eye, and how wide (0: nothing is)
uniform float uCutY;       // ...those higher than this (so not the bushes at their feet)
${WAY_GLSL.common}
${WAY_GLSL.lamps}
${WAY_GLSL.shadow(shadows)}
void main() {
    if (vRel.x > uHole.x && vRel.x < uHole.z && vRel.z > uHole.y && vRel.z < uHole.w) discard;
    float dist = length(vRel);
    // Nothing fills the lens: whatever comes within two paces of the eye thins out to nothing.
    if (dist < 2.4 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > (dist - 0.9) / 1.5) discard;
    vec3 n = normalize(vNormal);
    vec2 uv = vAt.xz + vAt.y * 0.7;
    float dab = texture2D(uPaint, uv / 4.0).g, wash = texture2D(uPaint, uv / 16.0).r;
    // Leaves get the heavier brush: clumps of light and shade.
    float leafy = step(0.05, vExtra.x), fade = exp(-dist / 90.0);
    if (uCut.w > 0.0 && leafy > 0.5 && vAt.y > uCutY) {
        // A crown or a bough over the walker's head never hides them from a camera above: it opens round the line of sight.
        float along = clamp(dot(vRel, uCut.xyz) / dot(uCut.xyz, uCut.xyz), 0.0, 1.15), wide = uCut.w * (0.4 + 0.6 * along);
        if (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > smoothstep(wide * 0.62, wide, length(vRel - uCut.xyz * along))) discard;
    }
    vec3 albedo = vColour.rgb * (1.0 + ((dab - 0.5) * 0.26 + (wash - 0.5) * 0.2) * fade * (1.0 - 0.8 * uRound));        // (the brush is for scenery: skin and fur are painted in their models)
    albedo *= mix(vec3(1.0), mix(vec3(0.72, 0.8, 0.9), vec3(1.24, 1.18, 0.92), smoothstep(0.4, 0.6, dab * 0.6 + wash * 0.4)), 0.6 * leafy * (0.3 + 0.7 * fade));
    albedo = mix(albedo, albedo * vec3(0.72, 0.74, 0.8), uWet);
    if (vColour.a < 0.0) {
        // Coursed work: stone in staggered blocks on a wall, flags where it lies flat, tiles lapping down a roof.
        float flatness = abs(n.y), roof = step(0.25, flatness) * step(flatness, 0.93), seen = exp(-dist / 75.0);
        vec2 q = flatness > 0.93 ? vAt.xz / vec2(0.9, 0.6) : vec2((abs(n.x) > abs(n.z) ? vAt.z : vAt.x) / mix(0.78, 0.36, roof), vAt.y / mix(0.4, 0.3, roof));
        q.x += 0.5 * mod(floor(q.y), 2.0);
        vec2 cell = floor(q), f = fract(q);
        float tone = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        float joint = smoothstep(0.0, 0.07, min(f.x, 1.0 - f.x)) * smoothstep(0.0, 0.1, min(f.y, 1.0 - f.y));
        float lap = mix(1.0, 0.62 + 0.5 * smoothstep(0.0, 0.55, f.y), roof);
        albedo *= mix(1.0, (0.84 + 0.3 * tone) * mix(0.6, 1.0, joint) * lap, seen);
    }
    float sun = shadowed(vRel, n);
    vec3 col = lit(albedo, n, vColour.a, sun) + albedo * lamps(vRel, n);
    // Whoever walks is rounder than the scenery: the light falls off all the way across a limb, not in steps.
    float ndl = dot(n, uLightDir), soft = smoothstep(-0.3, 0.95, ndl);
    float occ = abs(vColour.a);
    col = mix(col, albedo * (uLight * (soft * sun * (0.4 + 0.6 * occ) + 0.05) + mix(uBounce, uFill, n.y * 0.5 + 0.5) * (0.5 + 0.34 * soft) * (0.2 + 0.8 * occ * occ)) + albedo * lamps(vRel, n), uRound);
    // A rim of sky along the edges that face away; and the sun's own along an edge it is behind.
    vec3 eye = normalize(-vRel);
    float edge = pow(1.0 - max(dot(n, eye), 0.0), 3.0);
    col += uFill * albedo * edge * 0.5 + uLight * albedo * edge * sun * max(-dot(eye, uLightDir) + 0.2, 0.0) * 0.6 * uRound;
    // Metal, glass and wet eyes catch the light.
    col += (uLight * sun + uFill * 0.25) * pow(max(dot(n, normalize(uLightDir + eye)), 0.0), 36.0) * vGloss * 1.6;
    // What glows after dark: windows warm, everything else its own colour.
    float glow = vExtra.y * uLit * (0.9 + 0.1 * sin(uTime * 6.0 + vExtra.w * 40.0));
    vec3 own = mix(vec3(1.0, 0.66, 0.28), vColour.rgb, smoothstep(0.12, 0.4, dot(vColour.rgb, vec3(0.33))));
    col = mix(col, own * 2.3, glow);
    col = fogged(col, vRel);
    float alpha = 1.0;
    if (uGhost.x > 0.0) {
        // Somebody unseen is an outline of the sky's own light, with what is behind showing through.
        col = mix(col, uFill * 0.9 + uHorizon * 0.3, uGhost.y * 0.8);
        alpha = uGhost.x * mix(1.0, 0.07 + 0.8 * edge * edge, uGhost.y);
    }
    gl_FragColor = vec4(tone(col, gl_FragCoord.xy), alpha);
}`,

    // The picture from the sun: only depth, packed.
    depthVS: `
precision highp float;
attribute vec3 aPos;
attribute vec4 aNormal, aExtra;
uniform mat4 uVP;
uniform vec3 uOffset;
uniform vec4 uWind;
varying float vDepth;
void main() {
    vec3 p = aPos;
    float ph = aExtra.w * 6.2831853, t = uWind.z;
    p.xz += uWind.xy * uWind.w * aExtra.x * (sin(t * 1.3 + ph + p.y * 0.3) * 0.6 + sin(t * 2.9 + ph * 1.7 + p.x * 0.7) * 0.25);
    gl_Position = uVP * vec4(p + uOffset, 1.0);
    vDepth = gl_Position.z * 0.5 + 0.5;
}`,
    depthFS: `
${WAY_GLSL.head}
varying float vDepth;
void main() {
    vec3 e = fract(vDepth * vec3(1.0, 255.0, 65025.0));
    gl_FragColor = vec4(e - e.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0), 1.0);
}`,

    waterFS: mirror => `
${WAY_GLSL.head}
varying vec3 vRel, vNormal, vAt;
varying vec4 vColour, vExtra;
uniform vec4 uHole;
uniform vec3 uSunCol;
uniform vec2 uUvOff;
uniform float uTime, uWet;
${WAY_GLSL.common}
${mirror ? WAY_GLSL.heavens : ''}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
    if (vRel.x > uHole.x && vRel.x < uHole.z && vRel.z > uHole.y && vRel.z < uHole.w) discard;
    float depth = (vExtra.x * 255.0 - 128.0) / 40.0, dist = length(vRel);
    if (depth < -0.06) discard;
    vec2 uv = vAt.xz + uUvOff;
    // Ripples: two washes sliding over one another, calmer far away.
    vec2 r1 = texture2D(uPaint, uv / 8.0 + vec2(uTime * 0.021, uTime * 0.013)).rg, r2 = texture2D(uPaint, uv / 3.2 - vec2(uTime * 0.03, -uTime * 0.017)).gb;
    vec2 tilt = ((r1 - 0.5) * 0.16 + (r2 - 0.5) * 0.1) * (0.35 + 0.65 * exp(-dist / 90.0));
    // Rain: rings opening where the drops land.
    if (uWet > 0.02) {
        vec2 cell = floor(uv * 1.4), fr = fract(uv * 1.4) - 0.5;
        float age = fract(uTime * 0.9 + hash(cell) * 7.0), ring = abs(length(fr - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.4) - age * 0.42);
        tilt += normalize(fr + 1e-3) * smoothstep(0.05, 0.0, ring) * (1.0 - age) * uWet * step(hash(cell + 1.3), uWet) * 0.5 * exp(-dist / 50.0);
    }
    vec3 n = normalize(vec3(tilt.x, 1.0, tilt.y)), eye = normalize(vRel), up = reflect(eye, n);
    up.y = abs(up.y) + 0.02;
    up = normalize(up);
    vec3 sky = atmosphere(up);
${mirror ? '    sky = heavens(up, sky);' : ''}
    // Clear in the shallows, deep and blue further out, the sky lying on it at a glance.
    vec3 body = mix(vec3(0.16, 0.42, 0.4), vec3(0.03, 0.14, 0.26), smoothstep(0.0, 2.6, depth)) * (uFill + uLight * max(uLightDir.y, 0.0) * 0.6);
    float fres = clamp(0.1 + 0.9 * pow(1.0 - max(dot(-eye, n), 0.0), 3.0), 0.0, 1.0);
    vec3 col = mix(body, sky, fres * 0.9);
    col += uSunCol * (pow(max(dot(up, uSunDir), 0.0), 260.0) * 3.0 + pow(max(dot(up, uSunDir), 0.0), 18.0) * 0.12) * step(0.52, r2.x + r1.y * 0.4 + 0.25 * exp(-dist / 40.0));
    // The shore: a line of foam that breathes.
    float foam = smoothstep(0.2, 0.03, depth + 0.07 * sin(uTime * 0.9 + r1.x * 9.0)) * smoothstep(0.42, 0.56, r2.y + 0.25 * r1.x);
    col = mix(col, (uFill + uLight * 0.7) * 0.95, foam * 0.6);
    float alpha = smoothstep(-0.03, 0.1, depth) * mix(0.5, 0.96, max(smoothstep(0.0, 1.4, depth), fres));
    gl_FragColor = vec4(tone(fogged(col, vRel), gl_FragCoord.xy), max(alpha, foam));
}`,

    skyVS: `
attribute vec2 aPos;
uniform vec3 uRight, uUp, uFwd;
uniform vec3 uTan;         // tangents of the half view across and up, and how far the picture's middle is raised
varying vec3 vDir;
void main() {
    vDir = uFwd + uRight * aPos.x * uTan.x + uUp * (aPos.y - uTan.z) * uTan.y;
    gl_Position = vec4(aPos, 0.99999, 1.0);
}`,

    skyFS: `
${WAY_GLSL.head}
varying vec3 vDir;
uniform vec3 uSunCol, uMoon[2], uMoonCol[2];
uniform vec2 uMoonSize;
uniform float uStars, uTime;
${WAY_GLSL.common}
${WAY_GLSL.heavens}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// A moon: a lit ball, so its phase is whatever the sun makes of it.
vec4 moon(vec3 d, vec3 at, float size, vec3 col, float seed) {
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), at)), up = cross(at, right);
    vec2 q = vec2(dot(d, right), dot(d, up)) / size;
    float r2 = dot(q, q);
    if (r2 > 1.0 || dot(d, at) < 0.0) return vec4(0.0);
    vec3 n = q.x * right + q.y * up - sqrt(1.0 - r2) * at;
    float light = smoothstep(-0.1, 0.35, dot(n, uSunDir)), seas = 0.72 + 0.28 * smoothstep(0.4, 0.6, texture2D(uPaint, q * 0.2 + seed).r);
    return vec4(col * seas * (light * (0.6 + 0.4 * sqrt(1.0 - r2)) + 0.04), smoothstep(1.0, 0.9, r2));
}
void main() {
    vec3 d = normalize(vDir);
    vec3 c = atmosphere(d);
    vec4 m0 = moon(d, uMoon[0], uMoonSize.x, uMoonCol[0], 0.13), m1 = moon(d, uMoon[1], uMoonSize.y, uMoonCol[1], 0.61);
    float clear = 1.0 - max(m0.a, m1.a);
    if (uStars > 0.01 && d.y > -0.02) {
        // A star to a cell of a cube's faces, a few of them bright; and a river of them across the sky.
        vec3 a = abs(d);
        vec2 uv; float face;
        if (a.y >= a.x && a.y >= a.z) { uv = d.xz / a.y; face = 0.0; }
        else if (a.x >= a.z) { uv = d.yz / a.x; face = 1.0 + step(0.0, d.x); }
        else { uv = d.xy / a.z; face = 3.0 + step(0.0, d.z); }
        vec2 g = uv * 46.0, id = floor(g) + face * 71.0, f = fract(g);
        float h = hash(id), mag = pow(hash(id + 4.1), 6.0);
        vec2 at = 0.2 + 0.6 * vec2(hash(id + 1.7), hash(id + 9.2));
        float star = step(0.5, h) * smoothstep(0.07 + 0.07 * mag, 0.0, length(f - at)) * (0.25 + 1.8 * mag);
        star *= 0.75 + 0.25 * sin(uTime * (2.0 + 5.0 * h) + h * 50.0);
        float band = exp(-pow(dot(d, vec3(0.5, 0.5, -0.7)) * 4.0, 2.0));
        vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), hash(id + 2.9));
        c += (tint * star * (1.0 + band) * 2.4 + vec3(0.5, 0.45, 0.8) * band * (0.3 + 0.7 * texture2D(uPaint, uv * 0.7 + face * 0.37).r) * 0.05) * uStars * clear * smoothstep(-0.02, 0.14, d.y);
    }
    c += m0.rgb * m0.a + m1.rgb * m1.a;
    c += uMoonCol[0] * 0.05 * pow(max(dot(d, uMoon[0]), 0.0), 120.0) * step(0.0, uMoon[0].y);
    float sd = max(dot(d, uSunDir), 0.0);
    c += uSunCol * (smoothstep(0.9993, 0.9996, sd) * 30.0 + pow(sd, 600.0) * 2.5 + pow(sd, 60.0) * 0.3);
    c = heavens(d, c);
    // Below the horizon, and in thick air, there is only the haze.
    float veil = 1.0 - exp(-uFog.x * 60.0 / (max(d.y, 0.0) + 0.03));
    c = mix(c, atmosphere(normalize(vec3(d.x, 0.015, d.z))), max(veil, smoothstep(0.0, -0.02, d.y)));
    gl_FragColor = vec4(tone(c, gl_FragCoord.xy), 1.0);
}`,

    // Glows, pools of lamplight, smoke, mist: soft discs, facing the eye or lying on the ground.
    spriteVS: `
precision highp float;
attribute vec3 aPos;
attribute vec4 aShape;     // corner x, corner y, size (m), 1 if it lies flat
attribute vec4 aColour;
uniform mat4 uVP;
uniform vec3 uRight, uUp;
uniform float uFogK;
varying vec2 vCorner;
varying vec4 vColour;
void main() {
    vec3 p = aPos + mix(uRight * aShape.x + uUp * aShape.y, vec3(aShape.x, 0.0, aShape.y), aShape.w) * aShape.z;
    vCorner = aShape.xy;
    vColour = aColour * vec4(vec3(exp(-length(aPos) * uFogK)), 1.0);
    gl_Position = uVP * vec4(p, 1.0);
}`,
    spriteFS: `
${WAY_GLSL.head}
varying vec2 vCorner;
varying vec4 vColour;
void main() {
    float r = length(vCorner), a = max(0.0, 1.0 - r);
    a = a * a * (3.0 - 2.0 * a);
    gl_FragColor = vec4(vColour.rgb * a * vColour.a, a * vColour.a);
}`,

    // Rain and snow: a box of them about the eye, wrapping; each a streak as long as it falls in a blink.
    fallVS: `
precision highp float;
attribute vec4 aSeed;
attribute vec2 aCorner;
uniform mat4 uVP;
uniform vec3 uBox, uShift, uVel;
uniform vec2 uView;
uniform float uCount, uStreak, uSize, uTime, uFlutter;
varying vec3 vShade;
void main() {
    vec3 p = mod(aSeed.xyz * uBox - uShift, uBox) - 0.5 * uBox;
    p.xz += uFlutter * sin(uTime * (1.0 + aSeed.w * 2.0) + aSeed.yx * 40.0);
    vec4 c0 = uVP * vec4(p, 1.0), c1 = uVP * vec4(p - uVel * uStreak, 1.0);
    if (aSeed.w > uCount || c0.w < 0.3 || c1.w < 0.3) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 a = c0.xy / c0.w, b = c1.xy / c1.w, along = (b - a) * uView;
    float len = length(along);
    vec2 dir = len > 1e-3 ? along / len : vec2(0.0, 1.0);
    float width = clamp(uSize * (0.6 + 0.8 * fract(aSeed.w * 37.0)) / c0.w, 0.7, 6.0);
    vec2 px = mix(a, b, aCorner.x) * uView + vec2(-dir.y, dir.x) * aCorner.y * width + dir * (aCorner.x * 2.0 - 1.0) * width;
    gl_Position = vec4(px / uView, mix(c0.z / c0.w, c1.z / c1.w, aCorner.x), 1.0);
    vShade = vec3(aCorner.y, aCorner.x * 2.0 - 1.0, smoothstep(0.3, 1.5, c0.w) * min(1.0, (2.0 * width + 2.0) / (len + 2.0 * width)));
}`,
    fallFS: `
${WAY_GLSL.head}
varying vec3 vShade;
uniform vec4 uTint;
void main() {
    float soft = (1.0 - vShade.x * vShade.x) * (1.0 - vShade.y * vShade.y);
    gl_FragColor = vec4(uTint.rgb, soft * vShade.z * uTint.a);
}`,
};

class WayRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.lost = false;
        this.quality = { shadows: 0, mirror: true, drops: 3000 };
        this.box = [36, 26, 36];
        this.matVP = new Float32Array(16);
        this.matShadow = new Float32Array(16);
        this.lampAt = new Float32Array(16);
        this.lampCol = new Float32Array(16);
        this.drawn = { squares: 0, triangles: 0, shadow: 0 };          // triangles counts the shadow pass's too
        this.indices = new Map();
    }

    // False when there is no WebGL to be had.
    init() {
        const options = { antialias: true, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' };
        const gl = this.gl = this.canvas.getContext('webgl2', options) || this.canvas.getContext('webgl', options);
        if (!gl) return false;
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        // Drawn on the CPU (a VM, a remote desktop, headless Chrome): every pixel is dear.
        this.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '');
        this.sky = this.program('sky', WAY_SHADERS.skyVS, WAY_SHADERS.skyFS);
        this.sprite = this.program('sprite', WAY_SHADERS.spriteVS, WAY_SHADERS.spriteFS);
        this.fall = this.program('fall', WAY_SHADERS.fallVS, WAY_SHADERS.fallFS);
        this.depth = this.program('depth', WAY_SHADERS.depthVS, WAY_SHADERS.depthFS);
        this.paint = this.paintTexture(128);
        this.triangle = this.buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
        this.dynamic = gl.createBuffer();
        this.spriteBuffer = gl.createBuffer();
        this.indices.clear();
        this.ground = this.props = this.water = this.drops = this.shadowTarget = null;
        this.applyQuality(this.quality, true);
        return true;
    }

    program(name, vs, fs) {
        const gl = this.gl, program = gl.createProgram();
        for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`wayfarer ${name} shader: ${gl.getShaderInfoLog(shader)}`);
            gl.attachShader(program, shader);
        }
        // The same slots in every program, so a square's buffers are described once.
        for (const [key, slot] of [['aPos', 0], ['aSeed', 0], ['aNormal', 1], ['aShape', 1], ['aCorner', 1], ['aColour', 2], ['aExtra', 3]]) gl.bindAttribLocation(program, slot, key);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`wayfarer ${name} program: ${gl.getProgramInfoLog(program)}`);
        const uniforms = new Map(), attributes = new Map();
        return {
            program,
            u: key => { if (!uniforms.has(key)) uniforms.set(key, gl.getUniformLocation(program, key)); return uniforms.get(key); },
            a: key => { if (!attributes.has(key)) attributes.set(key, gl.getAttribLocation(program, key)); return attributes.get(key); },
        };
    }

    buffer(target, data, usage) {
        const gl = this.gl, buffer = gl.createBuffer();
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, usage || gl.STATIC_DRAW);
        return buffer;
    }

    // The painter's washes: four tileable noises, one to a channel.
    paintTexture(n) {
        const gl = this.gl, bytes = new Uint8Array(n * n * 4), L = WayLogic;
        const tile = (x, y, px, py, seed) => {
            const fx = x / n * px, fy = y / n * py, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
            const h = (a, b) => L.hash(((a % px) + px) % px, ((b % py) + py) % py, seed);
            return L.mix(L.mix(h(i, j), h(i + 1, j), su), L.mix(h(i, j + 1), h(i + 1, j + 1), su), sv);
        };
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const o = (y * n + x) * 4;
                bytes[o] = 255 * (tile(x, y, 4, 4, 1) * 0.5 + tile(x, y, 8, 8, 2) * 0.3 + tile(x, y, 16, 16, 3) * 0.2);
                bytes[o + 1] = 255 * (tile(x, y, 16, 16, 4) * 0.55 + tile(x, y, 32, 32, 5) * 0.45);
                bytes[o + 2] = 255 * (tile(x, y, 32, 6, 6) * 0.6 + tile(x, y, 64, 64, 7) * 0.4);
                bytes[o + 3] = 255;
            }
        }
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        return texture;
    }

    // { shadows: the shadow map's size or 0, mirror: clouds and ranges in the water, drops }.
    // Rebuilds only what changed, and never the scene.
    applyQuality(quality, force = false) {
        const gl = this.gl, before = this.quality;
        this.quality = { ...quality };
        if (!gl) return;
        if (force || !this.ground || !before.shadows !== !quality.shadows) {
            for (const p of [this.ground, this.props]) if (p) gl.deleteProgram(p.program);
            this.ground = this.program('ground', WAY_SHADERS.solidVS, WAY_SHADERS.groundFS(!!quality.shadows));
            this.props = this.program('props', '#define PROPS\n' + WAY_SHADERS.solidVS, WAY_SHADERS.propFS(!!quality.shadows));
        }
        if (force || !this.water || before.mirror !== quality.mirror) {
            if (this.water) gl.deleteProgram(this.water.program);
            this.water = this.program('water', WAY_SHADERS.solidVS, WAY_SHADERS.waterFS(quality.mirror));
        }
        if (force || (this.shadowTarget ? this.shadowTarget.size : 0) !== quality.shadows) {
            if (this.shadowTarget) { gl.deleteFramebuffer(this.shadowTarget.frame); gl.deleteTexture(this.shadowTarget.texture); gl.deleteRenderbuffer(this.shadowTarget.depth); this.shadowTarget = null; }
            if (quality.shadows) {
                const size = quality.shadows, texture = gl.createTexture(), frame = gl.createFramebuffer(), depth = gl.createRenderbuffer();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
                gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
                gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
                const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                if (ok) this.shadowTarget = { size, texture, frame, depth };
            }
        }
        if (force || !this.drops || this.drops.count !== quality.drops) {
            if (this.drops) { gl.deleteBuffer(this.drops.vertices); gl.deleteBuffer(this.drops.indices); }
            const count = Math.min(quality.drops, 16000), vertices = new Float32Array(count * 4 * 6), indices = new Uint16Array(count * 6);
            const corners = [[0, -1], [0, 1], [1, 1], [1, -1]];
            for (let i = 0; i < count; i++) {
                const seed = [Math.random(), Math.random(), Math.random(), (i + 0.5) / count];
                corners.forEach((corner, c) => vertices.set([...seed, ...corner], (i * 4 + c) * 6));
                indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
            }
            this.drops = { count, vertices: this.buffer(gl.ARRAY_BUFFER, vertices), indices: this.buffer(gl.ELEMENT_ARRAY_BUFFER, indices) };
        }
    }

    // A square's triangles, handed to the GPU. Its typed arrays can then be let go.
    upload(square) {
        const gl = this.gl;
        if (!gl || square.gl) return;
        const cells = square.cells;
        if (!this.indices.has(cells)) { const data = WayModels.gridIndices(cells); this.indices.set(cells, { buffer: this.buffer(gl.ELEMENT_ARRAY_BUFFER, data), count: data.length }); }
        const cut = soup => soup && soup.n ? { buffer: this.buffer(gl.ARRAY_BUFFER, soup.B.subarray(0, soup.n * 24)), n: soup.n } : null;
        square.gl = { ground: cut(square.ground), props: cut(square.props), water: cut(square.water) };
    }
    release(square) {
        const gl = this.gl;
        if (!gl || !square.gl) return;
        for (const part of Object.values(square.gl)) if (part) gl.deleteBuffer(part.buffer);
        square.gl = null;
    }

    resize(width, height) {
        if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    }

    // The camera's own directions, and the matrix from the world about it to the screen.
    // lift raises the picture's middle by that share of the screen's height (what the host's insets leave clear).
    aim(cam, tanY, aspect, lift = 0) {
        const sh = Math.sin(cam.heading), ch = Math.cos(cam.heading), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
        const f = [sh * cp, sp, ch * cp], r = [ch, 0, -sh], u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
        const near = 0.3, far = 5000, sx = 1 / (tanY * aspect), sy = 1 / tanY, a = -(far + near) / (far - near), b = -2 * far * near / (far - near);
        this.matVP.set([sx * r[0], sy * u[0] + lift * f[0], -a * f[0], f[0], sx * r[1], sy * u[1] + lift * f[1], -a * f[1], f[1], sx * r[2], sy * u[2] + lift * f[2], -a * f[2], f[2], 0, 0, b, 0]);
        return { f, r, u, tan: [tanY * aspect, tanY], lift };
    }

    // The sun's own view of the ground about `focus` (from the camera): a square box, `reach` metres across.
    aimShadow(dir, focus, reach, size) {
        const f = [-dir[0], -dir[1], -dir[2]], rl = Math.hypot(f[2], f[0]) || 1, r = [f[2] / rl, 0, -f[0] / rl];
        const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
        // Step in whole texels, so shadows don't swim as the walk moves the box.
        const texel = reach / size, snap = v => Math.round(v / texel) * texel;
        const cx = snap(focus[0] * r[0] + focus[1] * r[1] + focus[2] * r[2]), cy = snap(focus[0] * u[0] + focus[1] * u[1] + focus[2] * u[2]), cz = focus[0] * f[0] + focus[1] * f[1] + focus[2] * f[2];
        const s = 2 / reach, deep = 260, sz = 2 / deep;
        this.matShadow.set([s * r[0], s * u[0], sz * f[0], 0, s * r[1], s * u[1], sz * f[1], 0, s * r[2], s * u[2], sz * f[2], 0, -s * cx, -s * cy, -sz * cz, 1]);
    }

    pointers(p) {
        const gl = this.gl;
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(1, 4, gl.BYTE, true, 24, 12);
        gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 24, 16);
        gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 24, 20);
        void p;
    }

    common(p, scene) {
        const gl = this.gl, l = scene.light;
        gl.uniform3fv(p.u('uZenith'), l.zenith);
        gl.uniform3fv(p.u('uHorizon'), l.horizon);
        gl.uniform3fv(p.u('uGlow'), scene.glow);
        gl.uniform3fv(p.u('uSunDir'), scene.sunDir);
        gl.uniform3fv(p.u('uLightDir'), scene.lightDir);
        gl.uniform3fv(p.u('uLight'), scene.lightCol);
        gl.uniform3fv(p.u('uFill'), l.fill);
        gl.uniform3fv(p.u('uBounce'), l.bounce);
        gl.uniform4fv(p.u('uFog'), scene.fog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.paint);
        gl.uniform1i(p.u('uPaint'), 0);
    }
    heavens(p, scene) {
        const gl = this.gl;
        gl.uniform3fv(p.u('uCloud'), scene.cloud);
        gl.uniform4fv(p.u('uCloudCol'), scene.cloudCol);
        gl.uniform2fv(p.u('uCloudOff'), scene.cloudOff);
        gl.uniform3fv(p.u('uRange'), scene.range);
    }
    solid(p, scene, lit) {
        const gl = this.gl;
        gl.useProgram(p.program);
        this.common(p, scene);
        gl.uniformMatrix4fv(p.u('uVP'), false, this.matVP);
        gl.uniform4fv(p.u('uWind'), scene.wind);
        gl.uniform1f(p.u('uWet'), scene.wet);
        gl.uniform1f(p.u('uLit'), lit);
        gl.uniform1f(p.u('uRound'), 0);
        gl.uniform2f(p.u('uGhost'), 0, 0);
        gl.uniform4fv(p.u('uCut'), scene.cut);
        gl.uniform1f(p.u('uCutY'), scene.cutY);
        gl.uniform1f(p.u('uTime'), scene.time);
        gl.uniform4fv(p.u('uLampAt[0]'), this.lampAt);
        gl.uniform4fv(p.u('uLampCol[0]'), this.lampCol);
        if (this.shadowTarget && this.quality.shadows) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.shadowTarget.texture);
            gl.uniform1i(p.u('uShadowMap'), 1);
            gl.uniformMatrix4fv(p.u('uShadowVP'), false, this.matShadow);
            gl.uniform2f(p.u('uShadow'), scene.shadow, 1 / this.shadowTarget.size);
        }
    }

    // scene: the camera, the light, the squares to draw (near and far), what moves (a soup, from the camera), sprites and weather.
    render(scene) {
        const gl = this.gl;
        if (!gl || gl.isContextLost()) return;
        const { width, height } = this.canvas, cam = scene.cam;
        const view = this.aim(cam, scene.tanY, width / height, scene.lift || 0);
        const NONE = [1, 1, -1, -1];
        this.drawn.squares = this.drawn.triangles = 0;
        for (let i = 0; i < 4; i++) {
            const lamp = scene.lamps[i];
            this.lampAt.set(lamp ? [lamp[0], lamp[1], lamp[2], 0] : [0, -999, 0, 0], i * 4);
            this.lampCol.set(lamp ? [lamp[3], lamp[4], lamp[5], lamp[6]] : [0, 0, 0, 1], i * 4);
        }
        // Which squares the camera can see: a ball about each against the view's four sides.
        const kx = Math.hypot(1, view.tan[0]), ky = Math.hypot(1, view.tan[1]);
        const seen = sq => {
            const half = sq.size / 2, x = sq.x0 + half - cam.x, y = (sq.low + sq.high) / 2 - cam.y, z = sq.z0 + half - cam.z, radius = Math.hypot(half * 1.42, (sq.high - sq.low) / 2);
            const zf = x * view.f[0] + y * view.f[1] + z * view.f[2];
            if (zf < -radius) return false;
            const xr = x * view.r[0] + y * view.r[1] + z * view.r[2], yu = x * view.u[0] + y * view.u[1] + z * view.u[2];
            return Math.abs(xr) < zf * view.tan[0] + radius * kx && Math.abs(yu) < zf * view.tan[1] * (1 + view.lift) + radius * ky;
        };
        const near = scene.near.filter(seen), far = scene.far.filter(seen);
        for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        const dynamicCount = scene.moving.n;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic);
        gl.bufferData(gl.ARRAY_BUFFER, scene.moving.B.subarray(0, dynamicCount * 24), gl.DYNAMIC_DRAW);
        const offset = (p, sq) => gl.uniform3f(p.u('uOffset'), sq.x0 - cam.x, -cam.y, sq.z0 - cam.z);
        const each = (list, part, p, draw) => {
            for (const sq of list) {
                const g = sq.gl && sq.gl[part];
                if (!g) continue;
                gl.bindBuffer(gl.ARRAY_BUFFER, g.buffer);
                this.pointers(p);
                offset(p, sq);
                draw(sq, g);
                this.drawn.squares++;
            }
        };
        const grid = (sq, g) => { const ix = this.indices.get(sq.cells); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ix.buffer); gl.drawElements(gl.TRIANGLES, ix.count, gl.UNSIGNED_SHORT, 0); this.drawn.triangles += ix.count / 3; void g; };
        const soup = (sq, g) => { gl.drawArrays(gl.TRIANGLES, 0, g.n); this.drawn.triangles += g.n / 3; };

        // ---- The sun's picture of the near ground, for shadows.
        if (this.shadowTarget && this.quality.shadows && scene.shadow > 0.01) {
            const t = this.shadowTarget, d = this.depth;
            this.aimShadow(scene.lightDir, scene.focus, scene.shadowReach, t.size);
            gl.bindFramebuffer(gl.FRAMEBUFFER, t.frame);
            gl.viewport(0, 0, t.size, t.size);
            gl.clearColor(1, 1, 1, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.useProgram(d.program);
            gl.uniformMatrix4fv(d.u('uVP'), false, this.matShadow);
            gl.uniform4fv(d.u('uWind'), scene.wind);
            const inBox = scene.near.filter(sq => Math.hypot(sq.x0 + sq.size / 2 - cam.x - scene.focus[0], sq.z0 + sq.size / 2 - cam.z - scene.focus[2]) < scene.shadowReach * 0.5 + sq.size * 0.71);
            each(inBox, 'props', d, soup);
            if (dynamicCount) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic);
                this.pointers(d);
                gl.uniform3f(d.u('uOffset'), 0, 0, 0);
                gl.drawArrays(gl.TRIANGLES, 0, dynamicCount);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        this.drawn.shadow = this.drawn.triangles;
        gl.viewport(0, 0, width, height);
        gl.clearDepth(1);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        // ---- The ground, near then far (which gives way where the near squares are).
        const hole = scene.hole ? [scene.hole[0] - cam.x, scene.hole[1] - cam.z, scene.hole[2] - cam.x, scene.hole[3] - cam.z] : NONE;
        let p = this.ground;
        this.solid(p, scene, 0);
        gl.uniform4fv(p.u('uHole'), NONE);
        each(near, 'ground', p, grid);
        gl.uniform4fv(p.u('uHole'), hole);
        each(far, 'ground', p, grid);

        // ---- What stands on it; then what moves.
        p = this.props;
        this.solid(p, scene, scene.lit);
        gl.uniform4fv(p.u('uHole'), NONE);
        each(near, 'props', p, soup);
        gl.uniform4fv(p.u('uHole'), hole);
        each(far, 'props', p, soup);
        if (dynamicCount) {
            gl.uniform4fv(p.u('uHole'), NONE);
            gl.uniform1f(p.u('uLit'), 1);
            gl.uniform1f(p.u('uRound'), 1);
            gl.uniform3f(p.u('uOffset'), 0, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic);
            this.pointers(p);
            gl.drawArrays(gl.TRIANGLES, 0, dynamicCount);
            this.drawn.triangles += dynamicCount / 3;
        }

        // ---- The sky, wherever nothing else was drawn.
        const s = this.sky;
        gl.useProgram(s.program);
        this.common(s, scene);
        this.heavens(s, scene);
        gl.uniform3fv(s.u('uRight'), view.r);
        gl.uniform3fv(s.u('uUp'), view.u);
        gl.uniform3fv(s.u('uFwd'), view.f);
        gl.uniform3f(s.u('uTan'), view.tan[0], view.tan[1], view.lift);
        gl.uniform3fv(s.u('uSunCol'), scene.sunCol);
        gl.uniform3fv(s.u('uMoon[0]'), [...scene.moons[0], ...scene.moons[1]]);
        gl.uniform3fv(s.u('uMoonCol[0]'), scene.moonCol);
        gl.uniform2f(s.u('uMoonSize'), 0.05, 0.022);
        gl.uniform1f(s.u('uStars'), scene.stars);
        gl.uniform1f(s.u('uTime'), scene.time);
        for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.triangle);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        for (let i = 1; i < 4; i++) gl.enableVertexAttribArray(i);

        // ---- Water, over its bed.
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        p = this.water;
        this.solid(p, scene, 0);
        if (this.quality.mirror) this.heavens(p, scene);
        gl.uniform3fv(p.u('uSunCol'), scene.sunCol);
        gl.uniform1f(p.u('uTime'), scene.time);
        gl.uniform2f(p.u('uUvOff'), 0, 0);
        gl.uniform4fv(p.u('uHole'), NONE);
        each(near, 'water', p, soup);
        gl.uniform4fv(p.u('uHole'), hole);
        each(far, 'water', p, soup);

        // ---- Whoever is only half there: the rogue in the shadows, the druid between two shapes.
        for (const ghost of scene.ghosts || []) {
            if (!ghost.soup.n || ghost.alpha <= 0.01) continue;
            p = this.props;
            this.solid(p, scene, 1);
            gl.uniform1f(p.u('uRound'), 1);
            gl.uniform2f(p.u('uGhost'), ghost.alpha, ghost.shimmer || 0);
            gl.uniform4fv(p.u('uHole'), NONE);
            gl.uniform3f(p.u('uOffset'), 0, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic);
            gl.bufferData(gl.ARRAY_BUFFER, ghost.soup.B.subarray(0, ghost.soup.n * 24), gl.DYNAMIC_DRAW);
            this.pointers(p);
            gl.drawArrays(gl.TRIANGLES, 0, ghost.soup.n);
            this.drawn.triangles += ghost.soup.n / 3;
        }
        gl.depthMask(false);

        // ---- Sprites: smoke and mist over what is behind them, then light added on top.
        const sp = this.sprite;
        gl.useProgram(sp.program);
        gl.uniformMatrix4fv(sp.u('uVP'), false, this.matVP);
        gl.uniform3fv(sp.u('uRight'), view.r);
        gl.uniform3fv(sp.u('uUp'), view.u);
        gl.uniform1f(sp.u('uFogK'), scene.fog[0] * 0.7);
        gl.disableVertexAttribArray(3);
        const sprites = (list, blend) => {
            if (!list.n) return;
            gl.blendFunc(gl.ONE, blend);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, list.data.subarray(0, list.n * 66), gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 44, 12);
            gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 44, 28);
            gl.drawArrays(gl.TRIANGLES, 0, list.n * 6);
        };
        sprites(scene.puffs, gl.ONE_MINUS_SRC_ALPHA);
        sprites(scene.glows, gl.ONE);

        // ---- Rain or snow.
        if (scene.fall > 0.004 && this.drops.count) {
            const f = this.fall;
            gl.useProgram(f.program);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.uniformMatrix4fv(f.u('uVP'), false, this.matVP);
            gl.uniform3fv(f.u('uBox'), this.box);
            gl.uniform3fv(f.u('uShift'), scene.fallShift);
            gl.uniform3fv(f.u('uVel'), scene.fallVel);
            gl.uniform2f(f.u('uView'), width / 2, height / 2);
            gl.uniform1f(f.u('uCount'), scene.fall);
            gl.uniform1f(f.u('uStreak'), scene.streak);
            gl.uniform1f(f.u('uSize'), scene.dropSize * height / (2 * scene.tanY));
            gl.uniform1f(f.u('uFlutter'), scene.flutter);
            gl.uniform1f(f.u('uTime'), scene.time);
            gl.uniform4fv(f.u('uTint'), scene.fallTint);
            gl.disableVertexAttribArray(2);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.drops.vertices);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.drops.indices);
            gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
            gl.drawElements(gl.TRIANGLES, this.drops.count * 6, gl.UNSIGNED_SHORT, 0);
        }
        gl.depthMask(true);
    }

    dispose() {
        this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
        this.gl = null;
    }
}

// A list of sprites for the renderer: six corners each, eleven floats a corner.
class WaySprites {
    constructor(cap = 256) { this.data = new Float32Array(cap * 66); this.n = 0; this.cap = cap; }
    clear() { this.n = 0; }
    // At (x, y, z) from the camera; size in metres; premultiplied colour and alpha; flat lies it on the ground.
    add(x, y, z, size, r, g, b, a, flat = 0) {
        if (this.n >= this.cap) return;
        const d = this.data;
        let o = this.n++ * 66;
        for (const [cx, cy] of WaySprites.CORNERS) {
            d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = cx; d[o + 4] = cy; d[o + 5] = size; d[o + 6] = flat; d[o + 7] = r; d[o + 8] = g; d[o + 9] = b; d[o + 10] = a;
            o += 11;
        }
    }
}
WaySprites.CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
