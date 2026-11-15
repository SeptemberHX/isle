// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The island's look: Isle's own black, glass over what is behind it, or one of Daozai's skins (cream, light
// glass, the floating cloud; see skinRules.js). What Cairo paints in the island's colour asks here; CSS does
// the rest. Settings loads it too: no shell imports.

import {isLight, mapColor, PALETTES} from './skinRules.js';

// What is behind is blurred and toned in one pass (glass.js): its lightness mapped to lo + span × l^gamma, its
// colour kept × saturation (`small` on a closed island or an alert, `large` open), a sheen and a glow added.
const LOOKS = {
    black: {fill: [0, 0, 0, 1], solid: [0, 0, 0], edge: null, blur: null},
    // Clear glass, thick at its edge: what is behind it lightly blurred, its shapes and colours still there, a little
    // darkened; a light backdrop held deeper from a fifth of the way up (a white page ends a dark grey, white text reads
    // at about 9:1); the edge bending what is behind it, its colours parting into a thin rainbow, and catching the
    // light, brightest up and left, again down and right.
    glass: {fill: [0.03, 0.04, 0.05, 0.22], solid: [0.12, 0.13, 0.15],
        edge: {color: [1, 1, 1], top: 0.16, bottom: 0.1},
        blur: {radius: 14, brightness: 1, small: 0.95, large: 1.15, lo: 0.03, span: 0.64, gamma: 1, deep: 0.52,
            knee: 0.22, sheen: 0.03, glow: 0.05, lens: 26, band: 24, spread: 0.7, rim: 0.5, rimWidth: 1.1}},
    // Cream: warm white paper, dark brown ink, orange where the theme is blue.
    cream: {fill: [1, 243 / 255, 228 / 255, 1], solid: [1, 243 / 255, 228 / 255], edge: null, blur: null},
    // Light glass: white frosted glass, what is behind it blurred well and lifted nearly to white, its colours
    // faint; near-black ink; a rim of light.
    'glass-light': {fill: [248 / 255, 248 / 255, 250 / 255, 0.3], solid: [0.93, 0.93, 0.94],
        edge: {color: [1, 1, 1], top: 0.55, bottom: 0.55},
        blur: {radius: 40, brightness: 1, small: 0.5, large: 0.6, lo: 0.7, span: 0.27, gamma: 1, deep: 0, knee: 1,
            sheen: 0.06, glow: 0, lens: 0, band: 20, spread: 0, rim: 0, rimWidth: 1.1}},
    // The floating cloud: half-clear grey, washed with the cover's colour (the controller's tint); white ink.
    fluid: {fill: [52 / 255, 52 / 255, 52 / 255, 0.52], solid: [0.2, 0.2, 0.2], edge: null, blur: null},
};

// Glass at its darkest (Settings' tint at 100): dark smoked glass, as GNOME's blurred menus look: what is behind
// blurred, its light dimmed to about two fifths and its colour kept, under a thin dark smoke; a faint rim. Every tone
// the clear glass sets is set here too, so at 100 it is this glass exactly, whatever the clear one is.
const DARK_GLASS = {fill: [0.02, 0.025, 0.03, 0.3], solid: [0.06, 0.07, 0.07],
    edge: {top: 0.07, bottom: 0.04},
    blur: {radius: 40, small: 0.7, large: 0.85, lo: 0, span: 0.48, gamma: 1, deep: 0.25, knee: 0.55, sheen: 0, glow: 0,
        lens: 0, band: 20, spread: 0, rim: 0, rimWidth: 1.1}};

let current = 'black';
/** Glass with Settings' tint applied (see `setTheme`). */
let tinted = LOOKS.glass;

const mix = (a, b, t) => a + (b - a) * t;

/** Sets the look by its Settings name (anything unknown is black), glass `tint` 0 (clear) to 100 (dark). */
export function setTheme(name, tint = 0) {
    current = name in LOOKS ? name : 'black';
    const t = Math.min(1, Math.max(0, tint / 100));
    // Not one blend: the smoke's grey comes early and the sheen goes early, the backdrop's tone late, so along the
    // slider the glass only ever greys and settles (a plain blend dipped darker than both ends halfway).
    const early = Math.sqrt(t), late = t * t;
    const ease = {sheen: early, glow: early};
    const clear = LOOKS.glass, dark = DARK_GLASS;
    tinted = {
        fill: clear.fill.map((v, i) => mix(v, dark.fill[i], i < 3 ? early : t)),
        solid: clear.solid.map((v, i) => mix(v, dark.solid[i], early)),
        edge: {...clear.edge, top: mix(clear.edge.top, dark.edge.top, t), bottom: mix(clear.edge.bottom, dark.edge.bottom, t)},
        blur: {...clear.blur, ...Object.fromEntries(Object.entries(dark.blur).map(([k, v]) => [k, mix(clear.blur[k], v, ease[k] ?? late)]))},
    };
}

/** The look in use, glass with its tint. */
const look = () => current === 'glass' ? tinted : LOOKS[current];

/** The look's name, as Settings has it. */
export function name() {
    return current;
}

/** The skin's palette, for a look whose colours are mapped from the black island's (see skinRules.js); else null. */
export function palette() {
    return PALETTES[current] ?? null;
}

/** Whether the island is light: its ink is then dark. */
export function light() {
    const colours = palette();
    return Boolean(colours) && isLight(colours);
}

/** A colour drawn for the black island (RGB in 0..1, and its alpha), as the look has it: [r, g, b, a] in 0..1.
 * On black and on glass it is as given. */
export function ink(rgb, alpha = 1) {
    const colours = palette();
    if (!colours || !isLight(colours))
        return [...rgb, alpha];
    return mapColor([...rgb.map(c => Math.round(c * 255)), Math.round(alpha * 255)], colours).map(c => c / 255);
}

/** Whether the island shows what is behind it (glass), with all on it made to match. */
export function translucent() {
    return current === 'glass';
}

/** The island's colour as RGBA in 0..1; glass lets the blur behind show through. */
export function fill() {
    return look().fill;
}

/** An opaque colour as dark as the island looks, as RGB: for rings and corners painted over it. */
export function solid() {
    return look().solid;
}

/** The rim of light round the island ({color, top, bottom}: its alpha at the top and the bottom), or null. */
export function edge() {
    return look().edge;
}

/** A signal colour (green, red, orange…) as RGB for the island: on black as it is, lifted a quarter towards white on
 * glass, whose lighter grey would dull it (an icon, a ring, a badge). */
export function semantic(rgb) {
    if (light())
        return ink(rgb).slice(0, 3);
    return current === 'glass' ? rgb.map(c => c + (1 - c) * 0.25) : rgb;
}

/** How what is behind the island is blurred and toned (see above and glass.js), or null for not at all. */
export function blur() {
    return look().blur;
}
