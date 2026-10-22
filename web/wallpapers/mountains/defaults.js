// Default settings for Mountains. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('mountains', {
    configVersion: 2, // Bumped when the generator changes shape meaningfully
    layers: 4, // Number of mountain ranges (0 = furthest)
    mountainsPerLayer: 3, // Peaks visible per screen width
    baseSpeed: 0.4, // Base scrolling speed (for closest layer)
    speedMultiplier: 0.6, // Speed reduction for each layer back (background slower)
    colorPalette: 'blue', // blue, purple, sunset, monochrome, green
    invertPalette: false, // false = lighter in back (haze), true = lighter in front
    mountainHeight: 0.55, // Peak height of the furthest range, as a fraction of canvas
    heightVariation: 0.35, // Random peak-to-peak height variation
    peakiness: 0.55, // Ruggedness of the ridgeline (midpoint-displacement roughness)
    ridgeLines: true, // Draw a lit ridge line along each silhouette
    snowCaps: true // Snow on the high peaks of the taller ranges
});
