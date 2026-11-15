// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The pixel shift for OLED displays (Settings → Island → Appearance): the closed island, at rest, moves a pixel to
// a side every so often, a few pixels each way, so the time and its signs do not light the same pixels for hours.
// It lessens the marks a still picture leaves on such a display; it does not promise none. Only sideways: the
// island keeps to the top edge. The idea and its numbers are Daozai's
// (https://github.com/Renly1994/xiaotang-daozai, MIT). No GNOME here: tests/extension/oledShift.test.js runs it
// under node.

/** How far the island goes to each side, in pixels of the display. */
export const MAX_SHIFT = 3;
/** How long it stays at each place. */
export const STEP_MS = 45 * 1000;

/** Where the island is after `steps` steps: 0 → MAX_SHIFT → −MAX_SHIFT → 0 and again, a pixel a step. */
export function shiftAt(steps) {
    const period = MAX_SHIFT * 4;
    const phase = ((Math.floor(steps) % period) + period) % period;
    if (phase <= MAX_SHIFT)
        return phase;
    if (phase <= MAX_SHIFT * 3)
        return MAX_SHIFT * 2 - phase;
    return phase - period;
}
