// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// How tall each page of the open island is (the `page-heights` setting): no GNOME imports, so Settings
// loads it too and it can be tested without a shell.

/** A page's height (CSS px) when Settings gives it none, and the least and most it may be given. */
export const PAGE_HEIGHT = 150;
export const MIN_PAGE_HEIGHT = 150;
export const MAX_PAGE_HEIGHT = 400;

/** Every page, in tab order: each may have a height of its own. */
export const PAGE_NAMES = ['call', 'music', 'notifications', 'focus', 'reminders', 'shelf', 'calendar', 'apps', 'usage'];

/** The height of page `name` given the setting's `heights` (name → px): within bounds, PAGE_HEIGHT if unset. */
export function heightOf(heights, name) {
    const height = heights?.[name];
    if (!Number.isFinite(height))
        return PAGE_HEIGHT;
    return Math.min(MAX_PAGE_HEIGHT, Math.max(MIN_PAGE_HEIGHT, Math.round(height)));
}

/** `heights` with page `name` at `height`; at PAGE_HEIGHT it is left out, so the setting keeps only changes. */
export function withHeight(heights, name, height) {
    const next = {...heights};
    const clamped = heightOf({[name]: height}, name);
    if (clamped === PAGE_HEIGHT)
        delete next[name];
    else
        next[name] = clamped;
    return next;
}
