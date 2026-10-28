// Bing image of the day wallpaper.
// Shows Bing's daily photo (today or up to 7 days back) as the page
// background, with a small title and date overlay. The day is picked in the
// panel. Extracted from the homepage's WallpaperManager.

class BingWallpaperManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.currentBingImageInfo = null;
        this.bingImageInfoOverlay = null;
        this.wallpaperRequest = 0;
    }

    start() {
        this.loadBingWallpaper();
    }

    stop() {
        this.clear();
    }

    destroy() {
        this.clear();
    }

    // Removes the photo and overlay. Bumping the request counter makes a
    // late Bing response a no-op instead of replacing a newer selection.
    clear() {
        this.wallpaperRequest++;
        document.body.style.backgroundImage = 'none';
        this.hideBingImageInfo();
    }

    async loadBingWallpaper() {
        const request = ++this.wallpaperRequest;
        try {
            const offset = this.config.bingOffset || 0;
            const imageUrl = await this.fetchBingImageUrl(offset);
            if (request !== this.wallpaperRequest) return;
            
            if (imageUrl) {
                // Set background image with proper styling
                document.body.style.backgroundImage = `url(${imageUrl})`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
                document.body.style.backgroundAttachment = 'fixed';
                
                // Show image information overlay
                this.showBingImageInfo();
                
                console.log('✅ Bing wallpaper loaded:', imageUrl);
            } else {
                this.showUnavailable();
            }
        } catch (error) {
            if (request !== this.wallpaperRequest) return;
            console.warn('Bing image of the day unavailable:', error.message);
            this.showUnavailable();
        }
    }

    // Every source failed: say so, and what would help, rather than leave a
    // blank screen.
    showUnavailable() {
        this.clear();
        const fromDisk = location.protocol === 'file:';
        const note = document.createElement('div');
        note.id = 'bing-unavailable';
        note.style.cssText = `
            position: fixed; left: 20px; bottom: ${this.host.insets.bottom + 20}px; max-width: 320px;
            padding: 10px 14px; border-radius: 10px; background: rgba(16, 18, 26, 0.75);
            color: #c9cede; font: 13px/1.45 ui-rounded, system-ui, sans-serif;
        `;
        note.textContent = fromDisk
            ? 'Bing’s photo can’t be fetched from a page opened from disk. Serve the folder (make serve), or allow public proxies in this wallpaper’s settings.'
            : 'Bing’s photo can’t be reached right now. It will show once the connection is back.';
        document.body.appendChild(note);
        this.bingImageInfoOverlay = note;
    }

    // Where the archive JSON comes from depends on the host (SPEC §4.6):
    //  1. bing.json beside the page, when it's served over http(s): GitHub
    //     Pages, `make serve`, the container. `make bing-json` writes it.
    //  2. Bing itself, which only an extension (host permission) or the
    //     Android app can reach; browsers refuse it cross-origin.
    //  3. Public CORS proxies, only if this wallpaper's settings allow them.
    async fetchBingImageUrl(offset = 0) {
        const bingUrl = `https://www.bing.com/HPImageArchive.aspx?format=js&idx=${offset}&n=1&mkt=en-US`;
        const sources = [];
        if (/^(https?|wp):$/.test(location.protocol)) {
            sources.push({ name: 'bing.json', url: 'bing.json', parse: data => ({ images: data.images.slice(offset, offset + 1) }) });
        }
        sources.push({ name: 'Bing', url: bingUrl, parse: data => data });
        if (this.config.useProxies) {
            sources.push(
                { name: 'corsproxy.io', url: `https://corsproxy.io/?${encodeURIComponent(bingUrl)}`, parse: data => data },
                { name: 'allorigins.win', url: `https://api.allorigins.win/get?url=${encodeURIComponent(bingUrl)}`, parse: data => JSON.parse(data.contents) },
                { name: 'cors-anywhere', url: `https://cors-anywhere.herokuapp.com/${bingUrl}`, parse: data => data },
            );
        }

        for (const source of sources) {
            try {
                const response = await fetch(source.url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = source.parse(await response.json());
                if (data?.images?.length) return this.processBingImageData(data);
                throw new Error('no images in the response');
            } catch (error) {
                console.warn(`Bing via ${source.name} failed: ${error.message}`);
            }
        }
        throw new Error(`no source worked (tried ${sources.map(s => s.name).join(', ')})`);
    }

    processBingImageData(data) {
        if (data.images && data.images.length > 0) {
            const imageInfo = data.images[0];
            const imageUrl = `https://www.bing.com${imageInfo.url}`;
            
            // Store image info for potential display
            this.currentBingImageInfo = {
                url: imageUrl,
                copyright: imageInfo.copyright,
                copyrightlink: imageInfo.copyrightlink,
                startdate: imageInfo.startdate,
                title: imageInfo.copyright.replace(/ \(.*\)/, '')
            };
            
            console.log('📸 Bing image info:', this.currentBingImageInfo);
            return imageUrl;
        } else {
            throw new Error('No images found in Bing API response');
        }
    }

    showBingImageInfo() {
        if (!this.currentBingImageInfo) return;
        
        // Remove existing overlay if it exists
        this.hideBingImageInfo();
        
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = 'bing-image-info-overlay';
        overlay.style.cssText = `
            position: fixed;
            bottom: ${this.host.insets.bottom + 16}px;
            left: 20px;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 8px 12px;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11px;
            line-height: 1.2;
            max-width: 320px;
            z-index: 1000;
            pointer-events: auto;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        `;
        
        // Format the date
        const dateStr = this.currentBingImageInfo.startdate;
        const formattedDate = this.formatBingDate(dateStr);
        
        // Built with textContent: the title comes from Bing's JSON and must
        // never be parsed as HTML on an extension page.
        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'font-weight: 600; margin-bottom: 2px; font-size: 12px; color: white;';
        titleRow.textContent = this.currentBingImageInfo.title;
        const metaRow = document.createElement('div');
        metaRow.style.cssText = 'opacity: 0.9; font-size: 11px;';
        metaRow.append(`📅 ${formattedDate}`);
        const dot = document.createElement('span');
        dot.style.cssText = 'margin: 0 4px; opacity: 0.5;';
        dot.textContent = '•';
        const imageLink = document.createElement('a');
        imageLink.href = this.currentBingImageInfo.url;
        imageLink.style.cssText = 'color: #60a5fa; text-decoration: none;';
        imageLink.title = 'View full-size image';
        imageLink.textContent = '🖼️ Image';
        metaRow.append(dot, imageLink);
        overlay.append(titleRow, metaRow);

        // Add click handler to the entire overlay for info link
        if (/^https:\/\//.test(this.currentBingImageInfo.copyrightlink || '')) {
            overlay.style.cursor = 'pointer';
            // Format date as MM/DD from YYYYMMDD startdate
            const startDate = this.currentBingImageInfo.startdate;
            const tooltipDate = startDate ? `${startDate.substring(4, 6)}/${startDate.substring(6, 8)}` : '';
            overlay.title = tooltipDate ? `${tooltipDate} - ${this.currentBingImageInfo.title}` : this.currentBingImageInfo.title;
            overlay.addEventListener('click', (e) => {
                // Only handle clicks on the overlay itself, not on the Image link
                if (e.target === overlay || (!e.target.href && e.target.tagName !== 'A')) {
                    window.location.href = this.currentBingImageInfo.copyrightlink;
                }
            });
        }
        
        // Add to document
        document.body.appendChild(overlay);
        
        // Store reference for later removal
        this.bingImageInfoOverlay = overlay;
    }

    hideBingImageInfo() {
        if (this.bingImageInfoOverlay) {
            this.bingImageInfoOverlay.remove();
            this.bingImageInfoOverlay = null;
        }
    }

    formatBingDate(dateStr) {
        // Bing date format is YYYYMMDD
        if (!dateStr || dateStr.length !== 8) return dateStr;
        
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        
        // Create date object
        const date = new Date(year, month - 1, day);
        
        // Format as readable date
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        
        return date.toLocaleDateString('en-US', options);
    }

}
