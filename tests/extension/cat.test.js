// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

import assert from 'node:assert/strict';
import test from 'node:test';

import {ACT_NAMES, Cat, HEIGHT, STYLES, WIDTH} from '../../gnome-extension/src/cat.js';
import {stateFor} from '../../gnome-extension/src/pet.js';

const calm = {now: 0, focusing: false, worried: false, singing: false, alerting: false, hovered: false, idle: 0};
const STATES = ['awake', 'curious', 'waking', 'happy', 'satisfied', 'music', 'worried', 'focused', 'dozing', 'sleeping'];

// A pen that keeps the box of all it is asked to draw, and the colours.
function recorder() {
    let quiet = 0;
    const box = {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, shapes: 0, colours: new Set()};
    const reach = (x, y, by = 0) => {
        if (quiet)
            return;
        assert.ok(Number.isFinite(x) && Number.isFinite(y), 'a point is a number');
        box.left = Math.min(box.left, x - by);
        box.right = Math.max(box.right, x + by);
        box.top = Math.min(box.top, y - by);
        box.bottom = Math.max(box.bottom, y + by);
    };
    // Not counted: what is drawn only to be cut to the cat's shape.
    const seen = color => {
        if (color.gradient) {
            assert.equal(color.gradient.length, 4);
            assert.ok(color.stops.length >= 2);
        } else {
            assert.equal(color.length, 3);
            assert.ok(color.every(c => c >= 0 && c <= 255));
        }
        box.colours.add(JSON.stringify(color));
        box.shapes++;
    };
    return {box, pen: {
        path: (points, width, color) => (seen(color), points.forEach(([x, y]) => reach(x, y, width / 2))),
        seg: (a, b, width, color) => (seen(color), [a, b].forEach(([x, y]) => reach(x, y, width / 2))),
        circle: (x, y, r, color) => (seen(color), reach(x, y, r)),
        fill: (x, y, width, height, r, color) => (seen(color), reach(x, y), reach(x + width, y + height)),
        poly: (points, color) => (seen(color), points.forEach(([x, y]) => reach(x, y))),
        text: (x, base, text, size, color) => (seen(color), reach(x, base - size * 0.6), reach(x + size * 0.6, base)),
        faded: (k, draw) => draw(),
        layer: (k, draw) => draw(),
        masked: (shape, paint) => {
            shape();
            quiet++;
            paint();
            quiet--;
        },
        erase: draw => draw(),
        pixelated: (cell, draw) => draw(),
        sprite: () => assert.fail('a cat has no strips'),
    }};
}

test('a cat lives the eyes\' life: the same states, a reaction that ends, a waking after a rest', () => {
    const cat = new Cat('orange');
    assert.equal(stateFor(cat, calm), 'awake');
    assert.equal(stateFor(cat, {...calm, singing: true}), 'music');
    cat.react('happy');
    assert.equal(stateFor(cat, {...calm, focusing: true}), 'happy');
    cat.advance(30, false);
    assert.ok(cat.reaction);
    cat.advance(2.7, true);
    assert.equal(cat.reaction, null);
    assert.equal(cat.expressions.current, null);

    cat.noticeIdle(200, 100);
    cat.step(stateFor(cat, {...calm, now: 100, idle: 200}), 100, 0.05, [0, 0], true);
    assert.equal(cat.state, 'sleeping');
    cat.noticeIdle(0.1, 101);
    assert.equal(stateFor(cat, {...calm, now: 101, idle: 0.1}), 'waking');
    assert.equal(stateFor(cat, {...calm, now: 104, idle: 3}), 'awake');
});

test('whatever it does, in every look, it stays in its box', () => {
    for (const coat of Object.keys(STYLES)) {
        for (const state of STATES) {
            const cat = new Cat(coat);
            if (['happy', 'satisfied'].includes(state))
                cat.react(state);
            // Fifty seconds of it, the pointer going round, drawn at each step.
            for (let frame = 0; frame < 520; frame++) {
                const t = frame / 20;
                cat.step(state, t, 1 / 20, [Math.sin(t) * 3, Math.cos(t * 1.3) * 1.5], true);
                const {box, pen} = recorder();
                cat.draw(pen, WIDTH / 2, t, true, frame % 2 === 0);
                assert.ok(box.shapes > 5, `${coat} ${state}: drawn`);
                assert.ok(box.left >= 0 && box.right <= WIDTH && box.top >= 0 && box.bottom <= HEIGHT,
                    `${coat} ${state} at ${t.toFixed(2)} s: ${JSON.stringify({...box, colours: undefined})}`);
            }
        }
    }
});

const inBox = box => box.left >= 0 && box.right <= WIDTH && box.top >= 0 && box.bottom <= HEIGHT;

