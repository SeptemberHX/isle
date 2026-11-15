// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The weather's names, icons and numbers (gnome-extension/src/weather.js).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {degrees, describe, iconName, isStale, STALE_MS, weekdayOf} from '../../gnome-extension/src/weather.js';

test('a weather code has a name and an icon, the night its own where the sky shows', () => {
    assert.equal(describe(0), 'Clear sky');
    assert.equal(iconName(0, true), 'isle-wx-clear');
    assert.equal(iconName(0, false), 'isle-wx-clear-night');
    assert.equal(iconName(2, false), 'isle-wx-few-clouds-night');
    assert.equal(describe(63), 'Rain');
    assert.equal(iconName(63, false), 'isle-wx-rain');
    assert.equal(describe(99), 'Thunderstorm with hail');
    // One Open-Meteo may add.
    assert.equal(describe(42), 'Cloudy');
    assert.equal(iconName(42), 'isle-wx-overcast');
});

test('every code Open-Meteo documents is known', () => {
    for (const code of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99])
        assert.notEqual(describe(code), 'Cloudy', `code ${code}`);
});

test('a temperature is whole degrees, and zero has no sign', () => {
    assert.equal(degrees(19.5), '20°');
    assert.equal(degrees(-3.2), '−3°');
    assert.equal(degrees(-0.4), '0°');
    assert.equal(degrees(undefined), '–');
});

test('a report is old after an hour', () => {
    assert.equal(isStale(0, STALE_MS), false);
    assert.equal(isStale(0, STALE_MS + 1), true);
});

test('a date has its weekday wherever the computer is', () => {
    assert.equal(weekdayOf('2026-11-13'), 5);
    assert.equal(weekdayOf('2026-11-15'), 0);
    assert.equal(weekdayOf('2026-02-30'), null);
    assert.equal(weekdayOf('tomorrow'), null);
});
