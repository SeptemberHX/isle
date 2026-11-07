// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// Each page's height from the `page-heights` setting: `node --test tests/extension/*.test.js`.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {LARGE_PAGE_HEIGHT, MAX_PAGE_HEIGHT, PAGE_HEIGHT, heightOf, withHeight} from '../../gnome-extension/src/pageHeights.js';

test('a page Settings gives no height keeps the usual one', () => {
    assert.equal(heightOf({}, 'music'), PAGE_HEIGHT);
    assert.equal(heightOf(undefined, 'music'), PAGE_HEIGHT);
    assert.equal(heightOf({calendar: 280}, 'music'), PAGE_HEIGHT);
});

test('a page given a height has it, kept within bounds', () => {
    assert.equal(heightOf({notifications: 280}, 'notifications'), 280);
    assert.equal(heightOf({notifications: 90}, 'notifications'), PAGE_HEIGHT);
    assert.equal(heightOf({notifications: 9000}, 'notifications'), MAX_PAGE_HEIGHT);
    assert.equal(heightOf({notifications: 200.4}, 'notifications'), 200);
});

test('setting a height keeps only the pages that differ from the usual one', () => {
    assert.deepEqual(withHeight({}, 'calendar', 280), {calendar: 280});
    assert.deepEqual(withHeight({calendar: 280, shelf: 200}, 'calendar', PAGE_HEIGHT), {shelf: 200});
    assert.deepEqual(withHeight({}, 'shelf', 1000), {shelf: MAX_PAGE_HEIGHT});
    const before = {calendar: 280};
    withHeight(before, 'shelf', 200);
    assert.deepEqual(before, {calendar: 280});
});

test('a page without a height of its own follows the size', () => {
    assert.equal(heightOf({}, 'music', LARGE_PAGE_HEIGHT), LARGE_PAGE_HEIGHT);
    assert.equal(heightOf({music: 300}, 'music', LARGE_PAGE_HEIGHT), 300);
    assert.equal(heightOf({music: 150}, 'music', LARGE_PAGE_HEIGHT), 150);
    assert.deepEqual(withHeight({music: 300}, 'music', LARGE_PAGE_HEIGHT, LARGE_PAGE_HEIGHT), {});
    assert.deepEqual(withHeight({}, 'music', PAGE_HEIGHT, LARGE_PAGE_HEIGHT), {music: PAGE_HEIGHT});
});
