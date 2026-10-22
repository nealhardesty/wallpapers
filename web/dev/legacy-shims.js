// Temporary stand-ins for the homepage globals the imported modules still
// expect. Phase 3 removes the coupling (SPEC §2, "Coupling to remove") and
// deletes this file.

// snow.js reads its settings from the homepage's global CONFIG. Values as
// in the homepage, except no status bar to keep clear.
var CONFIG = {
    snow: {
        treeCount: 10,
        treeScale: 1.0,
        maxSnowflakes: 100,
        spawnRate: 0.1,
        snowSpeed: 7.5,
        snowSpeedVariation: 4.0,
        layerCount: 5,
        windChance: 0.002,
        windIntensity: 15,
        windDuration: 300,
        windPhaseInDuration: 120,
        windPhaseOutDuration: 120,
        accumulationRate: 0.5,
        maxAccumulation: 80,
        statusBarHeight: 0,
        enabledMonths: [11, 0, 1, 2]
    }
};

// Settings dialogs in rain, fireflies, fireplace, neko and matrix call this
// homepage helper unguarded. Copied from the homepage, with the tooltip
// built from text nodes instead of HTML.
function createInfoIcon(description, defaultValue) {
    const icon = document.createElement('span');
    icon.textContent = 'ⓘ';
    icon.style.cssText = `
        font-size: 12px; color: var(--gray-400); cursor: help; margin-left: 5px;
        display: inline-block; width: 12px; height: 12px; text-align: center;
        line-height: 12px; position: relative; user-select: none;
    `;

    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: var(--dark-surface); border: 1px solid var(--gray-600);
        border-radius: 6px; padding: 8px 12px; color: var(--light-text);
        font-size: 12px; line-height: 1.4; max-width: 300px; white-space: normal;
        z-index: 10001; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: none; pointer-events: none;
    `;
    const title = document.createElement('div');
    title.style.cssText = 'font-weight: 500; margin-bottom: 4px;';
    title.textContent = description;
    tooltip.appendChild(title);
    if (defaultValue) {
        const value = document.createElement('div');
        value.style.cssText = 'color: var(--gray-300); font-size: 11px;';
        value.textContent = `Default: ${defaultValue}`;
        tooltip.appendChild(value);
    }

    icon.appendChild(tooltip);
    icon.addEventListener('mouseenter', () => { tooltip.style.display = 'block'; });
    icon.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    return icon;
}
