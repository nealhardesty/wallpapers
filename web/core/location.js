// Location controls for the panel (SPEC §10.1), loaded only for wallpapers
// that declare needs: ['location']. Two ways to say where you are:
//
//   - type a place: geocoded once by Open-Meteo's keyless geocoding API
//     (only the typed name goes to it), then kept as coordinates
//   - use this device's position: the Android app's coarse location
//     through its bridge, or the browser's Geolocation API (a prompt, in
//     secure contexts only: https, localhost, the extension)
//
// Either way it's rounded to 0.1° (about 10 km) and stored on this device
// only, as wp:location, which every wallpaper that needs a place shares.
// The stage reads it through host.location().

(function (WP) {
    'use strict';

    const { h } = WP;
    const GEOCODER = 'https://geocoding-api.open-meteo.com/v1/search';
    const SOURCES = { typed: 'typed', browser: 'from this browser', device: 'from this device' };

    const degrees = ({ lat, lon }) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}`;

    // Open-Meteo's matches for a name: [{ lat, lon, label, detail }].
    async function geocode(name) {
        const language = (navigator.language || 'en').slice(0, 2);
        const url = `${GEOCODER}?name=${encodeURIComponent(name)}&count=5&language=${language}&format=json`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`the geocoder said ${response.status}`);
        const { results = [] } = await response.json();
        return results.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)).map(r => ({
            ...WP.roundLocation(r.latitude, r.longitude),
            label: [r.name, r.country].filter(Boolean).join(', '),
            detail: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
        }));
    }

    // This device's position: the Android app answers through WP.located().
    function locate() {
        const app = window.WallpapersApp;
        if (app?.canLocate?.()) {
            return new Promise((resolve, reject) => {
                WP.located = result => {
                    WP.located = null;
                    if (Number.isFinite(result?.lat)) resolve({ ...WP.roundLocation(result.lat, result.lon), source: 'device' });
                    else reject(new Error(result?.error === 'denied' ? 'location permission was refused' : 'the phone has no recent location; try again in a minute, or type a place'));
                };
                app.locate();
            });
        }
        if (!navigator.geolocation || !window.isSecureContext) {
            return Promise.reject(new Error('this page can’t ask for your location here (it needs https or the extension); type a place instead'));
        }
        return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolve({ ...WP.roundLocation(coords.latitude, coords.longitude), source: 'browser' }),
            error => reject(new Error(error.code === 1 ? 'location permission was refused' : 'no position came back; type a place instead')),
            { maximumAge: 3600000, timeout: 20000 }));
    }

    WP.locationControls = ({ entry, onChange }) => {
        const now = h('p', { class: 'location-now' });
        const status = h('p', { class: 'location-status', 'aria-live': 'polite' });
        const results = h('div', { class: 'location-results chips', role: 'group', 'aria-label': 'Matching places' });
        const input = h('input', { type: 'text', class: 'location-input', placeholder: 'Type a town or city', 'aria-label': 'Place', autocomplete: 'off', enterkeyhint: 'search' });
        const forget = h('button', { type: 'button', class: 'action', onclick: () => save(null) }, 'Forget');
        const say = text => { status.textContent = text; };

        function save(place) {
            WP.store.set(WP.LOCATION_KEY, place);
            results.replaceChildren();
            say(place ? `Saved: ${place.label || degrees(place)}` : 'Forgotten.');
            update();
            onChange();
        }

        function update() {
            const place = WP.readLocation(WP.store.get(WP.LOCATION_KEY));
            now.textContent = place
                ? `📍 ${place.label ? `${place.label} · ` : ''}${degrees(place)} (${SOURCES[place.source]})`
                : 'Not set: it shows a generic sky for your time zone.';
            forget.hidden = !place;
        }

        async function find(event) {
            event.preventDefault();
            const name = input.value.trim();
            if (name.length < 2) return say('Type at least two letters.');
            say('Looking…');
            results.replaceChildren();
            try {
                const found = await geocode(name);
                if (!found.length) return say(`Nothing called “${name}” was found.`);
                say(found.length > 1 ? 'Which one?' : '');
                results.append(...found.map(place => h('button', {
                    type: 'button', class: 'chip', title: degrees(place),
                    onclick: () => save({ lat: place.lat, lon: place.lon, label: place.label, source: 'typed' }),
                }, place.detail)));
            } catch (error) {
                say(`Couldn’t look that up: ${error.name === 'TimeoutError' ? 'no answer' : error.message}.`);
            }
        }

        async function useDevice() {
            say('Asking…');
            try {
                const place = await locate();
                save({ ...place, label: '' });
            } catch (error) {
                say(`Couldn’t: ${error.message}.`);
            }
        }

        const element = h('details', { class: 'settings-group location', open: true },
            h('summary', {}, '📍 Location'),
            h('p', { class: 'setting-help' }, `${entry.name} needs to know roughly where you are. It’s rounded to about 10 km and kept on this device; a typed name goes once to Open-Meteo’s geocoder.`),
            now,
            h('form', { class: 'location-find', onsubmit: find },
                input,
                h('button', { type: 'submit', class: 'action' }, 'Find')),
            results,
            h('div', { class: 'actions' },
                h('button', { type: 'button', class: 'action', onclick: useDevice }, 'Use my location'),
                forget),
            status);
        update();
        return { element, update };
    };
})(globalThis.WP);
