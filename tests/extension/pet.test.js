// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

import assert from 'node:assert/strict';
import test from 'node:test';

import {DOZE_S, EXPRESSIONS, expressionDuration, expressionFrame, microphonePose, musicSegmentAt, Pet, sheetName,
    SLEEP_S, stateFor} from '../../gnome-extension/src/pet.js';

const calm = {now: 0, focusing: false, worried: false, singing: false, alerting: false, hovered: false, idle: 0};

test('the state is the first that applies', () => {
    const pet = new Pet();
    assert.equal(stateFor(pet, calm), 'awake');
    assert.equal(stateFor(pet, {...calm, idle: DOZE_S}), 'dozing');
    assert.equal(stateFor(pet, {...calm, idle: SLEEP_S}), 'sleeping');
    assert.equal(stateFor(pet, {...calm, hovered: true, idle: SLEEP_S}), 'curious');
    assert.equal(stateFor(pet, {...calm, singing: true, hovered: true}), 'music');
    assert.equal(stateFor(pet, {...calm, singing: true, alerting: true}), 'awake');
    assert.equal(stateFor(pet, {...calm, worried: true, singing: true}), 'worried');
    assert.equal(stateFor(pet, {...calm, focusing: true, worried: true}), 'focused');
    pet.react('happy');
    assert.equal(stateFor(pet, {...calm, focusing: true}), 'happy');
});

test('a reaction plays an expression and is over with it', () => {
    const pet = new Pet();
    pet.react('happy');
    assert.equal(EXPRESSIONS[pet.expressions.current], 'praised');
    const length = expressionDuration(pet.expressions.current);
    // Unseen, its time stands still.
    pet.advance(30, false);
    assert.ok(pet.reaction);
    pet.advance(length + 0.01, true);
    assert.equal(pet.reaction, null);
});

test('back at the computer after a rest, it wakes for a moment', () => {
    const pet = new Pet();
    pet.noticeIdle(200, 100);
    pet.step(stateFor(pet, {...calm, now: 100, idle: 200}), 100, 0.05, [0, 0], true);
    assert.equal(pet.state, 'sleeping');
    pet.noticeIdle(0.1, 101);
    assert.equal(stateFor(pet, {...calm, now: 101, idle: 0.1}), 'waking');
    assert.equal(stateFor(pet, {...calm, now: 104, idle: 3}), 'awake');
});

test('awake, an expression plays now and then, with quiet in between', () => {
    const pet = new Pet();
    let played = 0, playing = false;
    for (let frame = 0; frame < 20 * 120; frame++) {
        pet.step('awake', frame / 20, 1 / 20, [0, 0], true);
        const now = pet.expressions.current !== null;
        if (now && !playing)
            played++;
        playing = now;
    }
    // Two minutes: the first after 8 s, the next after 22 s or more of quiet.
    assert.ok(played >= 3 && played <= 5, `${played} expressions`);
});

test('singing goes through six poses and all twelve expressions', () => {
    const poses = new Set(), expressions = new Set();
    for (let age = 0; age < 260; age += 0.25) {
        const segment = musicSegmentAt(age);
        poses.add(segment.pose);
        if (segment.expression)
            expressions.add(segment.expression.expression);
    }
    assert.equal(poses.size, 6);
    assert.equal(expressions.size, 12);
    assert.equal(musicSegmentAt(0).pose, 'microphone');
});

test('the microphone keeps to its place by the mouth', () => {
    for (let frame = 0; frame < 600; frame++) {
        const {head, angle} = microphonePose(frame / 60);
        const tip = [head[0] + 7 * Math.cos(angle), head[1] + 7 * Math.sin(angle)];
        assert.ok(head[0] - 2.6 > 1.4 && head[1] - 2.6 > 17);
        assert.ok(tip[0] + 1 < 16 && tip[1] + 1 < 28);
    }
});

test('an expression has sixteen frames, each in its file', () => {
    for (const expression of EXPRESSIONS.keys()) {
        assert.equal(expressionFrame(expression, 0), 0);
        assert.equal(expressionFrame(expression, expressionDuration(expression)), 15);
    }
    assert.equal(sheetName(0), '00-wink.png');
    assert.equal(sheetName(11), '11-search.png');
});
