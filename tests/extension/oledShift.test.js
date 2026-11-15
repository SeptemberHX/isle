// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

import assert from 'node:assert/strict';
import test from 'node:test';

import {MAX_SHIFT, shiftAt} from '../../gnome-extension/src/oledShift.js';

test('the island starts in its place and each step moves it one pixel', () => {
    assert.equal(shiftAt(0), 0);
    let before = 0;
    const seen = new Set([0]);
    for (let step = 1; step <= MAX_SHIFT * 8; step++) {
        const now = shiftAt(step);
        assert.equal(Math.abs(now - before), 1, `step ${step}: ${before} → ${now}`);
        seen.add(now);
        before = now;
    }
    assert.equal(Math.min(...seen), -MAX_SHIFT);
    assert.equal(Math.max(...seen), MAX_SHIFT);
    assert.equal(shiftAt(MAX_SHIFT * 4), 0);
});