test('awake it does each thing of its own in turn, and comes back to sit', () => {
    const cat = new Cat('tabby');
    const done = new Set();
    for (let frame = 0; frame < 20 * 400; frame++) {
        const t = frame / 20;
        cat.step('awake', t, 1 / 20, [Math.sin(t / 3) * 3, 0], true);
        if (cat.act)
            done.add(cat.act.name);
        const {box, pen} = recorder();
        cat.draw(pen, WIDTH / 2, t);
        assert.ok(inBox(box), `${cat.act?.name ?? cat.rest} at ${t} s: ${JSON.stringify({...box, colours: undefined})}`);
        assert.ok(Math.abs(cat.px) <= 5.001);
    }
    assert.deepEqual([...done].sort(), [...ACT_NAMES].sort());
});

test('anything it does, from anywhere in its box and looking either way, stays in the box', () => {
    for (const name of ACT_NAMES) {
        for (const [px, dir] of [[-5, 1], [5, -1], [0, 1], [0, -1]]) {
            const cat = new Cat('tuxedo');
            Object.assign(cat, {px, dir});
            for (let frame = 0; frame < 10; frame++)
                cat.step('awake', frame / 20, 1 / 20, [0, 0], true);
            cat.start(name);
            for (let frame = 10; cat.act?.name === name && frame < 400; frame++) {
                cat.step('awake', frame / 20, 1 / 20, [0, 0], true);
                const {box, pen} = recorder();
                cat.draw(pen, WIDTH / 2, frame / 20);
                assert.ok(inBox(box), `${name} from ${px} looking ${dir}, frame ${frame}: ${JSON.stringify({...box, colours: undefined})}`);
            }
        }
    }
});

test('the pointer beside it makes it ready to pounce, right over it strokes it', () => {
    const cat = new Cat();
    cat.step('curious', 0, 1 / 20, [-2, 0], true);
    assert.equal(cat.dir, -1);
    assert.ok(cat._pounce > 0);
    for (let frame = 1; frame < 60; frame++)
        cat.step('curious', frame / 20, 1 / 20, [0.1, 0], true);
    assert.ok(cat.props.some(prop => prop.kind === 'purr'));
    // Not ready to pounce again at once.
    cat.step('awake', 3, 1 / 20, [0, 0], true);
    cat.step('curious', 3.05, 1 / 20, [2, 0], true);
    assert.equal(cat._pounce, 0);
    assert.equal(cat.dir, 1);
});

test('it is pleased, sings and sleeps in more ways than one', () => {
    const cat = new Cat();
    const shapes = new Set();
    for (let round = 0; round < 3; round++) {
        cat.react('happy');
        for (let frame = 0; frame < 12; frame++)
            cat.step('happy', frame / 20, 1 / 20, [0, 0], true);
        shapes.add(JSON.stringify(cat._pose.fl.map(Math.round)));
    }
    assert.equal(shapes.size, 3);
});

test('with animations off, or unseen, it does nothing of its own', () => {
    const still = new Cat();
    for (let frame = 0; frame < 20 * 60; frame++) {
        still.step('awake', frame / 20, 1 / 20, [0, 0], true, false);
        assert.equal(still.act, null);
    }
    const unseen = new Cat();
    for (let frame = 0; frame < 20 * 60; frame++)
        unseen.step('awake', frame / 20, 1 / 20, [0, 0], false);
    assert.equal(unseen.act, null);
    assert.equal(unseen.age, 0);
});

test('nineteen looks, each drawn its own way', () => {
    const looks = Object.keys(STYLES);
    assert.equal(looks.length, 19);
    const drawn = looks.map(look => {
        const cat = new Cat(look);
        cat.step('awake', 0, 1 / 20, [0, 0], true);
        const {box, pen} = recorder();
        const calls = [];
        for (const name of ['layer', 'masked', 'erase', 'pixelated']) {
            const call = pen[name];
            pen[name] = (...args) => (calls.push(name), call(...args));
        }
        cat.draw(pen, WIDTH / 2, 0);
        return `${[...box.colours].sort().join(" ")} ${calls.join(" ")} ${box.shapes}`;
    });
    drawn.forEach((one, index) => assert.equal(drawn.indexOf(one), index, `${looks[index]} is drawn as ${looks[drawn.indexOf(one)]}`));
    // A name that is no look is the plain one.
    assert.equal(new Cat('tiger').style, STYLES.moon);
});

test('on a light island a pale cat gets a line round it', () => {
    for (const look of ['moon', 'line', 'glass', 'ink']) {
        const colours = light => {
            const cat = new Cat(look);
            cat.step('awake', 0, 1 / 20, [0, 0], true);
            const {box, pen} = recorder();
            cat.draw(pen, WIDTH / 2, 0, true, light);
            return [...box.colours].sort().join(' ');
        };
        assert.notEqual(colours(true), colours(false), look);
    }
});
