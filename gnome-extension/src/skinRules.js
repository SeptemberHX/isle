// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian
//
// The skins' colours: the island is designed white on black, and a skin with another paper (cream, light glass)
// gets its colours from those, one by one, by `mapColor`: neutrals change places by their lightness (white text
// becomes ink, a black card becomes paper), the theme's blue becomes the skin's accent, and other colours are
// deepened until they read on the paper. The palettes and the mapping are Daozai's
// (https://github.com/Renly1994/xiaotang-daozai, src/skin_paint.rs and src/glass.rs): Copyright (c) 2026
// 小唐的Token and Daozai contributors, MIT (see NOTICE-daozai.txt). scripts/skins.mjs writes the skins' part of
// the stylesheet with it; the island's drawings ask it as they draw. No GNOME here:
// tests/extension/skinRules.test.js runs it under node.

/** A skin's palette. `paper`: what black becomes; `ink`: what white becomes; `accent`: what the theme's blue
 * becomes (null keeps colours' hues); `darkAlpha`: how solid dark blocks (cards, buttons) stay; `lift`: the
 * lightness curve of text greys (under 1 lifts them); `darken`: how much other colours are deepened; `chip`: how
 * light dark blocks become (under 1 nearer the paper). */
export const PALETTES = {
    cream: {paper: [255, 243, 228], ink: [46, 32, 22], accent: [240, 138, 36], darkAlpha: 1, lift: 1, darken: 0.78, chip: 1},
    'glass-light': {paper: [255, 255, 255], ink: [22, 22, 26], accent: [10, 112, 230], darkAlpha: 0.8, lift: 1, darken: 0.78, chip: 0.6},
    'glass-dark': {paper: [0, 0, 0], ink: [255, 255, 255], accent: null, darkAlpha: 0.5, lift: 0.6, darken: 1, chip: 1},
};

/** The island's body under each skin that paints it itself: its colour, and for the glass skins the colour the
 * backdrop is washed with. */
export const BODIES = {
    cream: [255, 243, 228],
    'glass-light': [248, 248, 250],
    'glass-dark': [28, 28, 30],
};

// The blues that are the theme's own (buttons, what is chosen, links, progress): these alone become a skin's
// accent. Daozai's, and Isle's (#0a84ff, #409cff, #64d2ff and their kin).
const BRIGHT_BLUES = [[62, 172, 248], [102, 219, 255], [82, 162, 255], [10, 132, 255], [70, 150, 255], [64, 156, 255],
    [86, 204, 242], [77, 192, 242], [100, 210, 255]];
const DEEP_BLUES = [[13, 69, 128], [15, 38, 64], [45, 105, 165], [28, 65, 100]];

const unit = color => color.map(value => value / 255);
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const mix = (from, to, t) => from.map((value, index) => value + (to[index] - value) * t);

function relLuminance(color) {
    const lin = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return 0.2126 * lin(color[0]) + 0.7152 * lin(color[1]) + 0.0722 * lin(color[2]);
}

/** WCAG contrast of two colours (each 0..1): 1 to 21. */
export function contrast(a, b) {
    const la = relLuminance(a), lb = relLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// true: one of the theme's bright blues; false: one of its deep ones; null: neither.
function themeBlue(color) {
    const near = blue => blue.every((value, index) => Math.abs(color[index] * 255 - value) <= 10);
    if (BRIGHT_BLUES.some(near))
        return true;
    if (DEEP_BLUES.some(near))
        return false;
    return null;
}

/** Whether a palette's paper is light: ink is then dark, and colours need deepening. */
export function isLight(palette) {
    return luma(unit(palette.paper)) > 0.5;
}

/** A colour drawn for the black island, as `palette` has it: [r, g, b, a], each 0..255 in and out, not
 * premultiplied. */
export function mapColor([r, g, b, a = 255], palette) {
    if (a === 0)
        return [r, g, b, 0];
    const c = unit([r, g, b]);
    const max = Math.max(...c), min = Math.min(...c);
    const paper = unit(palette.paper), ink = unit(palette.ink);
    let out, alpha = a;
    if (max - min < 0.16 || max < 0.14) {
        // A neutral: its lightness the other way round.
        let t = Math.max(0, Math.min(1, luma(c)));
        const dark = t <= 0.3;
        t = dark ? t * palette.chip : t ** palette.lift;
        out = mix(paper, ink, t);
        if (t < 0.3)
            alpha = a * palette.darkAlpha;
    } else {
        const blue = palette.accent ? themeBlue(c) : null;
        if (blue !== null) {
            // The theme's blue: the skin's accent; its deep one, the paper with some of the accent.
            const accent = unit(palette.accent);
            out = blue ? accent : mix(paper, accent, 0.28);
        } else if (isLight(palette) && max < 0.5) {
            // A dark block of a colour (a chosen button, a card): the paper with a little of its hue, so the
            // ink on it reads.
            out = mix(paper, c.map(value => value / max), 0.24);
        } else if (isLight(palette)) {
            // Any other colour (text, icons, progress): deepened until it reads on the paper, at 3 to 1.
            const seen = (color, opacity) => mix(paper, color, opacity / 255);
            out = c;
            for (let k = 0.95; k > 0.449 && contrast(seen(out, alpha), paper) < 3; k -= 0.05)
                out = c.map(value => value * k);
            // Only one that was fairly solid is made more so.
            if (a >= 110) {
                while (alpha < 255 && contrast(seen(out, alpha), paper) < 3)
                    alpha = Math.min(255, alpha * 1.15);
            }
        } else {
            out = max > 0.6 ? c.map(value => value * palette.darken) : c;
        }
    }
    return [...out.map(value => Math.round(Math.max(0, Math.min(1, value)) * 255)), Math.round(Math.max(0, Math.min(255, alpha)))];
}
