// Bing image of the day wallpaper.
// Shows Bing's daily photo (today or up to 7 days back) as the page
// background, with a small title/date overlay and a day picker with preview.
// Extracted from the homepage's WallpaperManager; the JSON archive API is
// blocked cross-origin outside the extension, hence the proxy fallbacks
// (to be replaced per host, see SPEC §4.6).

class BingWallpaperManager {
    constructor() {
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

    showConfigDialog() {
        this.showBingConfigDialog();
    }

    async loadBingWallpaper() {
        const request = ++this.wallpaperRequest;
        try {
            const config = this.loadWallpaperConfig();
            const offset = config.bingOffset || 0;
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
                console.error('❌ Failed to load Bing wallpaper');
                this.clear(); // Fallback to blank
            }
        } catch (error) {
            if (request !== this.wallpaperRequest) return;
            console.error('❌ Error loading Bing wallpaper:', error);
            this.clear(); // Fallback to blank
        }
    }

    async fetchBingImageUrl(offset = 0) {
        const bingUrl = `https://www.bing.com/HPImageArchive.aspx?format=js&idx=${offset}&n=1&mkt=en-US`;
        
        // Try direct access first (works in Chrome extensions with host_permissions)
        try {
            console.log('🔍 Trying direct access to Bing API (Chrome extension)');
            console.log(`   URL: ${bingUrl}`);
            
            const response = await fetch(bingUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            if (data && data.images && data.images.length > 0) {
                console.log('✅ Direct access successful!');
                return this.processBingImageData(data);
            } else {
                throw new Error('No images found in direct response');
            }
        } catch (error) {
            console.warn('❌ Direct access failed:', error.message);
            console.log('🔄 Falling back to CORS proxy...');
        }
        
        // Fallback to CORS proxy services if direct access fails
        const corsProxies = [
            {
                name: 'corsproxy.io',
                url: `https://corsproxy.io/?${encodeURIComponent(bingUrl)}`,
                parser: (response) => response
            },
            {
                name: 'allorigins.win',
                url: `https://api.allorigins.win/get?url=${encodeURIComponent(bingUrl)}`,
                parser: (response) => JSON.parse(response.contents)
            },
            {
                name: 'cors-anywhere (Heroku)',
                url: `https://cors-anywhere.herokuapp.com/${bingUrl}`,
                parser: (response) => response
            }
        ];
        
        for (const proxy of corsProxies) {
            try {
                console.log(`🔍 Trying CORS proxy: ${proxy.name}`);
                console.log(`   URL: ${proxy.url}`);
                
                const response = await fetch(proxy.url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const proxyData = await response.json();
                const data = proxy.parser(proxyData);
                
                if (data && data.images && data.images.length > 0) {
                    console.log(`✅ Success with ${proxy.name}`);
                    return this.processBingImageData(data);
                } else {
                    throw new Error('No images found in response');
                }
            } catch (error) {
                console.warn(`❌ ${proxy.name} failed:`, error.message);
                continue; // Try next proxy
            }
        }
        
        // If all methods fail, throw error
        throw new Error('All access methods failed (direct + CORS proxies)');
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
            bottom: 60px; /* Above status bar */
            left: 20px;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            padding: 6px 8px;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 6px;
            line-height: 1.2;
            max-width: 200px;
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
        titleRow.style.cssText = 'font-weight: 600; margin-bottom: 2px; font-size: 6.5px; color: white;';
        titleRow.textContent = this.currentBingImageInfo.title;
        const metaRow = document.createElement('div');
        metaRow.style.cssText = 'opacity: 0.9; font-size: 5.5px;';
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

    formatDateForDisplay(offset) {
        // Calculate the date for the given offset
        const today = new Date();
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - offset);
        
        // Format as MM/DD
        const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
        const day = targetDate.getDate().toString().padStart(2, '0');
        
        return `${month}/${day}`;
    }

    async loadPreviewImage(offset, previewImage, previewLoading) {
        try {
            // Show loading state
            previewLoading.style.display = 'flex';
            previewImage.style.display = 'none';
            
            // Fetch the image URL for the given offset
            const imageUrl = await this.fetchBingImageUrl(offset);
            
            if (imageUrl) {
                // Create a new image to test loading
                const testImage = new Image();
                testImage.onload = () => {
                    // Image loaded successfully
                    previewImage.src = imageUrl;
                    previewImage.style.display = 'block';
                    previewLoading.style.display = 'none';
                };
                testImage.onerror = () => {
                    // Image failed to load
                    previewLoading.textContent = 'Preview unavailable';
                    previewLoading.style.display = 'flex';
                    previewImage.style.display = 'none';
                };
                testImage.src = imageUrl;
            } else {
                throw new Error('No image URL available');
            }
        } catch (error) {
            console.error('Failed to load preview image:', error);
            previewLoading.textContent = 'Preview unavailable';
            previewLoading.style.display = 'flex';
            previewImage.style.display = 'none';
        }
    }

    showBingConfigDialog() {
        if (document.getElementById('bing-config-modal')) return; // Prevent multiple dialogs
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'bing-config-modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '1000';
        
        // Create dialog
        const dialog = document.createElement('div');
        dialog.style.backgroundColor = 'var(--dark-surface)';
        dialog.style.border = '1px solid var(--gray-700)';
        dialog.style.borderRadius = '0.5rem';
        dialog.style.padding = '1.5rem';
        dialog.style.minWidth = '400px';
        dialog.style.maxWidth = '500px';
        dialog.style.color = 'var(--light-text)';
        
        // Load current config
        const currentConfig = this.loadWallpaperConfig();
        const currentOffset = currentConfig.bingOffset || 0;
        
        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; color: var(--light-text); font-size: 1.25rem;">🌄 Bing Wallpaper Configuration</h3>
            
            <div style="margin-bottom: 1rem;">
                <p style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 0.9rem;">
                    Choose which day's Bing image to display:
                </p>
                <div style="display: flex; align-items: center; justify-content: center; gap: 1.5rem; margin: 1rem 0;">
                    <button id="bing-prev-day" style="padding: 0.75rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 1.2rem; font-weight: bold; min-width: 3rem;" title="Previous day">
                        &lt;
                    </button>
                    <div style="text-align: center; min-width: 80px;">
                        <div id="bing-current-date" style="font-size: 1.1rem; font-weight: 600; color: var(--light-text);">
                            ${this.formatDateForDisplay(currentOffset)}
                        </div>
                        <div style="font-size: 0.8rem; color: var(--gray-400); margin-top: 0.25rem;">
                            ${currentOffset === 0 ? 'Today' : currentOffset === 1 ? 'Yesterday' : `${currentOffset} days ago`}
                        </div>
                    </div>
                    <button id="bing-next-day" style="padding: 0.75rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 1.2rem; font-weight: bold; min-width: 3rem;" title="Next day">
                        &gt;
                    </button>
                </div>
                <div style="text-align: center; margin: 1rem 0;">
                    <div id="bing-preview-container" style="display: inline-block; border: 2px solid var(--gray-600); border-radius: 0.5rem; overflow: hidden; background: var(--gray-800);">
                        <img id="bing-preview-image" src="" alt="Bing wallpaper preview" style="width: 256px; height: 144px; object-fit: cover; display: none;">
                        <div id="bing-preview-loading" style="width: 256px; height: 144px; display: flex; align-items: center; justify-content: center; color: var(--gray-400); font-size: 0.9rem;">
                            Loading preview...
                        </div>
                    </div>
                </div>
                <p style="margin: 0.5rem 0 0 0; color: var(--gray-400); font-size: 0.8rem; text-align: center;">
                    Navigate through the last 7 days of Bing images
                </p>
            </div>
            
            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="cancel-bing-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Cancel
                </button>
                <button id="apply-bing-config" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Save
                </button>
            </div>
        `;
        
        modal.appendChild(dialog);
        document.body.appendChild(modal);
        
        // Add event listeners for arrow navigation
        let selectedOffset = currentConfig.bingOffset || 0;
        const maxOffset = 7;
        
        const updateDisplay = () => {
            const dateDisplay = dialog.querySelector('#bing-current-date');
            const descriptionDisplay = dialog.querySelector('#bing-current-date').nextElementSibling;
            const prevButton = dialog.querySelector('#bing-prev-day');
            const nextButton = dialog.querySelector('#bing-next-day');
            const previewImage = dialog.querySelector('#bing-preview-image');
            const previewLoading = dialog.querySelector('#bing-preview-loading');
            
            dateDisplay.textContent = this.formatDateForDisplay(selectedOffset);
            descriptionDisplay.textContent = selectedOffset === 0 ? 'Today' : selectedOffset === 1 ? 'Yesterday' : `${selectedOffset} days ago`;
            
            // Enable/disable buttons based on limits
            prevButton.disabled = selectedOffset >= maxOffset;
            nextButton.disabled = selectedOffset <= 0;
            prevButton.style.opacity = selectedOffset >= maxOffset ? '0.5' : '1';
            nextButton.style.opacity = selectedOffset <= 0 ? '0.5' : '1';
            
            // Load preview image
            this.loadPreviewImage(selectedOffset, previewImage, previewLoading);
        };
        
        // Initialize display
        updateDisplay();
        
        // Handle arrow button clicks
        dialog.querySelector('#bing-prev-day').addEventListener('click', () => {
            if (selectedOffset < maxOffset) {
                selectedOffset++;
                updateDisplay();
            }
        });
        
        dialog.querySelector('#bing-next-day').addEventListener('click', () => {
            if (selectedOffset > 0) {
                selectedOffset--;
                updateDisplay();
            }
        });
        
        // Handle button clicks
        dialog.querySelector('#cancel-bing-config').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        dialog.querySelector('#apply-bing-config').addEventListener('click', () => {
            this.saveBingConfig(selectedOffset);
            this.loadBingWallpaper(); // Reload with new offset
            document.body.removeChild(modal);
        });
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    loadWallpaperConfig() {
        const stored = localStorage.getItem('wallpaperConfig');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (error) {
                console.error('Failed to parse stored wallpaper config:', error);
            }
        }
        return { bingOffset: 0 };
    }

    saveBingConfig(offset) {
        try {
            const config = this.loadWallpaperConfig();
            config.bingOffset = offset;
            localStorage.setItem('wallpaperConfig', JSON.stringify(config));
            console.log('✅ Saved Bing config:', config);
        } catch (error) {
            console.error('Failed to save Bing config:', error);
        }
    }
}
