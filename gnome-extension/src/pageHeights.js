// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// How tall each page of the open island is (Settings → Size, and the `page-heights` setting): no GNOME imports, so
// Settings loads it too and it can be tested without a shell.

/** A page's height (CSS px) at the standard size and at Large when Settings gives it none, and the least and most
 * it may be given. 210 holds the calendar's five or six weeks whole. */
export const PAGE_HEIGHT = 150;
export const LARGE_PAGE_HEIGHT = 210;
export const MIN_PAGE_HEIGHT = 150;
export const MAX_PAGE_HEIGHT = 400;

/** Every page, in tab order: each may have a height of its own. */
export const PAGE_NAMES = ['call', 'music', 'notifications', 'focus', 'reminders', 'shelf', 'calendar', 'apps', 'devices',
    'usage'];

/** The height of page `name` given the setting's `heights` (name → px): within bounds, `base` (the size's) if unset. */
export function heightOf(heights, name, base = PAGE_HEIGHT) {
    const height = heights?.[name];
    if (!Number.isFinite(height))
        return base;
    return Math.min(MAX_PAGE_HEIGHT, Math.max(MIN_PAGE_HEIGHT, Math.round(height)));
}

/** `heights` with page `name` at `height`; at `base` (the size's) it is left out, so the page follows the size. */
export function withHeight(heights, name, height, base = PAGE_HEIGHT) {
    const next = {...heights};
    const clamped = heightOf({[name]: height}, name, base);
    if (clamped === base)
        delete next[name];
    else
        next[name] = clamped;
    return next;
}
