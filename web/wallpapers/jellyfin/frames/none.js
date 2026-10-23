// No frame: the video full-bleed, contained or cropped to cover (setting
// `fit`). The cheapest frame: nothing to paint and nothing that moves.

JellyfinFrames.add({
    id: 'none',
    name: 'None',
    icon: '⬛',

    layout(w, h) {
        return { screen: { x: 0, y: 0, w, h, radius: 0 } };
    },

    paint() {},

    // A quiet dark screen with a line of text, rather than bars.
    idle(ctx, { screen }, env, kind) {
        const [title, detail] = JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup;
        const glow = ctx.createRadialGradient(screen.w / 2, screen.h * 0.45, 0, screen.w / 2, screen.h * 0.45, Math.max(screen.w, screen.h) * 0.6);
        glow.addColorStop(0, '#1d1430');
        glow.addColorStop(1, '#05040a');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, screen.w, screen.h);
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(214, 196, 255, 0.85)';
        ctx.font = `600 ${Math.max(16, Math.min(28, screen.w / 30))}px system-ui, sans-serif`;
        ctx.fillText(title.charAt(0) + title.slice(1).toLowerCase(), screen.w / 2, screen.h * 0.45);
        if (detail) {
            ctx.fillStyle = 'rgba(190, 180, 220, 0.6)';
            ctx.font = `400 ${Math.max(12, Math.min(16, screen.w / 50))}px system-ui, sans-serif`;
            ctx.fillText(detail, screen.w / 2, screen.h * 0.45 + 30);
        }
    },

    cue(ctx, text, { screen }, env) {
        const visible = { ...screen, h: screen.h - env.insets.bottom };
        JellyfinFrames.drawCue(ctx, text, visible, { box: null, outline: 'rgba(0,0,0,0.85)', bottom: 0.07 });
    },
});
