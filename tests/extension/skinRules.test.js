// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {contrast, isLight, mapColor, PALETTES} from '../../gnome-extension/src/skinRules.js';

const {cream} = PALETTES;
const unit = colour => colour.slice(0, 3).map(value => value / 255);

test('white becomes ink and black becomes paper', () => {
    assert.deepEqual(mapColor([255, 255, 255, 255], cream), [...cream.ink, 255]);
    assert.deepEqual(mapColor([0, 0, 0, 255], cream), [...cream.paper, 255]);
    // Dim text keeps its dimness, in ink.
    assert.deepEqual(mapColor([255, 255, 255, 128], cream), [...cream.ink, 128]);
    assert.deepEqual(mapColor([255, 255, 255, 0], cream), [255, 255, 255, 0]);
});

test('the theme\'s blue becomes the accent, other colours are deepened until they read', () => {
    assert.deepEqual(mapColor([10, 132, 255, 255], cream), [...cream.accent, 255]);
    for (const colour of [[48, 209, 88, 255], [255, 214, 10, 255], [255, 69, 58, 255], [191, 90, 242, 200]]) {
        const [r, g, b, a] = mapColor(colour, cream);
        const paper = unit(cream.paper);
        const seen = unit([r, g, b]).map((value, index) => paper[index] + (value - paper[index]) * a / 255);
        assert.ok(contrast(seen, paper) >= 2.4, `${colour} reads as ${[r, g, b, a]}`);
    }
});

test('dark glass keeps white ink and lifts greys', () => {
    const dark = PALETTES['glass-dark'];
    assert.equal(isLight(dark), false);
    assert.deepEqual(mapColor([255, 255, 255, 255], dark), [255, 255, 255, 255]);
    assert.ok(mapColor([128, 128, 128, 255], dark)[0] > 128);
});

test('the stylesheet\'s skins are up to date', () => {
    execFileSync('node', [fileURLToPath(new URL('../../scripts/skins.mjs', import.meta.url)), '--check'], {stdio: 'pipe'});
});
