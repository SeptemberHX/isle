// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// What the weather isled reads (weather.rs) is called and drawn as: a WMO weather code's name and icon, and the
// numbers as the island writes them. No GNOME here: tests/extension/weather.test.js runs it under node.

import {N_} from './i18n.js';

/** WMO weather codes by what they are: [codes, name, icon by day, icon by night]. The icons are Isle's own (icons/isle-wx-*.svg), in colour. */
const KINDS = [
    [[0], N_('Clear sky'), 'isle-wx-clear', 'isle-wx-clear-night'],
    [[1], N_('Mostly clear'), 'isle-wx-few-clouds', 'isle-wx-few-clouds-night'],
    [[2], N_('Partly cloudy'), 'isle-wx-few-clouds', 'isle-wx-few-clouds-night'],
    [[3], N_('Overcast'), 'isle-wx-overcast'],
    [[45, 48], N_('Fog'), 'isle-wx-fog'],
    [[51, 53], N_('Drizzle'), 'isle-wx-drizzle'],
    [[55], N_('Heavy drizzle'), 'isle-wx-drizzle'],
    [[56, 57, 66, 67], N_('Freezing rain'), 'isle-wx-rain'],
    [[61], N_('Light rain'), 'isle-wx-rain'],
    [[63], N_('Rain'), 'isle-wx-rain'],
    [[65], N_('Heavy rain'), 'isle-wx-rain'],
    [[71], N_('Light snow'), 'isle-wx-snow'],
    [[73, 77], N_('Snow'), 'isle-wx-snow'],
    [[75], N_('Heavy snow'), 'isle-wx-snow'],
    [[80], N_('Showers'), 'isle-wx-drizzle'],
    [[81], N_('Heavy showers'), 'isle-wx-rain'],
    [[82], N_('Downpour'), 'isle-wx-rain'],
    [[85, 86], N_('Snow showers'), 'isle-wx-snow'],
    [[95], N_('Thunderstorm'), 'isle-wx-storm'],
    [[96, 97, 99], N_('Thunderstorm with hail'), 'isle-wx-storm'],
];
/** A code Open-Meteo has that is not listed: cloudy says the least wrong. */
const UNKNOWN = [[], N_('Cloudy'), 'isle-wx-overcast'];

const kindOf = code => KINDS.find(([codes]) => codes.includes(code)) ?? UNKNOWN;

/** A weather code's name, in English: to translate as it shows (`_`). */
export function describe(code) {
    return kindOf(code)[1];
}

/** A weather code's icon, the sun or the moon in it by `day`. */
export function iconName(code, day = true) {
    const [, , byDay, byNight] = kindOf(code);
    return day ? byDay : byNight ?? byDay;
}

/** "19°", "−3°": a temperature in °C, whole, never "-0"; below zero with a minus sign, as wide as a digit, not a
 * hyphen. */
export function degrees(value) {
    if (!Number.isFinite(value))
        return '–';
    const whole = Math.round(value);
    return `${whole < 0 ? '−' : ''}${Math.abs(whole)}°`;
}

/** How old (ms) a report is before the closed island and the page say it is. */
export const STALE_MS = 60 * 60 * 1000;

/** Whether a report read at `atMs` is old at `nowMs`. */
export function isStale(atMs, nowMs) {
    return nowMs - atMs > STALE_MS;
}

/** The weekday (0 Sunday … 6 Saturday) of "2026-11-13", the place's own date; null for anything else. */
export function weekdayOf(date) {
    const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
    if (!found)
        return null;
    const [year, month, day] = found.slice(1).map(Number);
    const at = new Date(Date.UTC(year, month - 1, day));
    return at.getUTCMonth() === month - 1 && at.getUTCDate() === day ? at.getUTCDay() : null;
}
