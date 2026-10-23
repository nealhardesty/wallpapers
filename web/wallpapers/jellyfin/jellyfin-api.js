// A small Jellyfin API client for the wallpaper (SPEC §10.21), shaped by
// spike 9.0 against Jellyfin 12.3: every request names the client and this
// install's device; media URLs carry the token as api_key, because a
// <video> can't send headers. Nothing here logs a URL, a token or a title.

class JellyfinError extends Error {
    // kind: 'unreachable' (no answer: offline, CORS, blocked), 'auth' (401),
    // 'notJellyfin', 'http' (any other failure)
    constructor(kind, status = 0) {
        super(kind === 'http' ? `the server said ${status}` : kind);
        this.kind = kind;
        this.status = status;
    }
}

class JellyfinApi {
    // server: an origin plus any path (JellyfinLogic.normalizeServer);
    // token and userId once signed in.
    constructor({ server, deviceId, device, version, token = null, userId = null }) {
        Object.assign(this, { server, deviceId, device, version, token, userId });
    }

    header() {
        return JellyfinLogic.authHeader(this);
    }

    async request(path, { method = 'GET', body, timeout = 12000, raw = false } = {}) {
        let response;
        try {
            response = await fetch(`${this.server}${path}`, {
                method,
                headers: { Authorization: this.header(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(timeout),
                cache: 'no-store',
            });
        } catch {
            throw new JellyfinError('unreachable');
        }
        if (response.status === 401 || response.status === 403) throw new JellyfinError('auth', response.status);
        if (!response.ok) throw new JellyfinError('http', response.status);
        if (raw) return response.text();
        if (response.status === 204) return null;
        try { return await response.json(); } catch { throw new JellyfinError('notJellyfin'); }
    }

    // ---- The server and signing in ----------------------------------------------

    // { name, version } if it answers like Jellyfin.
    async info() {
        const info = await this.request('/System/Info/Public', { timeout: 8000 });
        if (!info?.Id || !info.Version || !/jellyfin/i.test(info.ProductName || 'Jellyfin')) throw new JellyfinError('notJellyfin');
        return { name: info.ServerName || 'Jellyfin', version: info.Version };
    }

    async quickConnectEnabled() {
        return (await this.request('/QuickConnect/Enabled').catch(() => false)) === true;
    }

    // { code, secret }: the code to approve in another Jellyfin app.
    async quickConnect() {
        const { Code, Secret } = await this.request('/QuickConnect/Initiate', { method: 'POST' });
        return { code: Code, secret: Secret };
    }

    async approved(secret) {
        return !!(await this.request(`/QuickConnect/Connect?secret=${encodeURIComponent(secret)}`))?.Authenticated;
    }

    // Both sign-ins end here: { token, userId, user }.
    async signInQuick(secret) {
        return this.adopt(await this.request('/Users/AuthenticateWithQuickConnect', { method: 'POST', body: { Secret: secret } }));   // audit-allow: Jellyfin API path
    }

    // The password goes to the server once, here, and is never kept.
    async signInPassword(username, password) {
        return this.adopt(await this.request('/Users/AuthenticateByName', { method: 'POST', body: { Username: username, Pw: password } }));   // audit-allow: Jellyfin API path
    }

    adopt({ AccessToken, User }) {
        this.token = AccessToken;
        this.userId = User.Id;
        return { token: AccessToken, userId: User.Id, user: User.Name };
    }

    // Revokes the token on the server (spike 9.0: at once).
    async signOut() {
        if (this.token) await this.request('/Sessions/Logout', { method: 'POST', timeout: 6000 }).catch(() => {});
        this.token = this.userId = null;
    }

    // ---- What there is to play ------------------------------------------------------

    static VIDEO_TYPES = 'Movie,Episode,MusicVideo,Video';
    static FIELDS = 'Fields=ProductionYear,RunTimeTicks,SeriesName';

    // [[id, name]] for the panel's pickers.
    async playlists() {
        const { Items = [] } = await this.request(`/Items?userId=${this.userId}&Recursive=true&IncludeItemTypes=Playlist&SortBy=SortName`);
        return Items.filter(item => !item.MediaType || item.MediaType === 'Video' || item.MediaType === 'Unknown').map(item => [item.Id, item.Name]);
    }

    async libraries() {
        const { Items = [] } = await this.request(`/UserViews?userId=${this.userId}`);
        return Items.filter(view => !['music', 'books', 'photos', 'playlists', 'livetv', 'boxsets'].includes(view.CollectionType)).map(view => [view.Id, view.Name]);
    }

    // The items for a source: { source: 'playlist'|'library'|'favorites', id, filter }.
    async items({ source, id, filter = 'all' }) {
        const user = `userId=${this.userId}`;
        if (source === 'playlist') {
            const { Items = [] } = await this.request(`/Playlists/${encodeURIComponent(id)}/Items?${user}&${JellyfinApi.FIELDS}`);
            return Items.filter(item => item.MediaType === 'Video' || JellyfinApi.VIDEO_TYPES.includes(item.Type));
        }
        const only = source === 'favorites' ? '&Filters=IsFavorite'
            : filter === 'unplayed' ? '&Filters=IsUnplayed' : filter === 'family' ? '&MaxOfficialRating=PG' : '';
        const parent = source === 'library' && id ? `&ParentId=${encodeURIComponent(id)}` : '';
        const { Items = [] } = await this.request(`/Items?${user}${parent}&IncludeItemTypes=${JellyfinApi.VIDEO_TYPES}&Recursive=true&SortBy=Random&Limit=50${only}&${JellyfinApi.FIELDS}`);
        return Items;
    }

    // PlaybackInfo: the media source and session to play `item` with.
    async playbackInfo(item, { profile, subtitleIndex = null, startSeconds = 0 }) {
        const body = { UserId: this.userId, DeviceProfile: profile, MaxStreamingBitrate: profile.MaxStreamingBitrate, AutoOpenLiveStream: false,
            EnableDirectPlay: true, EnableDirectStream: true, EnableTranscoding: true, AllowVideoStreamCopy: true, AllowAudioStreamCopy: true,
            ...(subtitleIndex !== null ? { SubtitleStreamIndex: subtitleIndex } : { SubtitleStreamIndex: -1 }),
            ...(startSeconds ? { StartTimeTicks: Math.round(startSeconds * 1e7) } : {}) };
        const info = await this.request(`/Items/${encodeURIComponent(item.Id)}/PlaybackInfo?userId=${this.userId}`, { method: 'POST', body });
        const source = info?.MediaSources?.[0];
        if (!source) throw new JellyfinError('http', 404);
        return { source, session: info.PlaySessionId };
    }

    // A text track as WebVTT, which the server converts from SRT, ASS and the rest.
    subtitles(item, source, index) {
        return this.request(`/Videos/${encodeURIComponent(item.Id)}/${encodeURIComponent(source.Id)}/Subtitles/${index}/0/Stream.vtt`, { raw: true });
    }

    // Reporting (off by default; SPEC Open questions): Playing, Progress, Stopped.
    report(kind, { item, source, session, seconds, paused = false }) {
        const path = kind === 'start' ? '/Sessions/Playing' : kind === 'progress' ? '/Sessions/Playing/Progress' : '/Sessions/Playing/Stopped';
        return this.request(path, { method: 'POST', timeout: 6000, body: { ItemId: item.Id, MediaSourceId: source.Id, PlaySessionId: session,
            PositionTicks: Math.round(seconds * 1e7), IsPaused: paused, CanSeek: true, PlayMethod: source.SupportsDirectPlay ? 'DirectPlay' : 'Transcode' } }).catch(() => {});
    }

    // Pictures, for poster mode and frames: a URL (no headers needed).
    image(item, type = 'Backdrop', width = 1280) {
        return `/Items/${encodeURIComponent(item.Id)}/Images/${type}?maxWidth=${width}&quality=80`;
    }
}
