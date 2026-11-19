// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The camera levels' arithmetic (the Call page's right), apart from GNOME Shell so it can be tested: what `v4l2-ctl --list-ctrls` says a camera
// can be turned to, and what each of the levels turns it to. A level lifts brightness and gamma, and contrast
// and saturation a little so a lifted picture does not go grey, each by a share of the room the camera has above its
// own setting: the same level reads alike on cameras whose ranges differ. Settings keep a level by camera
// (`camera-levels`).

import {N_} from './i18n.js';

/** The levels, from the camera as it is made to the most lifted. */
export const LEVELS = [N_('Off'), N_('Low'), N_('Medium'), N_('High')];

/** For each control a level turns: the share of its room above the camera's own setting, by level. */
const LIFT = {
    brightness: [0, 0.2, 0.35, 0.5],
    gamma: [0, 0.1, 0.2, 0.3],
    contrast: [0, 0.05, 0.1, 0.15],
    saturation: [0, 0.05, 0.1, 0.15],
};

/** Each whole-number control in `v4l2-ctl --list-ctrls` output, by name: {min, max, step, default, value}. */
export function parseControls(text) {
    const controls = new Map();
    for (const line of text.split('\n')) {
        const match = line.match(/^\s*(\w+)\s+0x[0-9a-f]+\s+\(int\)\s*:\s*(.*)$/);
        if (!match)
            continue;
        const fields = Object.fromEntries([...match[2].matchAll(/(\w+)=(-?\d+)/g)].map(([, key, value]) => [key, Number(value)]));
        if (!['min', 'max', 'default', 'value'].every(key => Number.isFinite(fields[key])) || fields.max <= fields.min)
            continue;
        controls.set(match[1], {
            min: fields.min,
            max: fields.max,
            step: fields.step > 0 ? fields.step : 1,
            default: fields.default,
            value: fields.value,
        });
    }
    return controls;
}

/** Whether a camera with `controls` has what a level turns: brightness at least. */
export function canLift(controls) {
    return controls.has('brightness');
}

/** `value` kept within `control`'s range, on one of its steps. */
export function clampToStep(control, value) {
    const steps = Math.round((value - control.min) / control.step);
    return Math.min(control.max, Math.max(control.min, control.min + steps * control.step));
}

/** What `level` turns each control the camera has to, by name. A level out of range counts as Off. */
export function valuesFor(controls, level) {
    const values = new Map();
    for (const [name, shares] of Object.entries(LIFT)) {
        const control = controls.get(name);
        if (!control)
            continue;
        const share = shares[level] ?? 0;
        values.set(name, clampToStep(control, control.default + share * (control.max - control.default)));
    }
    return values;
}

/** The level the camera is at now, or -1 when it is set otherwise (by hand, or by another app). */
export function levelOf(controls) {
    return LEVELS.findIndex((_label, level) =>
        [...valuesFor(controls, level)].every(([name, value]) => controls.get(name).value === value));
}

/** The `name=value` pairs that bring the camera to `level`: only those not already so. */
export function pendingSettings(controls, level) {
    return [...valuesFor(controls, level)]
        .filter(([name, value]) => controls.get(name).value !== value)
        .map(([name, value]) => `${name}=${value}`);
}
