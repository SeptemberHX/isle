// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The camera levels' arithmetic: `node --test tests/extension/*.test.js`.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {LEVELS, canLift, clampToStep, levelOf, parseControls, pendingSettings, valuesFor}
    from '../../gnome-extension/src/cameraRules.js';

// A UVC laptop camera, as v4l2-ctl 1.32 lists it, at its own settings.
const LISTING = `
User Controls

                     brightness 0x00980900 (int)    : min=-64 max=64 step=1 default=0 value=0 flags=has-min-max
                       contrast 0x00980901 (int)    : min=0 max=64 step=1 default=32 value=32 flags=has-min-max
                     saturation 0x00980902 (int)    : min=0 max=128 step=1 default=64 value=64 flags=has-min-max
        white_balance_automatic 0x0098090c (bool)   : default=1 value=1
                          gamma 0x00980910 (int)    : min=72 max=500 step=1 default=100 value=100 flags=has-min-max
           power_line_frequency 0x00980918 (menu)   : min=0 max=2 default=1 value=1 (50 Hz)
      white_balance_temperature 0x0098091a (int)    : min=2800 max=6500 step=1 default=4600 value=4600 flags=inactive, has-min-max
  region_of_interest_auto_ctrls 0x00981ae2 (bitmask): max=0x00000001 default=0x00000000 value=0x00000010 flags=has-min-max
`;

/** The camera after `pairs` ("name=value") are set on it. */
function after(controls, pairs) {
    const next = new Map([...controls].map(([name, control]) => [name, {...control}]));
    for (const pair of pairs) {
        const [name, value] = pair.split('=');
        next.get(name).value = Number(value);
    }
    return next;
}

test('the whole-number controls are read, with their ranges', () => {
    const controls = parseControls(LISTING);
    assert.deepEqual(controls.get('brightness'), {min: -64, max: 64, step: 1, default: 0, value: 0});
    assert.deepEqual(controls.get('gamma'), {min: 72, max: 500, step: 1, default: 100, value: 100});
    assert.equal(controls.has('white_balance_automatic'), false);
    assert.equal(controls.has('power_line_frequency'), false);
    assert.equal(controls.has('region_of_interest_auto_ctrls'), false);
});

test('a node without brightness (a camera’s metadata node) has nothing to lift', () => {
    assert.equal(canLift(parseControls('')), false);
    assert.equal(canLift(parseControls(LISTING)), true);
});

test('Off is the camera as it is made; each level lifts every control further', () => {
    const controls = parseControls(LISTING);
    assert.deepEqual([...valuesFor(controls, 0)], [['brightness', 0], ['gamma', 100], ['contrast', 32], ['saturation', 64]]);
    for (let level = 1; level < LEVELS.length; level++) {
        const lower = valuesFor(controls, level - 1);
        for (const [name, value] of valuesFor(controls, level))
            assert.ok(value > lower.get(name), `${name} at level ${level}`);
    }
    assert.equal(valuesFor(controls, 3).get('brightness'), 32);
    assert.equal(valuesFor(controls, 3).get('gamma'), 220);
});

test('a level only turns what the camera has, and an unknown level is Off', () => {
    const controls = parseControls(LISTING);
    controls.delete('gamma');
    assert.deepEqual([...valuesFor(controls, 2).keys()], ['brightness', 'contrast', 'saturation']);
    assert.deepEqual(valuesFor(controls, 9), valuesFor(controls, 0));
});

test('the level the camera is at is found again, and a camera set by hand is at none', () => {
    const controls = parseControls(LISTING);
    assert.equal(levelOf(controls), 0);
    const medium = after(controls, pendingSettings(controls, 2));
    assert.equal(levelOf(medium), 2);
    assert.deepEqual(pendingSettings(medium, 2), []);
    assert.equal(levelOf(after(controls, ['brightness=20', 'gamma=150'])), -1);
});

test('values land on the control’s steps', () => {
    const stepped = {min: 0, max: 100, step: 10, default: 50, value: 50};
    assert.equal(clampToStep(stepped, 44), 40);
    assert.equal(clampToStep(stepped, 46), 50);
    assert.equal(clampToStep(stepped, 900), 100);
});
