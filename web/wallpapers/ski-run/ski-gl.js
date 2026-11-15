// Fresh Tracks' view, in WebGL (SPEC §10.39): the snow, the trees, everyone
// on it, the sky, the valley's sea of cloud, tracks, spray and falling snow.
// Hand-written WebGL 1 (it runs unchanged on a WebGL 2 context); the one
// extension it needs is instancing, which is what keeps trees in their
// thousands cheap. No libraries.
//
// The ground arrives as chunks of mesh sampled from SkiLogic's height(), each
// in its own metres from its own corner; trees as lists of instances; riders
// and the lift as one soup of triangles already placed from the camera. The
// shaders only ever see positions from the camera, worked out in JavaScript's
// doubles, so an endless run never runs them out of precision.

const SKI_GLSL = {
    head: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`,
    // The sky without its lamps, the cloud lying in the valley below, the light, and the film.
    common: `
uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uLightDir, uLight, uFill, uSea;
uniform vec4 uFog;         // density; the valley cloud's top, from the camera; how far the land is drawn; mist on the hill
vec3 atmosphere(vec3 d) {
    float h = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, 1.0 - pow(1.0 - h, 3.4));
    vec2 dxz = d.xz / max(length(d.xz), 1e-4), sxz = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
    float toward = max(dot(dxz, sxz), 0.0), sd = max(dot(d, uSunDir), 0.0);
    return c + uGlow * (pow(1.0 - h, 7.0) * (0.22 + 0.78 * toward * toward * toward) * 0.6 + pow(sd, 22.0) * 0.32);
}
// What distance fades to: the sky above the horizon, the cloud below it.
vec3 backdrop(vec3 d) {
    return mix(atmosphere(normalize(vec3(d.x, max(d.y, 0.0) * 0.5 + 0.012, d.z))), uSea, smoothstep(0.01, -0.1, d.y));
}
vec3 fogged(vec3 col, vec3 rel) {
    float dist = length(rel);
    float f = 1.0 - exp(-dist * (uFog.x + uFog.w * exp(-max(rel.y + 14.0, 0.0) / 30.0)));
    f = max(f, smoothstep(uFog.y + 70.0, uFog.y - 80.0, rel.y));
    f = max(f, smoothstep(0.72, 0.98, dist / uFog.z));
    return mix(col, backdrop(rel / dist), f);
}
vec3 tone(vec3 c, vec2 px) {
    c = pow(1.0 - exp(-c), vec3(0.4545));
    return c + (fract(sin(dot(px, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}
`,
    // Floodlights near the riders: where (from the camera), and colour with reach in w.
    lamps: `
uniform vec4 uLampAt[6], uLampCol[6];
#define LAMP(i) { vec3 to = uLampAt[i].xyz - p; float d2 = dot(to, to), k = 1.0 / (1.0 + d2 / uLampCol[i].w); sum += uLampCol[i].rgb * (0.3 + 0.7 * max(dot(n, to * inversesqrt(d2 + 0.01)), 0.0)) * k * k; }
vec3 lamps(vec3 p, vec3 n) { vec3 sum = vec3(0.0); LAMP(0) LAMP(1) LAMP(2) LAMP(3) LAMP(4) LAMP(5) return sum; }
`,
    // The sun's shadows, from a picture of the scene taken from the sun: depth in three bytes.
    shadow: on => on ? `
uniform sampler2D uShadowMap;
uniform mat4 uShadowVP;
uniform vec2 uShadow;      // strength, a texel
float shadowTap(vec2 uv, float z) { return step(z, dot(texture2D(uShadowMap, uv).rgb, vec3(1.0, 1.0 / 255.0, 1.0 / 65025.0)) + 0.0016); }
float shadowed(vec3 rel, vec3 n) {
    vec4 s = uShadowVP * vec4(rel + n * 0.3, 1.0);
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
};

const SKI_SHADERS = {
    groundVS: `
precision highp float;
attribute vec3 aPos;
attribute vec2 aUV;
attribute vec4 aNormal, aMat;
uniform mat4 uVP;
uniform vec3 uOffset;
varying vec3 vRel, vNormal;
varying vec4 vMat;
varying vec2 vUV;
void main() {
    vRel = aPos + uOffset;
    vNormal = aNormal.xyz;
    vMat = aMat;
    vUV = aUV;
    gl_Position = uVP * vec4(vRel, 1.0);
}`,

    groundFS: (shadows, sparkle) => `
${SKI_GLSL.head}
varying vec3 vRel, vNormal;
varying vec4 vMat;         // groomed, ice, how steep, how wooded
varying vec2 vUV;          // metres across the run and along it
uniform sampler2D uNoise;
uniform vec2 uNoiseOff[4]; // where the camera sits in each of four tiles
uniform vec2 uCellOff;
uniform float uGmax, uSparkle, uPix;
${SKI_GLSL.common}
${SKI_GLSL.lamps}
${SKI_GLSL.shadow(shadows)}
float hOf(vec4 t) { return dot(t.rg, vec2(0.99610895, 0.00389105)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
    vec2 p = vRel.xz;
    float dist = length(vRel);
    vec3 toEye = -vRel / dist, nv = normalize(vNormal);
    // Three looks at one noise: drifts, ripples and grain. Light, not geometry; the small ones fade before they can be seen to repeat.
    vec4 t0 = texture2D(uNoise, p / 53.0 + uNoiseOff[0]), t1 = texture2D(uNoise, p / 9.7 + uNoiseOff[1]), t2 = texture2D(uNoise, p / 2.3 + uNoiseOff[2]);
    vec2 g0 = (t0.ba * 2.0 - 1.0) * uGmax / 53.0, g1 = (t1.ba * 2.0 - 1.0) * uGmax / 9.7, g2 = (t2.ba * 2.0 - 1.0) * uGmax / 2.3;
    // And a fourth, broad one: spurs and hollows on the far mountainsides, which the mesh is too coarse to carry.
    vec4 t3 = texture2D(uNoise, p / 610.0 + uNoiseOff[3]);
    float wild = smoothstep(40.0, 130.0, abs(vUV.x)) * smoothstep(120.0, 500.0, dist);
    nv = normalize(nv + vec3(-1.0, 0.0, -1.0) * vec3((t3.ba * 2.0 - 1.0) * uGmax / 610.0 * 46.0 * wild, 0.0).xzy);
    float groom = vMat.r, rough = 1.0 - 0.8 * groom;
    vec2 grad = (1.4 * g0 + 0.45 * g1 * exp(-dist / 260.0)) * rough + 0.06 * g2 * exp(-dist / 60.0) * (1.0 - 0.6 * groom);
    vec3 n = normalize(nv + vec3(-grad.x, 0.0, -grad.y));
    // Corduroy: the groomer's ridges, along the run, as long as a pixel is finer than they are.
    float cord = groom * smoothstep(0.055, 0.015, dist * uPix / max(dot(nv, toEye), 0.05)) * exp(-dist / 30.0);
    n = normalize(n + vec3(0.09 * cord * cos(vUV.x * 26.18), 0.0, 0.0));
    // Rock where it is too steep for snow to hold, ragged at its edge; blue ice on the lake where the wind has swept it.
    float steep = vMat.b * 2.0;
    float rock = smoothstep(0.98, 1.1, steep + (hOf(t0) - 0.5) * 0.4 + (hOf(t1) - 0.5) * 0.45 * exp(-dist / 400.0) + (hOf(t2) - 0.5) * 0.25 * exp(-dist / 80.0) + (hOf(t3) - 0.5) * 0.9 * wild);
    float ice = vMat.g * smoothstep(0.38, 0.5, hOf(t0) + (hOf(t1) - 0.5) * 0.2);
    vec3 stone = mix(vec3(0.07, 0.07, 0.08), vec3(0.2, 0.18, 0.165), hOf(t1)) * (0.7 + 0.6 * hOf(t0));
    vec3 albedo = vec3(0.90, 0.925, 0.96) * (0.94 + 0.06 * hOf(t0)) * (1.0 - 0.025 * cord * (0.5 + 0.5 * cos(vUV.x * 26.18 + 1.6)));
    // Tracks left by whoever came down earlier: three old lines of linked turns in the ungroomed snow, half filled in.
    float old = 0.0;
    old += smoothstep(0.22, 0.05, abs(abs(vUV.x + 9.0 - 7.0 * sin(vUV.y * 0.19635 + 0.7)) - 0.16));
    old += smoothstep(0.22, 0.05, abs(abs(vUV.x - 4.0 - 5.0 * sin(vUV.y * 0.3927 + 2.9)) - 0.16));
    old += smoothstep(0.3, 0.05, abs(vUV.x - 15.0 - 8.0 * sin(vUV.y * 0.19635 + 4.4)));
    albedo *= 1.0 - 0.1 * min(old, 1.0) * (1.0 - groom) * (1.0 - vMat.g) * smoothstep(0.25, 0.55, hOf(t0)) * exp(-dist / 120.0);
    albedo = mix(albedo, vec3(0.36, 0.55, 0.68) * (0.8 + 0.4 * hOf(t1)), ice);
    albedo = mix(albedo, stone, rock);
    // Far woods read as woods before their trees can be drawn.
    albedo = mix(albedo, vec3(0.09, 0.14, 0.12), vMat.a * 0.8 * smoothstep(420.0, 900.0, dist) * (1.0 - rock));

    float ndl = max((dot(n, uLightDir) + 0.06) / 1.06, 0.0), lit = shadowed(vRel, nv);
    vec2 sunward = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
    vec3 col = albedo * (uLight * ndl * lit + uFill * (0.55 + 0.45 * n.y) + (uHorizon + uGlow) * 0.16 * max(dot(n.xz, sunward) + 0.15, 0.0));
    // The sheen off the crust (more off groomed snow and ice), and single crystals glittering close by.
    vec3 hv = normalize(uLightDir + toEye);
    float gloss = max(dot(n, hv), 0.0), wet = (1.0 - rock) * lit;
    col += uLight * wet * (pow(gloss, 40.0) * (0.14 + 0.1 * groom) + ice * pow(gloss, 200.0) * 1.5);
    col = mix(col, atmosphere(reflect(-toEye, n)) * 0.8, ice * 0.35 * pow(1.0 - max(dot(n, toEye), 0.0), 3.0));
${sparkle ? `
    if (uSparkle > 0.0 && dist < 110.0) {
        vec2 cell = floor((p + uCellOff) * 8.0);
        float h = hash(cell), flick = fract(h * 91.7 + dot(toEye, vec3(13.0, 7.0, 17.0)) * 3.0);
        col += uLight * step(0.985, h) * pow(max(0.0, 1.0 - abs(flick - 0.5) * 9.0), 2.0) * wet * ndl * (1.0 - dist / 110.0) * uSparkle * 1.1;
    }` : ''}
    col += albedo * lamps(vRel, n);
    gl_FragColor = vec4(tone(fogged(col, vRel), gl_FragCoord.xy), 1.0);
}`,

    // Trees, riders, the hut, the lift: coloured triangles, placed one by one or by the thousand.
    solidVS: `
precision highp float;
attribute vec3 aPos;
attribute vec4 aNormal, aColour, aExtra;
attribute vec4 iA;         // an instance: where it stands (from the camera), and how tall
attribute vec4 iB;         // its turn (cos, sin), its tint, its phase
uniform mat4 uVP;
uniform vec3 uOffset;
uniform vec4 uWind;        // x, z of the gust, time, how much things sway
varying vec3 vRel, vNormal, vAt;
varying vec4 vColour, vExtra;
void main() {
    vec3 p = aPos * iA.w;
    float ph = iB.w * 6.2831853, t = uWind.z, sway = aExtra.x * uWind.w * p.y * 0.012;
    vec3 q = vec3(p.x * iB.x + p.z * iB.y, p.y, -p.x * iB.y + p.z * iB.x);
    vec3 n = vec3(aNormal.x * iB.x + aNormal.z * iB.y, aNormal.y, -aNormal.x * iB.y + aNormal.z * iB.x);
    q.xz += uWind.xy * sway * (0.6 + 0.5 * sin(t * 1.3 + ph) + 0.2 * sin(t * 3.1 + ph * 1.7));
    q += n * aExtra.z * uWind.w * sin(t * 6.0 + q.y * 2.4 + q.x * 3.0 + ph) * 0.3;
    vRel = q + iA.xyz + uOffset;
    vNormal = n;
    vAt = p;
    // Needles take the tree's own tint, from blue-green to warm.
    vec3 c = aColour.rgb * aColour.rgb;
    vColour = vec4(c * mix(vec3(1.0), mix(vec3(0.7, 0.95, 1.0), vec3(1.35, 1.2, 0.85), iB.z), aColour.a), aNormal.w);
    vExtra = aExtra;
    gl_Position = uVP * vec4(vRel, 1.0);
}`,

    solidFS: shadows => `
${SKI_GLSL.head}
varying vec3 vRel, vNormal, vAt;
varying vec4 vColour, vExtra;
uniform sampler2D uNoise;
uniform vec3 uBounce;
uniform float uLit;
${SKI_GLSL.common}
${SKI_GLSL.lamps}
${SKI_GLSL.shadow(shadows)}
void main() {
    vec3 n = normalize(vNormal), eye = normalize(-vRel);
    float dist = length(vRel), dab = texture2D(uNoise, vAt.xz * 0.37 + vAt.y * 0.23).r;
    vec3 albedo = vColour.rgb * (1.0 + (dab - 0.5) * 0.5 * exp(-dist / 120.0));
    float ao = vColour.a;
    if (vExtra.w > 0.004) {
        // Snow on a bough: thickest along its back, broken into clumps; needles between, darker in the tree's depths.
        float grain = texture2D(uNoise, vAt.xz * 1.9 + vAt.y * 1.3).r, clump = texture2D(uNoise, vAt.xz * 0.43 + vAt.y * 0.31).r;
        float lies = mix(smoothstep(0.44, 0.56, vExtra.w + (grain - 0.5) * 0.55 + (clump - 0.5) * 0.7), vExtra.w, smoothstep(60.0, 200.0, dist));
        albedo = mix(albedo * (0.55 + 0.9 * grain), vec3(0.9, 0.93, 0.97), lies);
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.4 * lies));
        ao = mix(ao, 1.0, 0.5 * lies);
    }
    float sun = shadowed(vRel, n);
    // Sun, the sky's blue from above and the snow's light from below.
    vec3 col = albedo * (uLight * max((dot(n, uLightDir) + 0.25) / 1.25, 0.0) * sun * (0.45 + 0.55 * ao) + mix(uBounce, uFill, n.y * 0.5 + 0.5) * (0.4 + 0.6 * ao));
    col += albedo * (lamps(vRel, n) + uFill * pow(1.0 - max(dot(n, eye), 0.0), 3.0) * 0.5);
    // What glows after dark: windows and lamps.
    col = mix(col, mix(vec3(1.0, 0.7, 0.34), vColour.rgb, 0.4) * 2.6, vExtra.y * uLit);
    gl_FragColor = vec4(tone(fogged(col, vRel), gl_FragCoord.xy), 1.0);
}`,

    // The picture from the sun: only depth, packed.
    depthSolidVS: `
precision highp float;
attribute vec3 aPos;
attribute vec4 iA, iB;
uniform mat4 uVP;
uniform vec3 uOffset;
varying float vDepth;
void main() {
    vec3 p = aPos * iA.w;
    gl_Position = uVP * vec4(vec3(p.x * iB.x + p.z * iB.y, p.y, -p.x * iB.y + p.z * iB.x) + iA.xyz + uOffset, 1.0);
    vDepth = gl_Position.z * 0.5 + 0.5;
}`,
    depthGroundVS: `
precision highp float;
attribute vec3 aPos;
uniform mat4 uVP;
uniform vec3 uOffset;
varying float vDepth;
void main() {
    gl_Position = uVP * vec4(aPos + uOffset, 1.0);
    vDepth = gl_Position.z * 0.5 + 0.5;
}`,
    depthFS: `
${SKI_GLSL.head}
varying float vDepth;
void main() {
    vec3 e = fract(vDepth * vec3(1.0, 255.0, 65025.0));
    gl_FragColor = vec4(e - e.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0), 1.0);
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
${SKI_GLSL.head}
varying vec3 vDir;
uniform sampler2D uNoise;
uniform vec3 uSunCol, uMoon, uMoonCol, uCloud;     // uCloud: threshold, softness, opacity
uniform vec4 uSeaAt;       // the valley cloud: how far below, and where the camera is over it; time
uniform vec2 uCloudOff;
uniform float uStars, uTime, uSunLit;
${SKI_GLSL.common}
float hOf(vec4 t) { return dot(t.rg, vec2(0.99610895, 0.00389105)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// A far range: a skyline read along rows of the noise. Broad massifs, and peaks where the second reading crosses its middle.
float ridge(float az, float row, float big, float fine) {
    float massif = hOf(texture2D(uNoise, vec2(az * 2.6, row))), peak = 1.0 - abs(2.0 * hOf(texture2D(uNoise, vec2(az * 10.0, row + 0.37))) - 1.0);
    return big * ((0.3 + 0.7 * massif) * (0.45 + 0.75 * peak * peak) + fine * hOf(texture2D(uNoise, vec2(az * 43.0, row + 0.61))));
}
void main() {
    vec3 d = normalize(vDir);
    vec3 c = atmosphere(d);
    float clear = 1.0;
    // The moon: a lit ball, so its phase is whatever the sun makes of it.
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), uMoon)), up = cross(uMoon, right);
    vec2 mq = vec2(dot(d, right), dot(d, up)) / 0.032;
    float mr = dot(mq, mq);
    vec4 moon = vec4(0.0);
    if (mr < 1.0 && dot(d, uMoon) > 0.0) {
        vec3 mn = mq.x * right + mq.y * up - sqrt(1.0 - mr) * uMoon;
        float seas = 0.6 + 0.4 * smoothstep(0.4, 0.6, hOf(texture2D(uNoise, mq * 0.12 + 0.13)));
        moon = vec4(uMoonCol * seas * (smoothstep(-0.08, 0.3, dot(mn, uSunDir)) * (0.55 + 0.45 * sqrt(1.0 - mr)) + 0.03), smoothstep(1.0, 0.92, mr));
        clear = 1.0 - moon.a;
    }
    if (uStars > 0.01 && d.y > -0.02) {
        // One star to a cell of a cube's faces; a few of them bright; the galaxy's band across.
        vec3 a = abs(d);
        vec2 uv; float face;
        if (a.y >= a.x && a.y >= a.z) { uv = d.xz / a.y; face = 0.0; }
        else if (a.x >= a.z) { uv = d.yz / a.x; face = 1.0 + step(0.0, d.x); }
        else { uv = d.xy / a.z; face = 3.0 + step(0.0, d.z); }
        vec2 g = uv * 54.0, id = floor(g) + face * 71.0, f = fract(g);
        float h = hash(id), mag = pow(hash(id + 4.1), 7.0);
        vec2 at = 0.2 + 0.6 * vec2(hash(id + 1.7), hash(id + 9.2));
        float star = step(0.42, h) * smoothstep(0.06 + 0.05 * mag, 0.0, length(f - at)) * (0.2 + 1.7 * mag);
        star *= 0.78 + 0.22 * sin(uTime * (2.0 + 5.0 * h) + h * 50.0);
        float band = exp(-pow(dot(d, vec3(0.42, 0.56, -0.71)) * 4.2, 2.0));
        float dust = band * (0.3 + 0.7 * hOf(texture2D(uNoise, uv * 0.6 + face * 0.37))) * 0.035;
        c += (mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.7), hash(id + 2.9)) * star * (1.0 + band) * 2.2 + vec3(0.6, 0.7, 1.0) * dust) * uStars * clear * smoothstep(-0.02, 0.12, d.y);
    }
    c += moon.rgb * moon.a + uMoonCol * 0.06 * pow(max(dot(d, uMoon), 0.0), 160.0) * step(0.0, uMoon.y);
    float sd = dot(d, uSunDir);
    c += uSunCol * (smoothstep(0.99985, 0.99995, sd) * 40.0 + pow(max(sd, 0.0), 900.0) * 3.0 + pow(max(sd, 0.0), 90.0) * 0.35);
    if (d.y > 0.0) {
        // Cloud: a sheet overhead, lit from the sun's side, thinning to the horizon.
        vec2 q = d.xz / (d.y + 0.11) * 0.42 + uCloudOff;
        float body = hOf(texture2D(uNoise, q * 0.21)) * 0.7 + hOf(texture2D(uNoise, q * 0.83 + 0.4)) * 0.3;
        float cover = smoothstep(uCloud.x, uCloud.x + uCloud.y, body);
        float lit = clamp(0.62 + (body - hOf(texture2D(uNoise, (q + uSunDir.xz * 0.07) * 0.21))) * 5.0, 0.2, 1.3);
        c = mix(c, uFill * 1.9 + uSunCol * uSunLit * 0.5 * lit + uHorizon * 0.25, cover * uCloud.z * smoothstep(0.0, 0.13, d.y));
    }
    // Far ranges standing out of the valley's cloud, and up the hill the mountain this run comes down from. Each
    // is a skyline with a relief read off the noise inside it: faces turned to the sun or away, rock where it is craggy.
    float az = atan(d.x, d.z) / 6.2831853, el = d.y / max(length(d.xz), 1e-3);
    float sunAz = atan(uSunDir.x, uSunDir.z) / 6.2831853, side = sin((sunAz - az) * 6.2831853);
    float uphill = smoothstep(0.25, -0.75, d.z / max(length(d.xz), 1e-3));
    vec3 haze = atmosphere(normalize(vec3(d.x, 0.03, d.z)));
    if (el < 0.34 + 0.5 * uphill) {
        for (int i = 0; i < 3; i++) {
            float fi = float(i), row = 0.23 + fi * 0.41, big = i == 2 ? 0.34 * uphill : 0.19 - fi * 0.1, off = fi * 0.31 + uSeaAt.w * (0.3 + fi);
            float r = ridge(az + off, row, big, 0.07) - 0.02 + (i == 2 ? 0.36 * uphill - 0.06 : 0.0);
            if (el > r + 0.004 || r < 0.01) continue;
            float t = clamp(el / max(r, 0.02), 0.0, 1.0);
            vec2 q = vec2(az * 41.0 + off * 3.0, t * 1.1 + row);
            float relief = hOf(texture2D(uNoise, q)), turn = (hOf(texture2D(uNoise, q + vec2(0.035, 0.0))) - hOf(texture2D(uNoise, q - vec2(0.035, 0.0)))) * 5.0;
            float broad = (ridge(az + off + 0.012, row, 1.0, 0.0) - ridge(az + off - 0.012, row, 1.0, 0.0)) * 2.5;
            float face = clamp(0.55 + (turn + broad) * side, 0.0, 1.0);
            float bare = smoothstep(0.5, 0.6, relief + 0.28 * (1.0 - t) - 0.1 * face);
            vec3 rockface = mix(vec3(0.86, 0.89, 0.94), mix(vec3(0.17, 0.18, 0.21), vec3(0.08, 0.12, 0.11), fi == 1.0 ? 1.0 : 0.0), bare * 0.85);
            vec3 lit = rockface * (uLight * face * (0.25 + 0.75 * max(uLightDir.y + 0.3, 0.0)) + uFill * 0.8 + uGlow * 0.55 * face);
            // Haze thickens towards its foot, where it stands in the valley's cloud; the near mountain is hardly hazed at all.
            float veiled = i == 2 ? 0.12 : clamp(0.24 + 0.2 * fi + 0.8 * (1.0 - smoothstep(0.0, 0.085, el)), 0.0, 1.0);
            c = mix(c, mix(lit, haze, veiled), smoothstep(r + 0.004, r - 0.002, el));
        }
    }

    if (d.y < 0.03) {
        // The valley's cloud from above: heaped, lit from the sun's side, lost in haze towards the horizon.
        float down = max(-d.y, 0.003);
        vec2 q = d.xz / down * uSeaAt.x / 5200.0 + uSeaAt.yz;
        float puff = hOf(texture2D(uNoise, q * 0.5)) * 0.62 + hOf(texture2D(uNoise, q * 1.9 + 0.3)) * 0.38;
        float lit = clamp(0.5 + (puff - hOf(texture2D(uNoise, (q + uSunDir.xz * 0.03) * 0.5))) * 6.0, 0.0, 1.2);
        vec3 sea = uSea * (0.78 + 0.3 * puff) + uLight * 0.16 * lit * puff;
        sea = mix(backdrop(normalize(vec3(d.x, -0.02, d.z))), sea, 1.0 - exp(-down * 22.0));
        c = mix(c, sea, smoothstep(0.03, -0.02, d.y));
    }
    // The air itself: haze low down on a clear day, everything in snow or fog.
    float veil = 1.0 - exp(-(uFog.x * 1.2 + uFog.w * 6.0) * 130.0 / (abs(d.y) + 0.02));
    c = mix(c, backdrop(normalize(vec3(d.x, d.y < 0.0 ? d.y : 0.0, d.z))), veil);
    gl_FragColor = vec4(tone(c, gl_FragCoord.xy), 1.0);
}`,

    // Spray, smoke, mist, glows: soft discs facing the eye (or lying on the ground).
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
    vColour = aColour * vec4(vec3(1.0), exp(-length(aPos) * uFogK));
    gl_Position = uVP * vec4(p, 1.0);
}`,
    spriteFS: `
${SKI_GLSL.head}
varying vec2 vCorner;
varying vec4 vColour;
void main() {
    float a = max(0.0, 1.0 - length(vCorner));
    a = a * a * (3.0 - 2.0 * a) * vColour.a;
    gl_FragColor = vec4(pow(1.0 - exp(-vColour.rgb), vec3(0.4545)) * a, a);
}`,

    // Tracks: ribbons laid on the snow behind every rider, darkening whatever light is on it.
    trackVS: `
precision highp float;
attribute vec3 aPos;
attribute vec3 aTrack;     // across (-1 to 1), how deep, 0 two skis or 1 a board
uniform mat4 uVP;
varying vec3 vTrack;
varying float vDist;
void main() {
    vTrack = aTrack;
    vDist = length(aPos);
    gl_Position = uVP * vec4(aPos, 1.0);
}`,
    trackFS: `
${SKI_GLSL.head}
varying vec3 vTrack;
varying float vDist;
uniform vec3 uTint;
void main() {
    float x = abs(vTrack.x);
    float skis = smoothstep(0.45, 0.6, x) * (1.0 - smoothstep(0.86, 1.0, x)), board = 1.0 - smoothstep(0.55, 1.0, x);
    float a = mix(skis, board, vTrack.z) * vTrack.y * exp(-vDist / 500.0);
    gl_FragColor = vec4(mix(vec3(1.0), uTint, a), 1.0);
}`,

    // Falling snow: a box of flakes about the eye, wrapping; each the streak it falls while the shutter is open.
    snowVS: `
precision highp float;
attribute vec4 aSeed;
attribute vec2 aCorner;
uniform mat4 uVP;
uniform vec3 uBox, uShift, uVel;
uniform vec2 uView;
uniform float uCount, uStreak, uSize, uFogK, uTime;
varying vec3 vShade;
void main() {
    vec3 p = mod(aSeed.xyz * uBox - uShift, uBox) - 0.5 * uBox;
    p.xz += 0.3 * sin(uTime * (1.0 + aSeed.w * 2.0) + aSeed.yx * 40.0);
    vec4 c0 = uVP * vec4(p, 1.0), c1 = uVP * vec4(p - uVel * uStreak, 1.0);
    if (aSeed.w > uCount || c0.w < 0.35 || c1.w < 0.35) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 a = c0.xy / c0.w, b = c1.xy / c1.w, along = (b - a) * uView;
    float len = length(along);
    vec2 dir = len > 1e-3 ? along / len : vec2(0.0, 1.0);
    float width = clamp(uSize * (0.6 + 0.8 * fract(aSeed.w * 37.0)) / c0.w, 0.9, 7.0);
    vec2 px = mix(a, b, aCorner.x) * uView + vec2(-dir.y, dir.x) * aCorner.y * width + dir * (aCorner.x * 2.0 - 1.0) * width;
    gl_Position = vec4(px / uView, mix(c0.z / c0.w, c1.z / c1.w, aCorner.x), 1.0);
    vShade = vec3(aCorner.y, aCorner.x * 2.0 - 1.0, smoothstep(0.35, 1.6, c0.w) * exp(-length(p) * uFogK) * min(1.0, (2.0 * width + 2.0) / (len + 2.0 * width)));
}`,
    snowFS: `
${SKI_GLSL.head}
varying vec3 vShade;
uniform vec3 uFlake;
void main() {
    float soft = (1.0 - vShade.x * vShade.x) * (1.0 - vShade.y * vShade.y);
    gl_FragColor = vec4(pow(1.0 - exp(-uFlake), vec3(0.4545)), soft * vShade.z);
}`,
};

// A list of sprites: six corners each, eleven floats a corner.
class SkiSprites {
    constructor(cap = 512) { this.data = new Float32Array(cap * 66); this.n = 0; this.cap = cap; }
    clear() { this.n = 0; }
    // At (x, y, z) from the camera; size in metres; colour as light and how solid; flat lies it on the ground.
    add(x, y, z, size, r, g, b, a, flat = 0) {
        if (this.n >= this.cap) return;
        const d = this.data;
        let o = this.n++ * 66;
        for (let i = 0; i < 6; i++) {
            d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = SkiSprites.CORNERS[i * 2]; d[o + 4] = SkiSprites.CORNERS[i * 2 + 1]; d[o + 5] = size; d[o + 6] = flat; d[o + 7] = r; d[o + 8] = g; d[o + 9] = b; d[o + 10] = a;
            o += 11;
        }
    }
}
SkiSprites.CORNERS = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];

class SkiRenderer {
    // noise: { n, mips, gmax } from SkiLogic.pack.
    constructor(canvas, noise) {
        this.canvas = canvas;
        this.noise = noise;
        this.gl = null;
        this.lost = false;
        this.quality = { shadows: 0, sparkle: true, flakes: 3000 };
        this.box = [48, 34, 48];
        this.matVP = new Float32Array(16);
        this.matShadow = new Float32Array(16);
        this.lampAt = new Float32Array(24);
        this.lampCol = new Float32Array(24);
        this.drawn = { triangles: 0, calls: 0 };
        this.models = new Map();
        this.batches = new Map();
    }

    // False when there is no WebGL (or no instancing) to be had.
    init() {
        // Drawn on the CPU (a VM, a remote desktop, headless Chrome), every pixel is dear: no multisampling there.
        const probe = document.createElement('canvas').getContext('webgl');
        if (!probe) return false;
        const info = probe.getExtension('WEBGL_debug_renderer_info');
        this.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(info ? String(probe.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '');
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        const options = { antialias: !this.software, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' };
        const gl = this.gl = this.canvas.getContext('webgl2', options) || this.canvas.getContext('webgl', options);
        if (!gl) return false;
        if (gl.drawArraysInstanced) this.inst = { draw: (n, count) => gl.drawArraysInstanced(gl.TRIANGLES, 0, n, count), divisor: (at, d) => gl.vertexAttribDivisor(at, d) };
        else {
            const ext = gl.getExtension('ANGLE_instanced_arrays');
            if (!ext) { this.gl = null; return false; }
            this.inst = { draw: (n, count) => ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, n, count), divisor: (at, d) => ext.vertexAttribDivisorANGLE(at, d) };
        }
        this.sky = this.program('sky', SKI_SHADERS.skyVS, SKI_SHADERS.skyFS);
        this.sprite = this.program('sprite', SKI_SHADERS.spriteVS, SKI_SHADERS.spriteFS);
        this.track = this.program('track', SKI_SHADERS.trackVS, SKI_SHADERS.trackFS);
        this.snow = this.program('snow', SKI_SHADERS.snowVS, SKI_SHADERS.snowFS);
        this.depthSolid = this.program('depth', SKI_SHADERS.depthSolidVS, SKI_SHADERS.depthFS);
        this.depthGround = this.program('depth', SKI_SHADERS.depthGroundVS, SKI_SHADERS.depthFS);
        this.noiseTex = this.texture(this.noise);
        this.triangle = this.buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
        this.dynamic = gl.createBuffer();
        this.spriteBuffer = gl.createBuffer();
        this.trackBuffer = gl.createBuffer();
        this.indices = new Map();
        // Quads in a row, for the tracks: each pair of points with the next.
        const quads = new Uint16Array(16000 * 6);
        for (let i = 0, o = 0; i < 16000; i++) { const v = i * 2; quads[o++] = v; quads[o++] = v + 1; quads[o++] = v + 2; quads[o++] = v + 1; quads[o++] = v + 3; quads[o++] = v + 2; }
        this.trackIndices = this.buffer(gl.ELEMENT_ARRAY_BUFFER, quads);
        this.models.clear();
        this.batches.clear();
        this.ground = this.solid = this.flakes = this.shadowTarget = null;
        this.applyQuality(this.quality, true);
        return true;
    }

    program(name, vs, fs) {
        const gl = this.gl, program = gl.createProgram();
        for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`ski-run ${name} shader: ${gl.getShaderInfoLog(shader)}`);
            gl.attachShader(program, shader);
        }
        // The same slots in every program, so buffers are described once.
        for (const [key, slot] of [['aPos', 0], ['aSeed', 0], ['aNormal', 1], ['aShape', 1], ['aCorner', 1], ['aTrack', 1], ['aColour', 2], ['aExtra', 3], ['iA', 4], ['iB', 5], ['aUV', 4], ['aMat', 5]]) gl.bindAttribLocation(program, slot, key);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`ski-run ${name} program: ${gl.getProgramInfoLog(program)}`);
        const uniforms = new Map();
        return { program, u: key => { if (!uniforms.has(key)) uniforms.set(key, gl.getUniformLocation(program, key)); return uniforms.get(key); } };
    }

    texture(noise) {
        const gl = this.gl, texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        noise.mips.forEach((bytes, level) => gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA, noise.n >> level, noise.n >> level, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        return texture;
    }

    buffer(target, data, usage) {
        const gl = this.gl, buffer = gl.createBuffer();
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, usage || gl.STATIC_DRAW);
        return buffer;
    }

    // { shadows: the shadow map's size or 0, sparkle, flakes }. Rebuilds only what changed, never the scene.
    applyQuality(quality, force = false) {
        const gl = this.gl, before = this.quality;
        this.quality = { ...quality };
        if (!gl) return;
        if (force || !this.ground || !before.shadows !== !quality.shadows || before.sparkle !== quality.sparkle) {
            for (const p of [this.ground, this.solid]) if (p) gl.deleteProgram(p.program);
            this.ground = this.program('ground', SKI_SHADERS.groundVS, SKI_SHADERS.groundFS(!!quality.shadows, quality.sparkle));
            this.solid = this.program('solid', SKI_SHADERS.solidVS, SKI_SHADERS.solidFS(!!quality.shadows));
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
        if (force || !this.flakes || this.flakes.count !== quality.flakes) {
            if (this.flakes) { gl.deleteBuffer(this.flakes.vertices); gl.deleteBuffer(this.flakes.indices); }
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

    // A chunk's mesh and what stands in it, handed to the GPU. Its arrays can then be let go.
    upload(chunk) {
        const gl = this.gl;
        if (!gl) return;
        if (chunk.mesh && !chunk.glGround) { chunk.glGround = { buffer: this.buffer(gl.ARRAY_BUFFER, new Uint8Array(chunk.mesh.buf)), lod: chunk.mesh.lod, level: chunk.mesh.level }; }
        if (chunk.props && chunk.props.n && !chunk.glProps) chunk.glProps = { buffer: this.buffer(gl.ARRAY_BUFFER, chunk.props.B.subarray(0, chunk.props.n * 24)), n: chunk.props.n };
    }
    // The triangles of a chunk's grid: the same for every chunk of one fineness and level of detail.
    indexOf(g) {
        const key = g.level * 4 + g.lod;
        let ix = this.indices.get(key);
        if (!ix) { const data = SkiModels.gridIndices(g.lod, g.level); ix = { buffer: this.buffer(this.gl.ELEMENT_ARRAY_BUFFER, data), count: data.length }; this.indices.set(key, ix); }
        return ix;
    }
    release(chunk, part) {
        const gl = this.gl;
        if (!gl) return;
        if ((!part || part === 'ground') && chunk.glGround) { gl.deleteBuffer(chunk.glGround.buffer); chunk.glGround = null; }
        if ((!part || part === 'props') && chunk.glProps) { gl.deleteBuffer(chunk.glProps.buffer); chunk.glProps = null; }
    }
    // A model the instances are drawn with, uploaded on first use.
    modelOf(soup) {
        let m = this.models.get(soup);
        if (!m) { m = { buffer: this.buffer(this.gl.ARRAY_BUFFER, soup.B.subarray(0, soup.n * 24)), n: soup.n }; this.models.set(soup, m); }
        return m;
    }

    resize(width, height) {
        if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    }

    // The camera's own directions, and the matrix from the world about it to the screen.
    // lift raises the picture's middle by that share of the screen's height (what the host's insets leave clear).
    aim(cam, tanY, aspect, lift = 0) {
        const sh = Math.sin(cam.heading), ch = Math.cos(cam.heading), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch), sr = Math.sin(cam.roll || 0), cr = Math.cos(cam.roll || 0);
        const f = [sh * cp, sp, ch * cp], r0 = [ch, 0, -sh];
        const u0 = [f[1] * r0[2] - f[2] * r0[1], f[2] * r0[0] - f[0] * r0[2], f[0] * r0[1] - f[1] * r0[0]];
        const r = r0.map((v, i) => v * cr - u0[i] * sr), u = u0.map((v, i) => v * cr + r0[i] * sr);
        const near = 0.35, far = 6000, sx = 1 / (tanY * aspect), sy = 1 / tanY, a = -(far + near) / (far - near), b = -2 * far * near / (far - near);
        this.matVP.set([sx * r[0], sy * u[0] + lift * f[0], -a * f[0], f[0], sx * r[1], sy * u[1] + lift * f[1], -a * f[1], f[1], sx * r[2], sy * u[2] + lift * f[2], -a * f[2], f[2], 0, 0, b, 0]);
        return { f, r, u, tan: [tanY * aspect, tanY], lift };
    }

    // The sun's own view of the ground about `focus` (from the camera): a square box, `reach` metres across.
    aimShadow(dir, focus, reach, size) {
        const f = [-dir[0], -dir[1], -dir[2]], rl = Math.hypot(f[2], f[0]) || 1, r = [f[2] / rl, 0, -f[0] / rl];
        const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
        const cx = focus[0] * r[0] + focus[1] * r[1] + focus[2] * r[2], cy = focus[0] * u[0] + focus[1] * u[1] + focus[2] * u[2], cz = focus[0] * f[0] + focus[1] * f[1] + focus[2] * f[2];
        const s = 2 / reach, sz = 2 / 500;
        this.matShadow.set([s * r[0], s * u[0], sz * f[0], 0, s * r[1], s * u[1], sz * f[1], 0, s * r[2], s * u[2], sz * f[2], 0, -s * cx, -s * cy, -sz * cz, 1]);
        void size;
    }

    solidPointers() {
        const gl = this.gl;
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(1, 4, gl.BYTE, true, 24, 12);
        gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 24, 16);
        gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 24, 20);
    }
    groundPointers() {
        const gl = this.gl;
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
        gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 28, 12);
        gl.vertexAttribPointer(1, 4, gl.BYTE, true, 28, 20);
        gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, 28, 24);
    }
    // Which attribute slots read from buffers for the next draw: these, and no others.
    only(...slots) {
        const gl = this.gl;
        for (let i = 0; i < 6; i++) { if (slots.includes(i)) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i); }
        // One of anything has no instances: its instance slots hold "here, life-size, unturned".
        if (!slots.includes(4)) { gl.vertexAttrib4f(4, 0, 0, 0, 1); gl.vertexAttrib4f(5, 1, 0, 0.5, 0); }
    }

    common(p, scene) {
        const gl = this.gl, l = scene.light;
        gl.uniform3fv(p.u('uZenith'), l.zenith);
        gl.uniform3fv(p.u('uHorizon'), l.horizon);
        gl.uniform3fv(p.u('uGlow'), l.glow);
        gl.uniform3fv(p.u('uSunDir'), scene.sunDir);
        gl.uniform3fv(p.u('uLightDir'), scene.lightDir);
        gl.uniform3fv(p.u('uLight'), scene.lightCol);
        gl.uniform3fv(p.u('uFill'), l.fill);
        gl.uniform3fv(p.u('uSea'), scene.sea);
        gl.uniform4fv(p.u('uFog'), scene.fog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
        gl.uniform1i(p.u('uNoise'), 0);
    }
    lit(p, scene) {
        const gl = this.gl;
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

    // Trees by the batch: instances (eight floats each) of one model.
    drawBatches(p, batches, shadowPass) {
        const gl = this.gl, own = shadowPass ? [0] : [0, 1, 2, 3];
        this.only(...own, 4, 5);
        this.inst.divisor(4, 1);
        this.inst.divisor(5, 1);
        gl.uniform3fv(p.u('uOffset'), this.treeOff);
        for (const b of batches) {
            if (!b.n || shadowPass && !b.shadow) continue;
            const model = this.modelOf(shadowPass && b.shadowModel ? b.shadowModel : b.model);
            let buffer = this.batches.get(b);
            if (!buffer) { buffer = gl.createBuffer(); this.batches.set(b, buffer); }
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            if (b.dirty) gl.bufferData(gl.ARRAY_BUFFER, b.data.subarray(0, b.n * 8), gl.DYNAMIC_DRAW);
            b.dirty = false;
            gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 0);
            gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 16);
            gl.bindBuffer(gl.ARRAY_BUFFER, model.buffer);
            if (shadowPass) gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); else this.solidPointers();
            this.inst.draw(model.n, b.n);
            if (!shadowPass) { this.drawn.triangles += model.n / 3 * b.n; this.drawn.calls++; }
        }
        this.inst.divisor(4, 0);
        this.inst.divisor(5, 0);
        this.only(...own);
    }

    // scene: the camera, the light, the chunks to draw, the trees by the batch, what moves (a soup, from the camera), sprites, tracks and weather.
    render(scene) {
        const gl = this.gl;
        if (!gl || gl.isContextLost()) return;
        const { width, height } = this.canvas, cam = scene.cam;
        const view = this.aim(cam, scene.tanY, width / height, scene.lift || 0);
        this.drawn.triangles = this.drawn.calls = 0;
        for (let i = 0; i < 6; i++) {
            const lamp = scene.lamps[i];
            this.lampAt.set(lamp ? [lamp[0], lamp[1], lamp[2], 0] : [0, -999, 0, 0], i * 4);
            this.lampCol.set(lamp ? [lamp[3], lamp[4], lamp[5], lamp[6]] : [0, 0, 0, 1], i * 4);
        }
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        this.treeOff = scene.treeOff || [0, 0, 0];
        const moving = scene.moving.n;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic);
        gl.bufferData(gl.ARRAY_BUFFER, scene.moving.B.subarray(0, moving * 24), gl.DYNAMIC_DRAW);
        const offset = (p, c) => gl.uniform3f(p.u('uOffset'), c.x - cam.x, c.y - cam.y, c.z - cam.z);

        // ---- The sun's picture of the ground about the riders, for shadows.
        const shadows = this.shadowTarget && this.quality.shadows && scene.shadow > 0.01;
        if (shadows) {
            const t = this.shadowTarget;
            this.aimShadow(scene.lightDir, scene.focus, scene.shadowReach, t.size);
            gl.bindFramebuffer(gl.FRAMEBUFFER, t.frame);
            gl.viewport(0, 0, t.size, t.size);
            gl.clearColor(1, 1, 1, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            this.only(0);
            let p = this.depthGround;
            gl.useProgram(p.program);
            gl.uniformMatrix4fv(p.u('uVP'), false, this.matShadow);
            for (const c of scene.chunks) {
                if (!c.glGround || !c.inShadow) continue;
                gl.bindBuffer(gl.ARRAY_BUFFER, c.glGround.buffer);
                gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
                offset(p, c);
                const ix = this.indexOf(c.glGround);
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ix.buffer);
                gl.drawElements(gl.TRIANGLES, ix.count, gl.UNSIGNED_SHORT, 0);
            }
            p = this.depthSolid;
            gl.useProgram(p.program);
            gl.uniformMatrix4fv(p.u('uVP'), false, this.matShadow);
            for (const c of scene.chunks) {
                if (!c.glProps || !c.inShadow) continue;
                gl.bindBuffer(gl.ARRAY_BUFFER, c.glProps.buffer);
                gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
                offset(p, c);
                gl.drawArrays(gl.TRIANGLES, 0, c.glProps.n);
            }
            if (moving) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic);
                gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
                gl.uniform3f(p.u('uOffset'), 0, 0, 0);
                gl.drawArrays(gl.TRIANGLES, 0, moving);
            }
            this.drawBatches(p, scene.batches, true);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.viewport(0, 0, width, height);
        gl.clearDepth(1);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        // ---- The ground, nearest first so most of the rest is hidden behind it.
        let p = this.ground;
        gl.useProgram(p.program);
        this.common(p, scene);
        this.lit(p, scene);
        gl.uniformMatrix4fv(p.u('uVP'), false, this.matVP);
        gl.uniform1f(p.u('uGmax'), this.noise.gmax);
        gl.uniform1f(p.u('uSparkle'), scene.sparkle);
        gl.uniform1f(p.u('uPix'), 2 * scene.tanY / height);
        const frac = (v, size) => { const q = v / size; return q - Math.floor(q); };
        gl.uniform2fv(p.u('uNoiseOff[0]'), [frac(cam.x, 53), frac(cam.z, 53), frac(cam.x, 9.7), frac(cam.z, 9.7), frac(cam.x, 2.3), frac(cam.z, 2.3), frac(cam.x, 610), frac(cam.z, 610)]);
        gl.uniform2f(p.u('uCellOff'), cam.x - Math.floor(cam.x / 64) * 64, cam.z - Math.floor(cam.z / 64) * 64);
        this.only(0, 1, 4, 5);
        for (const c of scene.chunks) {
            if (!c.glGround || !c.seen) continue;
            gl.bindBuffer(gl.ARRAY_BUFFER, c.glGround.buffer);
            this.groundPointers();
            offset(p, c);
            const ix = this.indexOf(c.glGround);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ix.buffer);
            gl.drawElements(gl.TRIANGLES, ix.count, gl.UNSIGNED_SHORT, 0);
            this.drawn.triangles += ix.count / 3;
            this.drawn.calls++;
        }

        // ---- Tracks, pressed into it.
        if (scene.tracks.n > 1) {
            const t = this.track;
            gl.useProgram(t.program);
            gl.uniformMatrix4fv(t.u('uVP'), false, this.matVP);
            gl.uniform3fv(t.u('uTint'), scene.trackTint);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.DST_COLOR, gl.ZERO);
            gl.depthMask(false);
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(-2, -2);
            this.only(0, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.trackBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, scene.tracks.data.subarray(0, scene.tracks.n * 6), gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.trackIndices);
            gl.drawElements(gl.TRIANGLES, Math.min(16000, scene.tracks.n / 2 - 1) * 6, gl.UNSIGNED_SHORT, 0);
            this.drawn.triangles += scene.tracks.n - 2;
            this.drawn.calls++;
            gl.disable(gl.POLYGON_OFFSET_FILL);
            gl.disable(gl.BLEND);
            gl.depthMask(true);
        }

        // ---- What stands on it, what grows on it, and who is skiing it.
        p = this.solid;
        gl.useProgram(p.program);
        this.common(p, scene);
        this.lit(p, scene);
        gl.uniformMatrix4fv(p.u('uVP'), false, this.matVP);
        gl.uniform4fv(p.u('uWind'), scene.wind);
        gl.uniform3fv(p.u('uBounce'), scene.bounce);
        gl.uniform1f(p.u('uLit'), scene.lit);
        this.only(0, 1, 2, 3);
        for (const c of scene.chunks) {
            if (!c.glProps || !c.seen) continue;
            gl.bindBuffer(gl.ARRAY_BUFFER, c.glProps.buffer);
            this.solidPointers();
            offset(p, c);
            gl.drawArrays(gl.TRIANGLES, 0, c.glProps.n);
            this.drawn.triangles += c.glProps.n / 3;
            this.drawn.calls++;
        }
        if (moving) {
            gl.uniform3f(p.u('uOffset'), 0, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic);
            this.solidPointers();
            gl.drawArrays(gl.TRIANGLES, 0, moving);
            this.drawn.triangles += moving / 3;
            this.drawn.calls++;
        }
        this.drawBatches(p, scene.batches, false);

        // ---- The sky, wherever nothing else was drawn.
        const s = this.sky;
        gl.useProgram(s.program);
        this.common(s, scene);
        gl.uniform3fv(s.u('uRight'), view.r);
        gl.uniform3fv(s.u('uUp'), view.u);
        gl.uniform3fv(s.u('uFwd'), view.f);
        gl.uniform3f(s.u('uTan'), view.tan[0], view.tan[1], view.lift);
        gl.uniform3fv(s.u('uSunCol'), scene.sunCol);
        gl.uniform3fv(s.u('uMoon'), scene.moon);
        gl.uniform3fv(s.u('uMoonCol'), scene.moonCol);
        gl.uniform3fv(s.u('uCloud'), scene.cloud);
        gl.uniform2fv(s.u('uCloudOff'), scene.cloudOff);
        gl.uniform4fv(s.u('uSeaAt'), scene.seaAt);
        gl.uniform1f(s.u('uStars'), scene.stars);
        gl.uniform1f(s.u('uTime'), scene.time);
        gl.uniform1f(s.u('uSunLit'), scene.sunLit);
        this.only(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.triangle);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.drawn.calls++;
        this.only(0, 1, 2);

        // ---- Sprites: spray and smoke over what is behind them, then light added on top.
        gl.enable(gl.BLEND);
        gl.depthMask(false);
        const sp = this.sprite;
        gl.useProgram(sp.program);
        gl.uniformMatrix4fv(sp.u('uVP'), false, this.matVP);
        gl.uniform3fv(sp.u('uRight'), view.r);
        gl.uniform3fv(sp.u('uUp'), view.u);
        gl.uniform1f(sp.u('uFogK'), scene.fog[0] * 0.8);
        const sprites = (list, blend) => {
            if (!list.n) return;
            gl.blendFunc(gl.ONE, blend);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, list.data.subarray(0, list.n * 66), gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 44, 12);
            gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 44, 28);
            gl.drawArrays(gl.TRIANGLES, 0, list.n * 6);
            this.drawn.triangles += list.n * 2;
            this.drawn.calls++;
        };
        sprites(scene.puffs, gl.ONE_MINUS_SRC_ALPHA);
        sprites(scene.glows, gl.ONE);

        // ---- Falling snow.
        if (scene.flakes > 0.004 && this.flakes.count) {
            const f = this.snow;
            gl.useProgram(f.program);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.uniformMatrix4fv(f.u('uVP'), false, this.matVP);
            gl.uniform3fv(f.u('uBox'), this.box);
            gl.uniform3fv(f.u('uShift'), scene.snowShift);
            gl.uniform3fv(f.u('uVel'), scene.snowVel);
            gl.uniform2f(f.u('uView'), width / 2, height / 2);
            gl.uniform1f(f.u('uCount'), scene.flakes);
            gl.uniform1f(f.u('uStreak'), scene.streak);
            gl.uniform1f(f.u('uSize'), 0.05 * height / (2 * scene.tanY));
            gl.uniform1f(f.u('uFogK'), scene.fog[0]);
            gl.uniform1f(f.u('uTime'), scene.time);
            gl.uniform3fv(f.u('uFlake'), scene.flakeCol);
            this.only(0, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.flakes.vertices);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.flakes.indices);
            gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
            gl.drawElements(gl.TRIANGLES, this.flakes.count * 6, gl.UNSIGNED_SHORT, 0);
            this.drawn.calls++;
        }
        gl.depthMask(true);
    }

    dispose() {
        this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
        this.gl = null;
    }
}
