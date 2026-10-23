// Satellites' sky maths, with no DOM, so the unit tests run it in a Node vm
// (tools/satellites.test.mjs):
//
//   - SGP4 for near-Earth orbits (period under 225 minutes), written from
//     Hoots & Roehrich, Spacetrack Report #3 (1980), as revised by Vallado,
//     Crawford, Hujsak & Kelso, "Revisiting Spacetrack Report #3" (AIAA
//     2006-6753). CelesTrak's elements are SGP4 mean elements, so this is the
//     model they're made for. Deep-space orbits are left out: none of the
//     bright satellites people see at dusk are up there.
//   - Greenwich sidereal time, the sun's position, an observer on the WGS-72
//     ellipsoid, look angles, Earth's shadow and a rough brightness.
//
// Frames: positions are TEME (true equator, mean equinox), km and km/s,
// which is close enough to "the sky of date" for a wallpaper.

const SatMath = (() => {
    'use strict';

    const TAU = Math.PI * 2, DEG = Math.PI / 180;
    // WGS-72, as the elements are fitted with.
    const RE = 6378.135, MU = 398600.8;
    const XKE = 60 / Math.sqrt(RE * RE * RE / MU);
    const J2 = 0.001082616, J3 = -0.00000253881, J4 = -0.00000165597, J3OJ2 = J3 / J2;
    const X2O3 = 2 / 3;
    const FLATTENING = 1 / 298.26;
    const mod = (x, m) => ((x % m) + m) % m;

    // One satellite from CelesTrak's JSON (OMM fields), ready to propagate.
    // Throws for deep-space orbits and nonsense.
    function init(omm) {
        const epoch = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(omm.EPOCH) ? omm.EPOCH : `${omm.EPOCH}Z`);
        const no = omm.MEAN_MOTION * TAU / 1440;   // rad/min, Kozai
        const ecco = omm.ECCENTRICITY, inclo = omm.INCLINATION * DEG;
        const nodeo = omm.RA_OF_ASC_NODE * DEG, argpo = omm.ARG_OF_PERICENTER * DEG, mo = omm.MEAN_ANOMALY * DEG;
        const bstar = omm.BSTAR || 0;
        if (!(no > 0) || !(ecco >= 0 && ecco < 1) || !Number.isFinite(epoch)) throw new Error('bad elements');

        // Recover the Brouwer mean motion and semi-major axis.
        const eccsq = ecco * ecco, omeosq = 1 - eccsq, rteosq = Math.sqrt(omeosq);
        const cosio = Math.cos(inclo), cosio2 = cosio * cosio, sinio = Math.sin(inclo);
        const ak = Math.pow(XKE / no, X2O3);
        const d1 = 0.75 * J2 * (3 * cosio2 - 1) / (rteosq * omeosq);
        let del = d1 / (ak * ak);
        const adel = ak * (1 - del * del - del * (1 / 3 + 134 * del * del / 81));
        del = d1 / (adel * adel);
        const n = no / (1 + del);
        if (TAU / n >= 225) throw new Error('deep-space orbit');
        const ao = Math.pow(XKE / n, X2O3);
        const po = ao * omeosq, posq = po * po;
        const con42 = 1 - 5 * cosio2, con41 = -con42 - cosio2 - cosio2;
        const rp = ao * (1 - ecco);
        const isimp = rp < 220 / RE + 1;

        // Drag: the atmosphere's density profile, lowered for low perigees.
        let sfour = 78 / RE + 1, qzms24 = Math.pow((120 - 78) / RE, 4);
        const perige = (rp - 1) * RE;
        if (perige < 156) {
            sfour = perige < 98 ? 20 : perige - 78;
            qzms24 = Math.pow((120 - sfour) / RE, 4);
            sfour = sfour / RE + 1;
        }
        const pinvsq = 1 / posq;
        const tsi = 1 / (ao - sfour);
        const eta = ao * ecco * tsi, etasq = eta * eta, eeta = ecco * eta;
        const psisq = Math.abs(1 - etasq);
        const coef = qzms24 * Math.pow(tsi, 4), coef1 = coef / Math.pow(psisq, 3.5);
        const cc2 = coef1 * n * (ao * (1 + 1.5 * etasq + eeta * (4 + etasq))
            + 0.375 * J2 * tsi / psisq * con41 * (8 + 3 * etasq * (8 + etasq)));
        const cc1 = bstar * cc2;
        const cc3 = ecco > 1e-4 ? -2 * coef * tsi * J3OJ2 * n * sinio / ecco : 0;
        const x1mth2 = 1 - cosio2;
        const cc4 = 2 * n * coef1 * ao * omeosq * (eta * (2 + 0.5 * etasq) + ecco * (0.5 + 2 * etasq)
            - J2 * tsi / (ao * psisq) * (-3 * con41 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta))
            + 0.75 * x1mth2 * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * argpo)));
        const cc5 = 2 * coef1 * ao * omeosq * (1 + 2.75 * (etasq + eeta) + eeta * etasq);

        // Secular rates from J2 and J4.
        const cosio4 = cosio2 * cosio2;
        const temp1 = 1.5 * J2 * pinvsq * n, temp2 = 0.5 * temp1 * J2 * pinvsq, temp3 = -0.46875 * J4 * pinvsq * pinvsq * n;
        const mdot = n + 0.5 * temp1 * rteosq * con41 + 0.0625 * temp2 * rteosq * (13 - 78 * cosio2 + 137 * cosio4);
        const argpdot = -0.5 * temp1 * con42 + 0.0625 * temp2 * (7 - 114 * cosio2 + 395 * cosio4) + temp3 * (3 - 36 * cosio2 + 49 * cosio4);
        const xhdot1 = -temp1 * cosio;
        const nodedot = xhdot1 + (0.5 * temp2 * (4 - 19 * cosio2) + 2 * temp3 * (3 - 7 * cosio2)) * cosio;

        const sat = {
            name: omm.OBJECT_NAME || '', id: omm.NORAD_CAT_ID, epoch,
            n, ecco, inclo, nodeo, argpo, mo, bstar, isimp, eta,
            con41, x1mth2, x7thm1: 7 * cosio2 - 1, cosio, sinio,
            mdot, argpdot, nodedot, cc1, cc4, cc5,
            omgcof: bstar * cc3 * Math.cos(argpo),
            xmcof: ecco > 1e-4 ? -X2O3 * coef * bstar / eeta : 0,
            nodecf: 3.5 * omeosq * xhdot1 * cc1,
            t2cof: 1.5 * cc1,
            xlcof: -0.25 * J3OJ2 * sinio * (3 + 5 * cosio) / (Math.abs(cosio + 1) > 1.5e-12 ? 1 + cosio : 1.5e-12),
            aycof: -0.5 * J3OJ2 * sinio,
            delmo: Math.pow(1 + eta * Math.cos(mo), 3), sinmao: Math.sin(mo),
            d2: 0, d3: 0, d4: 0, t3cof: 0, t4cof: 0, t5cof: 0,
        };
        if (!isimp) {
            const cc1sq = cc1 * cc1;
            sat.d2 = 4 * ao * tsi * cc1sq;
            const temp = sat.d2 * tsi * cc1 / 3;
            sat.d3 = (17 * ao + sfour) * temp;
            sat.d4 = 0.5 * temp * ao * tsi * (221 * ao + 31 * sfour) * cc1;
            sat.t3cof = sat.d2 + 2 * cc1sq;
            sat.t4cof = 0.25 * (3 * sat.d3 + cc1 * (12 * sat.d2 + 10 * cc1sq));
            sat.t5cof = 0.2 * (3 * sat.d4 + 12 * cc1 * sat.d3 + 6 * sat.d2 * sat.d2 + 15 * cc1sq * (2 * sat.d2 + cc1sq));
        }
        return sat;
    }

    // Position and velocity (TEME, km and km/s) `t` minutes from epoch, or
    // null once the orbit has decayed or the elements stop making sense.
    function sgp4(s, t) {
        const xmdf = s.mo + s.mdot * t, argpdf = s.argpo + s.argpdot * t, nodedf = s.nodeo + s.nodedot * t;
        let argpm = argpdf, mm = xmdf;
        const t2 = t * t;
        let nodem = nodedf + s.nodecf * t2;
        let tempa = 1 - s.cc1 * t, tempe = s.bstar * s.cc4 * t, templ = s.t2cof * t2;
        if (!s.isimp) {
            const delomg = s.omgcof * t;
            const delm = s.xmcof * (Math.pow(1 + s.eta * Math.cos(xmdf), 3) - s.delmo);
            mm = xmdf + delomg + delm;
            argpm = argpdf - delomg - delm;
            const t3 = t2 * t, t4 = t3 * t;
            tempa -= s.d2 * t2 + s.d3 * t3 + s.d4 * t4;
            tempe += s.bstar * s.cc5 * (Math.sin(mm) - s.sinmao);
            templ += s.t3cof * t3 + t4 * (s.t4cof + t * s.t5cof);
        }
        const am = Math.pow(XKE / s.n, X2O3) * tempa * tempa;
        const nm = XKE / Math.pow(am, 1.5);
        let em = s.ecco - tempe;
        if (!(am > 0) || em >= 1 || em < -0.001) return null;
        if (em < 1e-6) em = 1e-6;
        mm += s.n * templ;
        const xlm = mm + argpm + nodem;
        nodem = mod(nodem, TAU);
        argpm = mod(argpm, TAU);
        mm = mod(xlm - argpm - nodem, TAU);

        // Long-period periodics.
        const axnl = em * Math.cos(argpm);
        let temp = 1 / (am * (1 - em * em));
        const aynl = em * Math.sin(argpm) + temp * s.aycof;
        const xl = mm + argpm + nodem + temp * s.xlcof * axnl;

        // Kepler's equation, in the equinoctial form.
        const u = mod(xl - nodem, TAU);
        let eo1 = u, tem5 = 9999.9, sineo1 = 0, coseo1 = 0;
        for (let k = 0; Math.abs(tem5) >= 1e-12 && k < 10; k++) {
            sineo1 = Math.sin(eo1);
            coseo1 = Math.cos(eo1);
            tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / (1 - coseo1 * axnl - sineo1 * aynl);
            if (Math.abs(tem5) >= 0.95) tem5 = tem5 > 0 ? 0.95 : -0.95;
            eo1 += tem5;
        }

        // Short-period periodics.
        const ecose = axnl * coseo1 + aynl * sineo1, esine = axnl * sineo1 - aynl * coseo1;
        const el2 = axnl * axnl + aynl * aynl;
        const pl = am * (1 - el2);
        if (pl < 0) return null;
        const rl = am * (1 - ecose);
        const rdotl = Math.sqrt(am) * esine / rl, rvdotl = Math.sqrt(pl) / rl;
        const betal = Math.sqrt(1 - el2);
        temp = esine / (1 + betal);
        const sinu = am / rl * (sineo1 - aynl - axnl * temp), cosu = am / rl * (coseo1 - axnl + aynl * temp);
        let su = Math.atan2(sinu, cosu);
        const sin2u = (cosu + cosu) * sinu, cos2u = 1 - 2 * sinu * sinu;
        temp = 1 / pl;
        const temp1 = 0.5 * J2 * temp, temp2 = temp1 * temp;
        const mrt = rl * (1 - 1.5 * temp2 * betal * s.con41) + 0.5 * temp1 * s.x1mth2 * cos2u;
        if (mrt < 1) return null;
        su -= 0.25 * temp2 * s.x7thm1 * sin2u;
        const xnode = nodem + 1.5 * temp2 * s.cosio * sin2u;
        const xinc = s.inclo + 1.5 * temp2 * s.cosio * s.sinio * cos2u;
        const mvt = rdotl - nm * temp1 * s.x1mth2 * sin2u / XKE;
        const rvdot = rvdotl + nm * temp1 * (s.x1mth2 * cos2u + 1.5 * s.con41) / XKE;

        // Orientation.
        const sinsu = Math.sin(su), cossu = Math.cos(su), snod = Math.sin(xnode), cnod = Math.cos(xnode);
        const sini = Math.sin(xinc), cosi = Math.cos(xinc);
        const xmx = -snod * cosi, xmy = cnod * cosi;
        const ux = xmx * sinsu + cnod * cossu, uy = xmy * sinsu + snod * cossu, uz = sini * sinsu;
        const vx = xmx * cossu - cnod * sinsu, vy = xmy * cossu - snod * sinsu, vz = sini * cossu;
        const r = mrt * RE, vk = RE * XKE / 60;
        return {
            r: [ux * r, uy * r, uz * r],
            v: [(mvt * ux + rvdot * vx) * vk, (mvt * uy + rvdot * vy) * vk, (mvt * uz + rvdot * vz) * vk],
        };
    }

    const propagate = (sat, ms) => sgp4(sat, (ms - sat.epoch) / 60000);

    // Greenwich mean sidereal time, radians (IAU 1982, as SGP4 uses).
    function gmst(ms) {
        const t = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
        const seconds = -6.2e-6 * t * t * t + 0.093104 * t * t + (876600 * 3600 + 8640184.812866) * t + 67310.54841;
        return mod(seconds * DEG / 240, TAU);
    }

    // The sun's direction (unit vector, equator of date), accurate to about
    // 0.01° for centuries: the Astronomical Almanac's low-precision formula.
    function sun(ms) {
        const d = ms / 86400000 + 2440587.5 - 2451545;
        const g = (357.528 + 0.9856003 * d) * DEG;
        const lambda = (280.460 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
        const epsilon = (23.439 - 0.0000004 * d) * DEG;
        return [Math.cos(lambda), Math.cos(epsilon) * Math.sin(lambda), Math.sin(epsilon) * Math.sin(lambda)];
    }

    // An observer at sea level: { lat, lon } in degrees.
    function observer({ lat, lon }) {
        const phi = lat * DEG, e2 = FLATTENING * (2 - FLATTENING);
        const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
        const N = RE / Math.sqrt(1 - e2 * sinPhi * sinPhi);
        return { lat, lon, sinPhi, cosPhi, rho: N * cosPhi, z: N * (1 - e2) * sinPhi, lambda: lon * DEG };
    }

    // The observer's position at a time, TEME (km).
    function observerAt(o, ms) {
        const theta = gmst(ms) + o.lambda;
        return [o.rho * Math.cos(theta), o.rho * Math.sin(theta), o.z];
    }

    // A direction (TEME) as the observer's east, north, up, at sidereal
    // angle theta (gmst + longitude).
    function enu(o, theta, x, y, z) {
        const c = Math.cos(theta), s = Math.sin(theta);
        const south = o.sinPhi * c * x + o.sinPhi * s * y - o.cosPhi * z;
        const east = -s * x + c * y;
        const up = o.cosPhi * c * x + o.cosPhi * s * y + o.sinPhi * z;
        return [east, -south, up];
    }

    // Where a satellite is for the observer: unit east/north/up, elevation
    // and azimuth (degrees), range (km), height (km), speed (km/s), and how
    // sunlit it is (0 in Earth's shadow, 1 in full sun, a soft edge between).
    function look(o, sat, ms, sunDir = sun(ms)) {
        const state = propagate(sat, ms);
        if (!state) return null;
        const theta = gmst(ms) + o.lambda;
        const [ox, oy, oz] = [o.rho * Math.cos(theta), o.rho * Math.sin(theta), o.z];
        const [x, y, z] = state.r;
        const range = Math.hypot(x - ox, y - oy, z - oz);
        const dir = enu(o, theta, (x - ox) / range, (y - oy) / range, (z - oz) / range);
        const r = Math.hypot(x, y, z);
        // Earth's shadow as a cylinder: behind the Earth and within its radius.
        const along = x * sunDir[0] + y * sunDir[1] + z * sunDir[2];
        const off = Math.sqrt(Math.max(0, r * r - along * along));
        const lit = along > 0 ? 1 : Math.min(1, Math.max(0, (off - RE + 30) / 60));
        // The phase angle: sun–satellite–observer.
        const cosPhase = -(sunDir[0] * (x - ox) + sunDir[1] * (y - oy) + sunDir[2] * (z - oz)) / range;
        return {
            dir, el: Math.asin(dir[2]) / DEG, az: mod(Math.atan2(dir[0], dir[1]) / DEG, 360),
            range, height: r - RE, speed: Math.hypot(...state.v), lit, phase: Math.acos(Math.max(-1, Math.min(1, cosPhase))),
        };
    }

    // The sun for the observer: unit east/north/up, elevation, azimuth.
    function sunLook(o, ms, sunDir = sun(ms)) {
        const dir = enu(o, gmst(ms) + o.lambda, ...sunDir);
        return { dir, el: Math.asin(dir[2]) / DEG, az: mod(Math.atan2(dir[0], dir[1]) / DEG, 360) };
    }

    // Apparent magnitude, roughly: a diffusely reflecting sphere with the
    // object's standard magnitude at 1,000 km and half phase.
    function magnitude(standard, range, phase) {
        const f = (Math.sin(phase) + (Math.PI - phase) * Math.cos(phase)) / Math.PI;
        return standard + 5 * Math.log10(range / 1000) - 2.5 * Math.log10(Math.max(f, 1e-4) / 0.318);
    }

    // The next pass the observer can see: the satellite at least `minEl`
    // degrees up, in sunlight, against a sky darker than civil twilight.
    // Scans `hours` ahead in `step`-second steps; null if there's none.
    function nextPass(o, sat, from, { hours = 36, step = 30, minEl = 10 } = {}) {
        let pass = null;
        for (let ms = from, end = from + hours * 3600000; ms < end; ms += step * 1000) {
            const sunDir = sun(ms);
            const seen = sunLook(o, ms, sunDir).el < -6 && (() => {
                const at = look(o, sat, ms, sunDir);
                return at && at.el >= minEl && at.lit > 0.5 ? at : null;
            })();
            if (seen) {
                if (!pass) pass = { start: ms, fromAz: seen.az, maxEl: 0 };
                if (seen.el > pass.maxEl) pass.maxEl = seen.el;
                pass.end = ms;
                pass.toAz = seen.az;
            } else if (pass) {
                return pass;
            }
        }
        return pass;
    }

    return { RE, init, sgp4, propagate, gmst, sun, observer, observerAt, enu, look, sunLook, magnitude, nextPass };
})();

