// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// A cat for the closed island's companion (Settings → Island → Appearance → Companion), in the place of the
// two eyes (pet.js) and living the same life: the same states for the same reasons (`stateFor` there), in the
// same box. All of it is drawn, nothing is a picture. It is seen from the side: a body between its hips and
// its chest, four legs that reach for where their paws are, a tail, a head. How it holds itself is a pose
// (POSES), it goes from one to the next smoothly, and what it does is poses in turn with its paws and head
// moved over them. How it looks is one of nineteen ways of drawing that one shape (STYLES): a plain shape, a
// line, ink, a coat, folded paper, light. Its pen is catPen.js. No GNOME here: tests/extension/cat.test.js
// runs it under node.

import {HEIGHT, WIDTH} from './pet.js';

const WHITE = [255, 255, 255];
const HEART = [255, 105, 135];
const SLEEP = [170, 160, 255];
const YELLOW = [255, 196, 61];
const CYAN = [102, 219, 255];
const MOUTH = [150, 52, 68];
const CUP = [255, 112, 105];
const BAND = [214, 218, 230];
const DARK = [34, 30, 38];
const CREAM = [250, 246, 240];
const YARN = [255, 122, 138];
const WING = [140, 200, 255];

const GOLD = [220, 182, 92];
const COBALT = [44, 83, 176];
const ORANGE = [228, 154, 76];
const along = (from, to, ...stops) => ({gradient: [...from, ...to], stops: stops.map((rgb, index) => [index / (stops.length - 1), rgb])});

/** The looks, each a way of drawing the same cat. `base` is the cat's colour (or a gradient across the box);
 * `mode` how it is put on: filled (the default), a line round it ('ring', `width` thick, with `glow`), glass,
 * dots or squares. `edge` is a line round a filled cat, `far` the legs on its other side, `cut` an eye and mouth
 * that are holes in it (else `eye`, with a `pupil`), `line` what is drawn fine on it, `marks` its pattern,
 * `rough` an edge as a brush leaves it, `seal` a red seal beside it. */
export const STYLES = {
    moon: {base: CREAM, cut: true},
    night: {base: [34, 34, 44], edge: [141, 147, 173], eye: [255, 213, 74], pupil: true, line: [141, 147, 173]},
    line: {mode: 'ring', base: CREAM, width: 0.75},
    ink: {base: [239, 233, 220], cut: true, rough: true, seal: true},
    tabby: {base: [152, 140, 124], far: [112, 102, 90], eye: [207, 216, 106], pupil: true, line: [72, 64, 56], marks: 'tabby'},
    origami: {base: [244, 239, 230], cut: true, marks: 'facets'},
    duo: {base: [232, 161, 90], far: [196, 122, 58], cut: true, marks: 'shadow'},
    neon: {mode: 'ring', base: along([4, 28], [44, 3], [255, 79, 216], [63, 232, 255]), width: 0.6, glow: true},
    bastet: {base: [23, 22, 28], edge: GOLD, eye: GOLD, line: GOLD, marks: 'collar'},
    aurora: {base: along([6, 28], [42, 2], [255, 154, 90], [242, 95, 165], [122, 107, 255]), cut: true},
    stars: {base: along([0, 2], [0, 28], [59, 47, 122], [22, 33, 79]), edge: [127, 139, 224], eye: [255, 233, 168],
        line: [170, 180, 255], marks: 'stars'},
    porcelain: {base: [244, 241, 234], eye: COBALT, line: COBALT, marks: 'scrolls'},
    kintsugi: {base: [37, 36, 44], edge: [85, 84, 106], eye: GOLD, line: GOLD, marks: 'cracks'},
    glass: {mode: 'glass', base: WHITE},
    dots: {mode: 'dots', base: [255, 182, 72]},
    pixel: {mode: 'pixel', base: CREAM},
    tuxedo: {base: [42, 41, 50], edge: [90, 89, 110], far: [30, 29, 36], eye: [185, 224, 106], pupil: true, line: [200, 200, 212],
        marks: 'tuxedo'},
    siamese: {base: [234, 223, 202], far: [86, 62, 52], eye: [111, 183, 255], pupil: true, line: [58, 40, 34], marks: 'points'},
    calico: {base: [244, 239, 230], far: [208, 201, 190], eye: [217, 178, 74], pupil: true, line: DARK, marks: 'calico'},
};
/** The line round a pale cat on a light island. */
const ON_LIGHT = [72, 68, 80];

const TAU = 2 * Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}
/** 1 between `from` and `to`, coming and going over `edge`. */
const during = (x, from, to, edge = 0.25) => smoothstep(from, from + edge, x) * (1 - smoothstep(to - edge, to, x));
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

function ellipse(x, y, rx, ry, from = 0, to = TAU, n = 24, turn = 0) {
    const points = [];
    const cos = Math.cos(turn), sin = Math.sin(turn);
    for (let i = 0; i <= n; i++) {
        const a = lerp(from, to, i / n);
        const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
        points.push([x + ex * cos - ey * sin, y + ex * sin + ey * cos]);
    }
    return points;
}

function bezier(p0, p1, p2, p3, n = 16) {
    const points = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        points.push([0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]));
    }
    return points;
}

function heart(x, y, size) {
    const points = [];
    for (let i = 0; i <= 24; i++) {
        const a = i / 24 * TAU;
        points.push([x + size * Math.sin(a) ** 3,
            y - size * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16]);
    }
    return points;
}

/** The ground its paws stand on, and how far from the box's middle it walks. */
const GROUND = 27.2;
const RANGE = 5;

// The poses, the cat looking right, x from where it is and y in the box: its hips and how round they are, its
// chest, how thick it is between them and how its back bends (`sag`, up when less than 0), its head, its four
// paws (front and hind, the near one and the far one), where the tail leaves the hips and the three points it
// bends by, and how far its end swings.
const POSES = {
    sit: {hip: [-3.8, 22.8], haunch: 5.2, chest: [1.2, 16], girth: 7.2, sag: 0.9, head: [4, 10], tilt: 0,
        fl: [3.8, GROUND], fr: [2.6, GROUND], hl: [0.6, 27.3], hr: [-0.6, 27.3],
        root: [-4, 3.2], tail: [[-4.5, 1.2], [-8, -0.5], [-7, -6]], swing: [1.8, 0.6]},
    stand: {hip: [-6, 17.8], haunch: 3.9, chest: [5.5, 17.6], girth: 7, sag: 0.3, head: [10, 12], tilt: 0,
        fl: [6.6, GROUND], fr: [4.6, GROUND], hl: [-6.2, GROUND], hr: [-8.2, GROUND],
        root: [-3.2, -1.4], tail: [[-4.5, -1], [-6.5, -6], [-3.5, -10]], swing: [2, 0.5]},
    loaf: {hip: [-5, 23.3], haunch: 4.3, chest: [4.6, 23.1], girth: 8, sag: -1, head: [8.2, 17.6], tilt: 0,
        fl: [5.4, 26.6], fr: [4.4, 26.6], hl: [-4, 26.7], hr: [-5, 26.7],
        root: [-3.6, 2.6], tail: [[-2.5, 1.9], [3, 2], [8.5, 1.4]], swing: [0.5, 0.3]},
    sphinx: {hip: [-5.5, 23.2], haunch: 4.4, chest: [4.4, 22], girth: 7.2, sag: -0.4, head: [7.4, 14.6], tilt: 0,
        fl: [11.8, GROUND], fr: [10.2, GROUND], hl: [-2.6, 27.3], hr: [-3.8, 27.3],
        root: [-3.8, 2.4], tail: [[-3.5, 1.6], [-6, 1.8], [-7.2, -1.2]], swing: [0.6, 1.6]},
    curl: {hip: [-3.2, 23.2], haunch: 4.5, chest: [3.2, 23.4], girth: 8.4, sag: -1.6, head: [6, 22.4], tilt: 0.45,
        fl: [4.6, 26.6], fr: [3.8, 26.6], hl: [-2.6, 26.7], hr: [-3.4, 26.7],
        root: [-3.6, 2.4], tail: [[-2, 2.7], [5, 3], [10.5, 0.8]], swing: [0, 0]},
    stretch: {hip: [-5.5, 16.6], haunch: 3.9, chest: [4.8, 22.8], girth: 6.2, sag: 1.2, head: [9, 21.4], tilt: 0.25,
        fl: [13.4, GROUND], fr: [11.8, GROUND], hl: [-5.8, GROUND], hr: [-7.6, GROUND],
        root: [-2.6, -2], tail: [[-3, -3.5], [-4, -8], [-1.5, -11]], swing: [1.2, 0.3]},
    arch: {hip: [-4.8, 18], haunch: 3.9, chest: [4, 18.4], girth: 6.8, sag: -4.6, head: [7.6, 15.2], tilt: 0.15,
        fl: [4.8, GROUND], fr: [3.4, GROUND], hl: [-4.4, GROUND], hr: [-5.8, GROUND],
        root: [-2.6, -1.6], tail: [[-1.5, -4], [-2, -8.5], [-1, -12]], swing: [0.5, 0.2]},
    crouch: {hip: [-6, 19.4], haunch: 4.1, chest: [5, 22], girth: 6.8, sag: 0.2, head: [9.4, 18.4], tilt: 0,
        fl: [9, GROUND], fr: [7.4, GROUND], hl: [-5.4, GROUND], hr: [-7.4, GROUND],
        root: [-3.4, -0.6], tail: [[-3.2, 0.4], [-5.4, 1.2], [-6.4, -2]], swing: [0.4, 2]},
    beg: {hip: [-3, 22.8], haunch: 5.2, chest: [1, 15.4], girth: 6.8, sag: 0.5, head: [3.2, 9.6], tilt: -0.1,
        fl: [7.6, 13.4], fr: [6.6, 15.8], hl: [1.6, 27.3], hr: [0.4, 27.3],
        root: [-4, 3.2], tail: [[-4.5, 1.2], [-7.5, 0], [-7.6, -4]], swing: [1.2, 1]},
};
// A pose of its own to change: its numbers, and its lists of them, copied.
const copy = value => Array.isArray(value) ? value.map(copy) : value;
const pose = name => Object.fromEntries(Object.entries(POSES[name]).map(([key, value]) => [key, copy(value)]));

/** Its face at rest: eyes open, ears up; and what it wears. */
const FACE = {open: 1, arc: 0, pupil: 1, flat: 0, mouth: 0, tilt: 0, headX: 0, headY: 0, lift: 0, shake: 0, puff: 0,
    glasses: 0, phones: 0, swish: 1, rate: 1.3};

// What it does of itself, awake. `time` is how long (s), or works it out as it starts; `at` is how far in.
// `T` is what it is to be at that moment: {pose, face, look (where it looks, or null: at the pointer)}.
const ACTS = {
    twitch: {time: 0.7, run(cat, at) {
        cat.twitch = Math.sin(at / 0.7 * Math.PI * 4) * 0.45 * during(at, 0, 0.7, 0.15);
    }},
    blink: {time: 1.8, run(cat, at, T) {
        T.face.open = 1 - during(at, 0.2, 1.5, 0.5);
        T.face.arc = 0.5;
    }},
    look: {time: 2.8, run(cat, at, T) {
        const side = at < 1.4 ? -1 : 1, hold = during(at, 0, 2.8, 0.3);
        T.look = [side * hold, -0.3 * hold];
        T.face.tilt = side * 0.06 * hold;
    }},
    tilt: {time: 2, run(cat, at, T) {
        T.face.tilt = -0.3 * during(at, 0.1, 1.8, 0.3);
        T.face.pupil = 1.25;
    }},
    yawn: {time: 2.2, run(cat, at, T) {
        const wide = during(at, 0.3, 1.7, 0.3);
        Object.assign(T.face, {mouth: wide, open: 1 - wide, arc: 0.4, flat: wide * 0.5, headY: -wide * 0.7, tilt: -wide * 0.12});
    }},
    flick: {time: 1.1, run(cat, at, T) {
        T.face.rate = 7;
        T.face.swish = 1.4 * during(at, 0, 1.1, 0.2);
    }},
    meow: {time: 1.6, run(cat, at, T) {
        const call = Math.max(during(at, 0.1, 0.7, 0.15), during(at, 0.85, 1.5, 0.15));
        T.face.mouth = call * 0.6;
        T.face.headY = -call * 0.5;
        cat.props.push({kind: 'call', k: call});
    }},
    // Licks a front paw held up to its mouth.
    groom: {time: 3.6, run(cat, at, T) {
        const hold = during(at, 0.1, 3.3, 0.35);
        T.pose.head = [4.8, 11.4 + Math.sin(at * 9) * 0.35 * hold];
        T.pose.fl = mix(T.pose.fl, [9, 14.4 + Math.sin(at * 9 + 1) * 0.5], hold);
        Object.assign(T.face, {open: 1 - hold, arc: -0.5, tilt: 0.2 * hold});
        T.look = [0.5 * hold, 0.6 * hold];
    }},
    // Wipes the paw over its ear and down its face, again and again.
    wash: {time: 3.8, run(cat, at, T) {
        const hold = during(at, 0.1, 3.5, 0.35), stroke = Math.sin(at * 5.2);
        T.pose.fl = mix(T.pose.fl, [9 + stroke * 0.8, 10.4 + stroke * 2.6], hold);
        T.pose.head = [4.4 + stroke * 0.3 * hold, 10.6];
        Object.assign(T.face, {open: 1 - hold, arc: -0.6, tilt: (0.12 + stroke * 0.1) * hold});
        T.look = [0, 0];
    }},
    // A hind paw up behind its ear, going fast.
    scratch: {time: 2.6, run(cat, at, T) {
        const hold = during(at, 0.15, 2.4, 0.3);
        T.pose.head = mix(T.pose.head, [3, 12.6], hold);
        T.pose.hl = mix(T.pose.hl, [1.2 + Math.sin(at * 30) * 0.8, 16.6 + Math.cos(at * 30) * 0.6], hold);
        Object.assign(T.face, {open: 1 - hold, arc: 0.5, tilt: -0.36 * hold, flat: 0.3 * hold, swish: 0.2});
        T.look = [0, 0];
    }},
    // Treads with its front paws, one and the other.
    knead: {time: 3.4, run(cat, at, T) {
        const hold = during(at, 0.1, 3.2, 0.3), tread = Math.sin(at * 6.5);
        T.pose.fl[1] -= Math.max(0, tread) * 1.7 * hold;
        T.pose.fr[1] -= Math.max(0, -tread) * 1.7 * hold;
        T.pose.head = [4.6, 11 + Math.abs(tread) * 0.25];
        Object.assign(T.face, {open: 1 - hold, arc: -1, rate: 0.8});
        T.look = [0.2, 0.8];
    }},
    // Up, a long bow with a yawn, and down to sit again.
    stretch: {time: 3.6, run(cat, at, T) {
        T.pose = pose(at < 0.6 ? 'stand' : at < 2.3 ? 'stretch' : at < 3 ? 'stand' : 'sit');
        const bow = during(at, 0.8, 2.3, 0.3);
        Object.assign(T.face, {mouth: during(at, 1, 2, 0.3), open: 1 - bow, arc: 0.4, flat: bow * 0.4});
        T.look = [0, 0];
        cat.rest = 'sit';
    }},
    // Walks to another place in its box, and sits down looking in.
    walk: {
        time(cat) {
            const places = [-RANGE, RANGE, 0];
            cat.to = places[cat.walks++ % places.length];
            if (Math.abs(cat.to - cat.px) < 1)
                cat.to = places[cat.walks++ % places.length];
            return 0.5 + Math.abs(cat.to - cat.px) / 5.5 + 0.8;
        },
        run(cat, at, T, dt) {
            const left = cat.to - cat.px;
            if (at < 0.5 || Math.abs(left) < 0.05) {
                T.pose = pose(at < 0.5 ? 'stand' : 'sit');
                // Sat down, it looks in, to the box's middle.
                if (at >= 0.5 && cat.px !== 0)
                    cat.dir = -Math.sign(cat.px);
                if (at < 0.5)
                    cat.dir = Math.sign(left) || cat.dir;
                return;
            }
            cat.px += Math.sign(left) * Math.min(Math.abs(left), 5.5 * dt);
            cat.stride += dt * 9;
            T.pose = walking(cat.stride, 1);
            T.face.rate = 2.4;
            T.look = [0.5 * cat.dir, 0.2];
        },
    },
    // A dash to one end of the box, to the other, and back.
    zoom: {
        time(cat) {
            cat.legs = [RANGE, -RANGE, cat.px];
            return 3.2;
        },
        run(cat, at, T, dt) {
            const to = cat.legs[0];
            if (to === undefined || at < 0.35) {
                T.pose = pose(to === undefined ? 'sit' : 'crouch');
                T.face.pupil = 1.5;
                return;
            }
            const left = to - cat.px;
            cat.dir = Math.sign(left) || cat.dir;
            cat.px += Math.sign(left) * Math.min(Math.abs(left), 26 * dt);
            if (Math.abs(to - cat.px) < 0.05)
                cat.legs.shift();
            cat.stride += dt * 24;
            T.pose = walking(cat.stride, 1.7);
            T.pose.chest[1] += 1.4;
            T.pose.head[1] += 2.2;
            Object.assign(T.face, {pupil: 1.5, flat: 0.5, rate: 9, swish: 0.5});
            T.look = [cat.dir, 0];
        },
    },
    // A ball of yarn rolls up: it gets down, bats it about, and the ball rolls off.
    yarn: {time: 8, run(cat, at, T) {
        let ball = 10.5, hop = 0;
        if (at < 1.2) {
            ball = lerp(24, 10.5, smoothstep(0, 1.2, at));
        } else if (at >= 2.2 && at < 6) {
            const bat = (at - 2.2) % 0.95 / 0.95;
            ball = 10.5 + Math.sin(bat * Math.PI) * 4.2;
            hop = Math.sin(bat * Math.PI) * 2.4;
            T.pose = pose('crouch');
            // The paw goes out as the ball comes back.
            const reach = during(bat, 0.62, 1.05, 0.2) + during(bat, -0.1, 0.12, 0.1);
            T.pose.fl = mix(T.pose.fl, [10.6, 23.4], reach);
        } else if (at >= 6) {
            ball = lerp(10.5, 30, smoothstep(6, 7.2, at));
        }
        if (at >= 0.9 && at < 2.2) {
            T.pose = pose('crouch');
            cat.wiggle = Math.sin(at * 24) * during(at, 1.1, 2.2, 0.2);
        }
        Object.assign(T.face, {pupil: 1.45, rate: 4, swish: 0.7});
        T.look = [cat.dir, 0.9];
        cat.props.push({kind: 'yarn', x: ball, y: GROUND - 1 - hop, spin: ball * 0.6});
    }},
    // A butterfly comes by: it watches, sits up and bats at it, and the butterfly gets away.
    butterfly: {time: 8.5, run(cat, at, T) {
        const away = smoothstep(6.4, 8, at), come = smoothstep(0, 1.4, at);
        const fly = [lerp(22, 9, come) + Math.sin(at * 1.7) * 3 + away * 10, 8 + Math.sin(at * 2.9) * 2.6 - away * 9];
        const up = during(at, 2.6, 6.4, 0.3);
        if (up > 0.5) {
            T.pose = pose('beg');
            const bat = Math.sin(at * 7);
            T.pose.fl = [7 + Math.max(0, bat) * 1.8, 12.6 - Math.max(0, bat) * 2.4];
            T.pose.fr = [6.2 + Math.max(0, -bat) * 1.8, 14.4 - Math.max(0, -bat) * 2.6];
        }
        Object.assign(T.face, {pupil: 1.4, rate: 3.5, swish: 0.6});
        T.look = [cat.dir * clamp((fly[0] - 4) / 8, -1, 1), clamp((fly[1] - 10) / 5, -1, 1)];
        cat.props.push({kind: 'butterfly', x: fly[0], y: fly[1], flap: at * 26, k: 1 - smoothstep(7.2, 8.2, at)});
    }},
    // Lies down for a while: with its paws out, or as a loaf.
    lie: {time: 1, run(cat) {
        cat.rest = cat.lies++ % 2 ? 'loaf' : 'sphinx';
        cat.lying = 22;
    }},
};
/** What it does, in turn: small things between the large ones, a walk before a game so there is room for it. */
const TURNS = ['twitch', 'look', 'groom', 'flick', 'walk', 'yarn', 'blink', 'tilt', 'scratch', 'yawn', 'wash', 'meow', 'walk',
    'butterfly', 'knead', 'lie', 'zoom', 'look', 'walk', 'stretch'];
/** Lying down it does only what needs no getting up. */
const SMALL = ['blink', 'flick', 'twitch', 'yawn', 'look', 'tilt'];
export const ACT_NAMES = Object.keys(ACTS);

// A step of a walk: the paws go in pairs, corner to corner, each lifted as it comes forward.
function walking(stride, reach) {
    const P = pose('stand');
    const foot = (paw, phase) => {
        paw[0] += Math.sin(stride + phase) * 2.1 * reach;
        paw[1] -= Math.max(0, Math.cos(stride + phase)) * 1.5;
    };
    foot(P.fl, 0);
    foot(P.hr, 0.3);
    foot(P.fr, Math.PI);
    foot(P.hl, Math.PI + 0.3);
    const bob = Math.sin(stride * 2) * 0.3;
    P.hip[1] += bob;
    P.chest[1] -= bob;
    P.head[1] += Math.sin(stride * 2 + 1) * 0.35;
    return P;
}

// Every number of pose `now` a step nearer the one in `to`.
function ease(now, to, rate, dt) {
    for (const [key, value] of Object.entries(to)) {
        if (typeof value === 'number')
            now[key] = approach(now[key], value, rate, dt);
        else
            ease(now[key], value, rate, dt);
    }
}

export class Cat {
    constructor(style = 'moon') {
        this.style = STYLES[style] ?? STYLES.moon;
        this.state = 'awake';
        this.reaction = null;
        this.wakingUntil = 0;
        this.lastIdle = 0;
        /** As the eyes have it, for the one that draws it: a cat plays no drawn strip. */
        this.expressions = {current: null};
        this.age = 0;
        this.musicAge = 0;
        /** {name, time, length}: what it does of itself, or null. */
        this.act = null;
        /** Where it is from the box's middle, which way it looks (1 right), and how it rests awake. */
        this.px = 0;
        this.dir = 1;
        this.rest = 'sit';
        this.lying = 0;
        this.walks = 0;
        this.lies = 0;
        this.stride = 0;
        this.props = [];
        this.twitch = 0;
        this.wiggle = 0;
        /** Each time it is pleased or sleeps, another way of it. */
        this._cheers = 0;
        this._naps = 0;
        this._wait = 4;
        this._turn = 0;
        this._small = 0;
        this._cooldown = 0;
        this._hovered = false;
        this._pounce = 0;
        this._stroked = 0;
        this._pose = pose('sit');
        this._face = {...FACE};
        this._side = 1;
        this._gaze = [0, 0];
        this._tail = 0;
    }

    /** Pleased ('happy': something done) or content ('satisfied'). */
    react(state) {
        this.reaction = {state, remaining: 2.6};
        this.age = 0;
        this.act = null;
        if (state === 'happy')
            this._cheers++;
    }

    advance(dt, visible) {
        if (visible && this.reaction) {
            this.reaction.remaining -= dt;
            if (this.reaction.remaining <= 0)
                this.reaction = null;
        }
    }

    noticeIdle(idle, now) {
        if (this.lastIdle >= 45 && idle < 1 && ['dozing', 'sleeping'].includes(this.state))
            this.wakingUntil = now + 2.2;
        this.lastIdle = idle;
    }

    /** Starts doing `name` (see ACT_NAMES). */
    start(name) {
        const act = ACTS[name];
        this.act = {name, time: 0, length: typeof act.time === 'function' ? act.time(this) : act.time};
    }

    // Awake it does something of its own every few seconds, in turn.
    _stepActs(state, dt, animate) {
        this._cooldown = Math.max(0, this._cooldown - dt);
        if (state !== 'awake' || !animate) {
            this.act = null;
            this._wait = 4;
            if (state !== 'awake')
                this.rest = 'sit';
            return;
        }
        this.lying = Math.max(0, this.lying - dt);
        if (this.act) {
            this.act.time += dt;
            if (this.act.time >= this.act.length) {
                this.act = null;
                this._wait = 4.5 + this._turn % 3 * 1.5;
            }
            return;
        }
        this._wait -= dt;
        if (this._wait > 0)
            return;
        if (this.rest === 'sit')
            this.start(TURNS[this._turn++ % TURNS.length]);
        else if (this.lying <= 0)
            this.start('stretch');
        else
            this.start(SMALL[this._small++ % SMALL.length]);
    }

    /** Moves it on by `dt` (s) in `state` at clock `t` (s); `gaze` is where the pointer is, as for the eyes. */
    step(state, t, dt, gaze, visible, animate = true) {
        if (state !== this.state) {
            if (state === 'sleeping')
                this._naps++;
            this.state = state;
            this.age = 0;
        }
        if (!visible)
            return;
        this.age += dt;
        if (state === 'music')
            this.musicAge += dt;
        this._stepActs(state, dt, animate);
        const {age} = this;
        const pointer = [clamp(gaze[0] / 3, -1, 1), clamp(gaze[1] / 1.5, -1, 1)];
        const T = {pose: pose(state === 'awake' ? this.rest : 'sit'), face: {...FACE}, look: null};
        const face = T.face;
        this.props = [];
        this.twitch = 0;
        this.wiggle = 0;
        // Breathing.
        T.pose.head[1] += Math.sin(t * 1.7) * 0.2;
        switch (state) {
        case 'awake':
            if (this.act)
                ACTS[this.act.name].run(this, this.act.time, T, dt);
            else if (this.rest === 'loaf')
                Object.assign(face, {open: 0.7, swish: 0.4});
            break;
        case 'curious': {
            // It turns to the pointer. Right over it, it is being stroked; beside it, it gets ready to pounce,
            // and sits up now and then to bat at it.
            if (Math.abs(pointer[0]) > 0.25)
                this.dir = Math.sign(pointer[0]);
            const near = Math.abs(pointer[0]) < 0.2;
            if (!this._hovered && this._cooldown <= 0 && !near) {
                this._pounce = 1.3;
                this._cooldown = 18;
            }
            this._pounce = Math.max(0, this._pounce - dt);
            Object.assign(face, {open: 1.1, pupil: 1.35, rate: 3.2, swish: 0.6, tilt: pointer[0] * this.dir * 0.1});
            if (near) {
                this._stroked += dt;
                const purr = smoothstep(0.3, 0.9, this._stroked);
                Object.assign(face, {open: 1 - purr, arc: -1, pupil: 1, headY: -0.9 * purr, shake: 0.12 * purr, rate: 1, swish: 1,
                    tilt: Math.sin(t * 1.6) * 0.1 * purr});
                T.pose.tail = [[-4.5, -1], [-6, -7], [-3, -11]];
                if (purr > 0.9)
                    this.props.push({kind: 'purr', age: this._stroked % 2.4});
            } else {
                this._stroked = 0;
                if (this._pounce > 0) {
                    T.pose = pose('crouch');
                    this.wiggle = Math.sin(age * 24) * during(this._pounce, 0, 1.3, 0.2);
                    face.pupil = 1.5;
                } else if (age % 7 > 4.6 && age % 7 < 6.6) {
                    const bat = Math.sin(age * 8);
                    T.pose = pose('beg');
                    T.pose.fl = [7 + Math.max(0, bat) * 1.6, 12.8 - Math.max(0, bat) * 2.2];
                    T.pose.fr = [6.2 + Math.max(0, -bat) * 1.6, 14.6 - Math.max(0, -bat) * 2.4];
                }
            }
            break;
        }
        case 'waking': {
            // Out of its sleep with a long stretch and a yawn.
            T.pose = pose(age < 0.35 ? 'curl' : age < 1.5 ? 'stretch' : 'sit');
            const bow = during(age, 0.4, 1.5, 0.25);
            Object.assign(face, {mouth: during(age, 0.55, 1.35, 0.2), open: smoothstep(1.4, 1.9, age), arc: 0.4, flat: bow * 0.4});
            T.look = [0, 0];
            break;
        }
        case 'happy': {
            const kind = this._cheers % 3;
            const hop = Math.abs(Math.sin(age * 7.5)) * Math.exp(-age * 0.6);
            Object.assign(face, {open: 0, arc: -1, rate: 5, swish: 1});
            if (kind === 1) {
                // Jumps for it on all fours, its tail straight up.
                T.pose = pose('stand');
                T.pose.tail = [[-1.5, -4], [-2, -8], [-1, -10.5]];
                face.lift = -hop * 2.4;
            } else if (kind === 2) {
                // Up on its haunches, both paws in the air.
                const wave = Math.sin(age * 11);
                T.pose = pose('beg');
                T.pose.fl = [6.6 + wave * 0.8, 10.8 - Math.max(0, wave)];
                T.pose.fr = [5.6 - wave * 0.8, 11.6 - Math.max(0, -wave)];
            } else {
                // A little dance where it sits: its head from side to side, a paw up.
                T.pose.fl = [7.6, 15.6 + Math.sin(age * 10) * 1.6];
                face.tilt = Math.sin(age * 7.5) * 0.2;
                face.lift = -hop * 0.9;
            }
            T.look = [0, 0];
            break;
        }
        case 'satisfied':
            Object.assign(face, {open: 0, arc: -1, tilt: 0.1, shake: 0.12, rate: 0.9});
            break;
        case 'music': {
            // Headphones on; twelve seconds each of nodding where it sits, dancing on all fours, both paws in
            // the air, and lying with its eyes shut, the tail keeping time.
            const beat = this.musicAge * 2.8, sway = Math.sin(beat);
            const kind = Math.floor(this.musicAge / 12) % 4;
            Object.assign(face, {phones: 1, tilt: sway * 0.14, open: this.musicAge % 6 > 4.4 ? 1 : 0, arc: -1, rate: 2.8});
            if (kind === 0) {
                face.headY = -Math.abs(Math.cos(beat)) * 0.6;
            } else if (kind === 1) {
                T.pose = pose('stand');
                T.pose.fl[1] -= Math.max(0, sway) * 2.2;
                T.pose.fr[1] -= Math.max(0, -sway) * 2.2;
                T.pose.hl[1] -= Math.max(0, -sway) * 1.2;
                T.pose.hr[1] -= Math.max(0, sway) * 1.2;
                T.pose.hip[0] += sway * 0.8;
                T.pose.tail = [[-3, -3.5], [-4.5, -7.5], [-2.5, -10]];
                face.headY = -Math.abs(Math.cos(beat)) * 0.7;
                face.swish = 1.4;
            } else if (kind === 2) {
                T.pose = pose('beg');
                T.pose.fl = [7.2 + sway * 0.6, 12.4 - sway * 1.8];
                T.pose.fr = [6.2 - sway * 0.6, 13.6 + sway * 1.8];
                T.pose.head[0] += sway * 0.5;
            } else {
                T.pose = pose('sphinx');
                Object.assign(face, {open: 0, tilt: sway * 0.08, rate: 5.6, swish: 1});
                T.pose.fl[1] -= Math.max(0, sway) * 0.8;
            }
            T.look = [0, 0];
            break;
        }
        case 'worried': {
            // Its back up and its tail out; then down low, looking about.
            const low = age % 10 > 4;
            T.pose = pose(low ? 'crouch' : 'arch');
            Object.assign(face, {flat: 1, open: 1.12, pupil: 0.55, puff: 1, swish: 0.25, shake: low ? 0.1 : 0.24});
            if (low) {
                T.look = [Math.sin(age * 2.2), -0.3];
                T.pose.head[1] += 1;
            }
            break;
        }
        case 'focused': {
            // At its little computer, glasses on: paws going on the keys, a think now and then.
            const think = during(age % 13, 9.5, 12, 0.3);
            const type = Math.sin(age * 13);
            T.pose = pose('sphinx');
            T.pose.fl = [10.4, 26 - Math.max(0, type) * 1.1 * (1 - think)];
            T.pose.fr = [9.2, 26 - Math.max(0, -type) * 1.1 * (1 - think)];
            T.pose.tail = [[-2.5, 1.9], [2, 2.2], [6.5, 1.6]];
            Object.assign(face, {glasses: 1, open: lerp(0.66, 1, think), swish: 0.3, tilt: -0.22 * think});
            T.look = mix([this.dir * (0.45 + Math.sin(age * 0.9) * 0.2), 0.7], [-0.4 * this.dir, -0.8], think);
            this.props.push({kind: 'laptop', glow: 0.75 + Math.sin(age * 5) * 0.08});
            break;
        }
        case 'dozing': {
            // A loaf whose head sinks, and comes up with a start.
            const nod = age % 5.2;
            T.pose = pose('loaf');
            T.pose.head[1] += smoothstep(0, 4.4, nod) * 2.4 * (1 - smoothstep(4.4, 4.7, nod));
            Object.assign(face, {open: 0.3, swish: 0, tilt: 0.08});
            T.look = [0, 0.5];
            break;
        }
        case 'sleeping':
            // Curled up nose to tail, or a loaf with its chin down; it dreams of a fish now and then.
            T.pose = pose(this._naps % 2 ? 'curl' : 'loaf');
            if (this._naps % 2 === 0)
                Object.assign(T.pose, {head: [8.4, 21.2], tilt: 0.3});
            T.pose.girth *= 1 + Math.sin(t * 1.2) * 0.035;
            Object.assign(face, {open: 0, arc: 1, swish: 0});
            this.twitch = age % 9 > 8.4 ? Math.sin(age * 40) * 0.3 : 0;
            T.look = [0, 0];
            if (age % 24 > 14 && age % 24 < 21)
                this.props.push({kind: 'dream', k: during(age % 24, 14, 21, 0.6)});
            break;
        }
        this._hovered = state === 'curious';
        // A blink in each 5.6 s.
        if (face.open > 0.5 && ['awake', 'curious', 'focused', 'worried'].includes(state) && this.act?.name !== 'blink') {
            const blink = (t % 5.6 - 3.1) / 0.2;
            if (blink >= 0 && blink < 1)
                face.open *= 1 - Math.sin(blink * Math.PI);
        }
        ease(this._pose, T.pose, 9, dt);
        for (const key of Object.keys(FACE)) {
            // The eyes and a hop are quick.
            const rate = {open: 20, lift: 30, rate: 4, puff: 8}[key] ?? 12;
            this._face[key] = approach(this._face[key], face[key], rate, dt);
        }
        this._gaze = this._gaze.map((axis, index) => approach(axis, (T.look ?? pointer)[index], 10, dt));
        this._side = approach(this._side, this.dir, 16, dt);
        this._tail += dt * this._face.rate * (animate ? 1 : 0);
    }

    /** Draws it with `pen` (catPen.js), the box's middle at `cx`, at clock `t`. On a light island (`light`) it
     * gets a dark line round it. */
    draw(pen, cx, t, animate = true, light = false) {
        const st = this.style;
        const P = this._pose, f = this._face;
        const shake = animate ? Math.sin(t * 34) * f.shake : 0;
        // Turning round, it is seen thin for a moment.
        const side = Math.abs(this._side) < 0.12 ? Math.sign(this._side || 1) * 0.12 : this._side;
        const place = ([x, y]) => [cx + this.px + side * (x + shake), y + f.lift];
        // A brush's edge: each line again beside itself, a little off, anew a few times a second.
        const beat = animate ? Math.floor(t * 5) : 0;
        const off = (index, salt) => (Math.sin((index + 1) * 12.9898 + salt * 78.233 + beat * 37.719) * 43758.5453 % 1) * 0.6;
        // The pen, for a cat that looks right standing at 0: turned and put where it is.
        const on = {
            path: (points, width, color) => {
                pen.path(points.map(place), Math.max(0.1, width), color);
                if (st.rough && width > 1.2) {
                    for (const salt of [1, 2])
                        pen.path(points.map(([x, y], index) => place([x + off(index >> 1, salt), y + off(index >> 1, salt + 5)])), Math.max(0.1, width * 0.86), color);
                }
            },
            poly: (points, color) => pen.poly(points.map(place), color),
            circle: ([x, y], r, color) => pen.circle(...place([x, y]), r, color),
        };

        const hip = [P.hip[0] + this.wiggle * 0.8, P.hip[1]];
        const chest = P.chest;
        const middle = [(hip[0] + chest[0]) / 2, (hip[1] + chest[1]) / 2 + P.sag * 1.6];
        const spine = bezier(hip, mix(hip, middle, 0.9), mix(chest, middle, 0.9), chest, 12);
        // Out of its back at a place along it.
        const up = index => {
            const a = spine[Math.max(0, index - 1)], b = spine[Math.min(12, index + 1)];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            return [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
        };
        const back = (index, by) => [spine[index][0] + up(index)[0] * by, spine[index][1] + up(index)[1] * by];
        const sway = Math.sin(this._tail) * f.swish;
        const root = [hip[0] + P.root[0], hip[1] + P.root[1]];
        const tail = bezier(root, ...P.tail.map(([x, y], index) =>
            [root[0] + x + sway * P.swing[0] * index / 2, root[1] + y + sway * P.swing[1] * index / 2]));
        const tailWidth = 1.7 + f.puff * 1.5;
        const head = [P.head[0] + f.headX, P.head[1] + f.headY];
        const neck = [[chest[0] - 0.5, chest[1] - P.girth * 0.12], [head[0] - 1.3, head[1] + 1.4]];
        // Its head is seen from the side, nodding with where it looks.
        const nod = P.tilt + f.tilt + this._gaze[1] * 0.16;
        const cos = Math.cos(nod), sin = Math.sin(nod);
        const at = ([x, y]) => [head[0] + (x * cos - y * sin) * 0.92, head[1] + (x * sin + y * cos) * 0.92];
        const ears = [-1, 1].map(part => {
            // Laid back in a fright; the one in front twitches.
            const turn = -(f.flat * 0.9 + (part > 0 ? this.twitch : 0));
            const pivot = part < 0 ? [-2, -2.6] : [1.4, -2.9];
            const ear = part < 0 ? [[-3.7, -1.4], [-2.7, -7.5], [-0.3, -3.2]] : [[-0.3, -3.3], [2.4, -7.3], [2.9, -2]];
            return ear.map(([x, y]) => {
                const dx = x - pivot[0], dy = y - pivot[1];
                return at([pivot[0] + dx * Math.cos(turn) - dy * Math.sin(turn), pivot[1] + dx * Math.sin(turn) + dy * Math.cos(turn)]);
            });
        });
        const skull = ellipse(0, 0, 4.2, 3.8).map(at);
        const brow = [[1.4, -3.4], [3.9, 0], [3.9, 2.6], [0, 3.6]].map(at);
        const muzzle = ellipse(2.5, 1.5, 1.85, 1.6).map(at);

        // A leg from where it joins the body to its paw, bent a little backwards, and a foot.
        const leg = (joint, paw, bent) => {
            const dx = paw[0] - joint[0], dy = paw[1] - joint[1];
            const length = Math.hypot(dx, dy) || 1;
            let normal = [-dy / length, dx / length];
            if (normal[0] > 0 || (normal[0] === 0 && normal[1] < 0))
                normal = [-normal[0], -normal[1]];
            return [joint, [(joint[0] + paw[0]) / 2 + normal[0] * length * bent, (joint[1] + paw[1]) / 2 + normal[1] * length * bent], paw];
        };
        const shoulder = [chest[0] + P.girth * 0.22, chest[1] + P.girth * 0.2];
        const thigh = [hip[0] + 0.3, hip[1] + 1];
        const legs = {fl: leg(shoulder, P.fl, 0.2), fr: leg(shoulder, P.fr, 0.2), hl: leg(thigh, P.hl, 0.26), hr: leg(thigh, P.hr, 0.26)};
        const limb = (points, color, grow) => {
            on.path(points, 1.9 + grow * 2, color);
            on.path([points[2], [points[2][0] + 0.8, points[2][1]]], 1.9 + grow * 2, color);
        };
        const blob = (points, color, grow) => {
            on.poly(points, color);
            if (grow > 0)
                on.path([...points, points[0]], Math.max(0.3, grow * 2), color);
        };
        // The whole cat in one colour, `grow` wider all round; without the legs on its other side when they
        // have a colour of their own.
        const shape = (color, grow = 0, far = true) => {
            on.path(tail, tailWidth + grow * 2, color);
            if (far) {
                limb(legs.hr, color, grow);
                limb(legs.fr, color, grow);
            }
            on.path(spine, P.girth + grow * 2, color);
            on.circle(hip, P.haunch + grow, color);
            limb(legs.hl, color, grow);
            limb(legs.fl, color, grow);
            on.path(neck, 5.2 + grow * 2, color);
            for (const part of [...ears, skull, brow, muzzle])
                blob(part, color, grow);
        };
        const farLegs = color => {
            limb(legs.hr, color, 0);
            limb(legs.fr, color, 0);
        };
        const eyeAt = [1.9, -0.6];
        const open = Math.min(f.open, 1.15);
        // Its eye: long and drawn up at the back, or shut, a line bent up when pleased and down asleep.
        const eye = (color, grow = 0) => {
            if (open < 0.22) {
                const points = [];
                for (let n = 0; n <= 6; n++) {
                    const q = n / 3 - 1;
                    points.push(at([eyeAt[0] + q * 1.05, eyeAt[1] + 0.15 + f.arc * ((1 - q * q) * 0.6 - 0.3) + q * 0.2]));
                }
                on.path(points, 0.4 + grow, color);
            } else {
                on.poly(ellipse(...eyeAt, 1.05 + grow, (0.3 + 0.36 * open) * lerp(1, f.pupil, 0.35) + grow, 0, TAU, 14, -0.22).map(at), color);
            }
        };
        const mouth = color => {
            if (f.mouth > 0.12)
                on.poly(ellipse(3.5, 2.5 + f.mouth * 0.5, 0.9 * f.mouth, 1.2 * f.mouth, 0, TAU, 12, 0.5).map(at), color);
        };
        const whiskers = color => pen.faded(0.6, () => {
            for (const [x, y] of [[7.2, 0.7], [7.4, 2.2], [6.9, 3.4]])
                on.path([at([3.4, 1.9]), at([x - 0.6, y - f.flat * 0.4])], 0.22, color);
        });
        const R = {on, at, back, hip, neck, tail, tailWidth, legs, ears, P, head};
        const rgb = color => color.gradient ? WHITE : color;

        if (st.seal)
            pen.fill(this.px > 1 ? 3 : WIDTH - 6, 22.6, 3, 3, 0.4, [216, 64, 47]);
        const ring = (width, color) => pen.layer(1, () => {
            shape(color, width);
            pen.erase(() => shape(WHITE, 0));
            // What is inside its line: the round of its haunch, and its eye.
            on.path(ellipse(hip[0], hip[1], P.haunch - 0.2, P.haunch - 0.2, -2.5, -0.3, 10), width, color);
            eye(color, 0.1);
        });
        switch (st.mode) {
        case 'ring': {
            const color = light && !st.glow ? ON_LIGHT : st.base;
            if (st.glow) {
                pen.faded(0.16, () => ring(st.width + 0.6, color));
                pen.faded(0.3, () => ring(st.width + 0.3, color));
            }
            ring(st.width, color);
            whiskers(rgb(color));
            break;
        }
        case 'glass': {
            const color = light ? ON_LIGHT : st.base;
            pen.layer(0.22, () => shape(color));
            pen.faded(0.8, () => ring(0.36, color));
            pen.faded(0.7, () => on.path([4, 5, 6, 7, 8, 9, 10].map(index => back(index, P.girth * 0.3)), 0.34, color));
            break;
        }
        case 'dots':
        case 'pixel':
            pen.pixelated(st.mode === 'dots' ? 1.9 : 1.5, () => {
                shape(st.base);
                pen.erase(() => on.circle(at([eyeAt[0], eyeAt[1] + 0.2]), open < 0.22 ? 0 : 0.8, WHITE));
            }, st.mode === 'dots');
            break;
        default:
            pen.layer(1, () => {
                if (st.edge)
                    shape(st.edge, 0.34);
                else if (light)
                    shape(ON_LIGHT, 0.4);
                if (st.far)
                    farLegs(st.far);
                shape(st.base, 0, !st.far);
                if (st.marks) {
                    pen.masked(() => shape(WHITE, 0, !st.far), () => this._drawMarks(pen, R, t, animate, true));
                    this._drawMarks(pen, R, t, animate, false);
                }
                if (st.cut) {
                    pen.erase(() => {
                        eye(WHITE);
                        mouth(WHITE);
                    });
                } else {
                    eye(open < 0.22 ? st.line : st.eye);
                    if (st.pupil && open >= 0.22)
                        on.poly(ellipse(...eyeAt, clamp(0.2 * f.pupil ** 2.4, 0.14, 0.7), 0.28 + 0.34 * open, 0, TAU, 10, -0.22).map(at), DARK);
                    mouth(MOUTH);
                }
            });
            whiskers(st.edge ?? rgb(st.base));
        }

        // What it wears: glasses for work, headphones for a song.
        const detail = st.mode || st.cut ? rgb(st.base) : st.line;
        if (f.glasses > 0.5) {
            const rim = st.cut ? DARK : detail;
            on.path(ellipse(...eyeAt, 1.75, 1.6).map(at), 0.4, rim);
            on.path([at([0.2, -0.9]), at([-2.6, -1.6])], 0.4, rim);
        }
        if (f.phones > 0.5) {
            on.path(ellipse(-0.6, 0.4, 4.6, 5.4, Math.PI * 1.08, Math.PI * 1.62, 12).map(at), 0.9, BAND);
            on.poly(ellipse(-1.2, 0.5, 1.7, 2.1).map(at), CUP);
        }
        this._drawProps(on, pen, place);
        this._drawSigns(pen, place(head), t, animate);
    }

    // The look's pattern on the cat. `within` is what is kept to the cat's shape; the rest is drawn over it.
    _drawMarks(pen, R, t, animate, within) {
        const st = this.style;
        const {on, at, back, hip, neck, tail, tailWidth, legs, ears, P} = R;
        const girth = P.girth;
        const front = [[neck[1][0] + 1.6, neck[1][1] + 1.6], [neck[0][0] + 1.9, neck[0][1] + 1.2], [neck[0][0] + 1.5, neck[0][1] + girth * 0.55]];
        const paws = (color, r) => {
            for (const points of [legs.fl, legs.hl])
                on.circle([points[2][0] + 0.4, points[2][1]], r, color);
        };
        switch (st.marks) {
        case 'tabby':
            if (within) {
                for (const index of [2, 4, 6, 8, 10])
                    on.path([back(index, girth * 0.5), back(index, girth * 0.08)], 0.8, st.line);
                for (const index of [8, 12])
                    on.path([tail[index], [tail[index][0] + 0.1, tail[index][1] + 0.1]], tailWidth + 0.4, st.line);
                on.path(front, 2.4, [233, 225, 212]);
                on.poly(ellipse(3, 1.9, 1.9, 1.5).map(at), [233, 225, 212]);
                on.path([at([-1.4, -3.2]), at([-0.8, -1.8])], 0.5, st.line);
                on.path([at([0.2, -3.5]), at([0.6, -2.1])], 0.5, st.line);
                on.circle(at([4.2, 0.9]), 0.36, [196, 132, 128]);
            } else {
                on.path(tail.slice(-3), tailWidth, st.line);
            }
            break;
        case 'shadow':
            // Dark behind a line from under its hips up to its head, light in front of it.
            if (within)
                on.poly([[hip[0] + 1, 32], [R.head[0] - 1.6, R.head[1] - 10], [-40, -10], [-40, 32]], st.far);
            break;
        case 'facets': {
            if (!within)
                break;
            // Folded paper: flat faces, each a shade of its own.
            const tones = [[244, 239, 230], [217, 210, 198], [188, 180, 166], [154, 146, 134]];
            for (let index = 0; index < 12; index += 3) {
                const a = back(index, girth), b = back(index, -girth), c = back(index + 3, girth), d = back(index + 3, -girth);
                on.poly([a, b, c], tones[(index / 3 + 1) % 4]);
                on.poly([b, c, d], tones[(index / 3 + 3) % 4]);
            }
            for (let n = 0; n < 5; n++) {
                const from = n / 5 * TAU + 0.4, to = (n + 1) / 5 * TAU + 0.4;
                on.poly([hip, [hip[0] + Math.cos(from) * 7, hip[1] + Math.sin(from) * 7], [hip[0] + Math.cos(to) * 7, hip[1] + Math.sin(to) * 7]],
                    tones[[1, 3, 2, 0, 2][n]]);
            }
            on.path(neck, 6, tones[1]);
            for (const [name, tone] of [['fl', 1], ['hl', 2]]) {
                on.path(legs[name].slice(0, 2), 3, tones[tone]);
                on.path(legs[name].slice(1), 3, tones[tone + 1]);
            }
            for (let n = 0; n < 4; n++)
                on.path(tail.slice(n * 4, n * 4 + 5), tailWidth + 1, tones[[2, 3, 1, 2][n]]);
            for (let n = 0; n < 4; n++) {
                const from = n / 4 * TAU - 0.9, to = (n + 1) / 4 * TAU - 0.9;
                on.poly([at([0.6, 0]), at([Math.cos(from) * 9, Math.sin(from) * 9]), at([Math.cos(to) * 9, Math.sin(to) * 9])], tones[[0, 2, 1, 0][n]]);
            }
            on.poly(ears[0], tones[2]);
            on.poly(ears[1], tones[1]);
            break;
        }
        case 'collar':
            if (within) {
                // A broad collar and a fine one under it, and a line drawn back from its eye.
                const across = (share, wide) => {
                    const middle = mix(neck[0], neck[1], share);
                    const dx = neck[1][0] - neck[0][0], dy = neck[1][1] - neck[0][1];
                    const length = Math.hypot(dx, dy) || 1;
                    on.path([[middle[0] - dy / length * 3, middle[1] + dx / length * 3], [middle[0] + dy / length * 3, middle[1] - dx / length * 3]], wide, st.line);
                };
                across(0.58, 1.3);
                across(0.22, 0.4);
                on.path([at([0.9, -0.5]), at([-0.9, 0.1])], 0.32, st.line);
            } else {
                on.circle(mix(neck[0], neck[1], 0.05).map((axis, index) => axis + (index ? 0.4 : 2)), 0.7, [63, 182, 200]);
                on.path(ellipse(-3.3, -2.3, 0.75, 0.75).map(at), 0.32, st.line);
            }
            break;
        case 'stars': {
            if (!within)
                break;
            const stars = [[at([-1, 0.4]), 0.3], [at([-2.4, -3.6]), 0.2], [back(11, 0.6), 0.22], [back(8, -1.2), 0.3], [back(6, 1.4), 0.2],
                [back(3, -0.8), 0.26], [[hip[0] + 0.6, hip[1] + 2.4], 0.22], [[hip[0] - 2.2, hip[1] + 0.2], 0.2], [back(10, -2), 0.16], [back(1, 2), 0.16]];
            pen.faded(0.7, () => on.path(stars.slice(0, 7).map(([point]) => point), 0.14, st.line));
            stars.forEach(([point, r], index) =>
                pen.faded(animate ? 0.65 + Math.sin(t * 2.2 + index * 2.4) * 0.35 : 1, () => on.circle(point, r, WHITE)));
            break;
        }
        case 'scrolls': {
            if (!within)
                break;
            const scroll = ([x, y], size) => {
                const points = [];
                for (let n = 0; n <= 20; n++) {
                    const turn = n / 20 * Math.PI * 3;
                    points.push([x + Math.cos(turn) * turn * size, y + Math.sin(turn) * turn * size]);
                }
                on.path(points, 0.4, st.line);
            };
            scroll(back(3, 0.2), 0.17);
            scroll(back(7, -0.3), 0.15);
            scroll(back(10, 0.3), 0.13);
            scroll([hip[0] - 0.3, hip[1] + 1.6], 0.17);
            const middle = mix(neck[0], neck[1], 0.4);
            on.path([[middle[0] - 4, middle[1] - 1.4], [middle[0], middle[1] + 0.6], [middle[0] + 4, middle[1] + 0.2]], 0.6, st.line);
            break;
        }
        case 'cracks':
            if (within) {
                const seam = points => on.path(points, 0.34, st.line);
                seam([at([-1.2, -3.4]), at([0.4, -1]), at([-0.4, 1.6]), mix(neck[0], neck[1], 0.5), back(11, 1.2), back(9, -1), back(7, 0.9), back(4, -0.8),
                    [hip[0] + 0.6, hip[1] + 1.2], [hip[0] - 0.8, hip[1] + 5]]);
                seam([back(9, -1), back(8, -3.4)]);
                seam([back(4, -0.8), back(3, -3.6)]);
                seam([[hip[0] + 0.6, hip[1] + 1.2], [hip[0] + 3.6, hip[1] + 3]]);
                seam([at([0.4, -1]), at([3.2, 0.6]), at([4.4, 2.6])]);
            }
            break;
        case 'tuxedo':
            if (within) {
                on.path(front, 2.8, CREAM);
                on.poly(ellipse(3, 1.9, 1.9, 1.45).map(at), CREAM);
                paws(CREAM, 1.5);
                on.circle(at([4.2, 0.9]), 0.34, [226, 140, 156]);
            } else {
                on.path(tail.slice(-3), tailWidth, CREAM);
                for (const points of [legs.fr, legs.hr])
                    on.circle([points[2][0] + 0.4, points[2][1]], 1, [198, 194, 190]);
            }
            break;
        case 'points':
            if (within) {
                on.poly(ellipse(2.6, 1, 2.7, 2.6).map(at), st.far);
                for (const ear of ears)
                    on.poly(ear, st.far);
                for (const points of [legs.fl, legs.hl]) {
                    on.path([mix(points[1], points[2], 0.3), points[2]], 2.3, st.far);
                    on.circle([points[2][0] + 0.4, points[2][1]], 1.4, st.far);
                }
            } else {
                on.path(tail.slice(2), tailWidth, st.far);
            }
            break;
        case 'calico':
            if (within) {
                on.circle([hip[0] - 0.6, hip[1] - 0.4], P.haunch * 0.78, ORANGE);
                on.path([back(7, girth * 0.2), back(10, girth * 0.2)], girth * 0.75, [58, 48, 54]);
                on.poly(ellipse(-2.2, -1.6, 2.7, 2.7).map(at), ORANGE);
                on.poly(ears[0], ORANGE);
                on.poly(ears[1], [58, 48, 54]);
                on.circle(at([4.2, 0.9]), 0.34, [217, 138, 138]);
            } else {
                on.path(tail.slice(3), tailWidth, ORANGE);
                on.path(tail.slice(-4), tailWidth, [58, 48, 54]);
            }
            break;
        }
    }

    // What it plays with or sits at.
    _drawProps(on, pen, place) {
        for (const prop of this.props) {
            switch (prop.kind) {
            case 'yarn': {
                // The ball, and its thread on the ground behind it; at the box's end it is gone.
                const [x, y] = place([prop.x, prop.y]);
                const away = Math.sign(place([1, 0])[0] - place([0, 0])[0]) || 1;
                const bx = clamp(x, 2.4, WIDTH - 2.4);
                pen.faded(1 - smoothstep(0, 3, Math.abs(x - bx)), () => {
                    const end = dx => clamp(bx + away * dx, 0.4, WIDTH - 0.4);
                    pen.path([[bx, GROUND + 0.4], [end(2.5), GROUND + 0.1], [end(5), GROUND + 0.5], [end(7.5), GROUND + 0.2]], 0.4, YARN);
                    pen.circle(bx, y, 1.9, YARN);
                    for (const turn of [0, 1.1, 2.2])
                        pen.path(ellipse(bx, y, 1.9, 0.7, 0.2, Math.PI - 0.2, 8, prop.spin + turn), 0.32, [255, 190, 198]);
                });
                break;
            }
            case 'butterfly': {
                const [x, y] = place([prop.x, prop.y]);
                const bx = clamp(x, 3.2, WIDTH - 3.2), by = clamp(y, 2.6, HEIGHT - 3);
                pen.faded(prop.k * (1 - smoothstep(0, 3, Math.hypot(x - bx, y - by))), () => {
                    const wide = 0.5 + Math.abs(Math.sin(prop.flap)) * 1.9;
                    for (const part of [-1, 1]) {
                        pen.poly([[bx, by], [bx + part * wide, by - 1.9], [bx + part * wide * 1.1, by + 0.2]], WING);
                        pen.poly([[bx, by], [bx + part * wide * 0.8, by + 1.5], [bx + part * wide * 0.2, by + 1.2]], WHITE);
                    }
                });
                break;
            }
            case 'laptop':
                on.path([[8, GROUND + 0.5], [13.4, GROUND + 0.5]], 0.9, [150, 156, 172]);
                on.poly([[13.2, GROUND + 0.2], [15.6, 21], [16.4, 21.2], [14, GROUND + 0.4]], [112, 118, 136]);
                pen.faded(prop.glow, () => on.poly([[13.3, GROUND - 0.5], [15.3, 21.8], [15.6, 21.9], [13.6, GROUND - 0.4]], CYAN));
                break;
            case 'call':
                pen.faded(prop.k, () => {
                    const mouth = [this._pose.head[0] + 6, this._pose.head[1] + 2.4];
                    for (const [r, wide] of [[1.5, 0.7], [2.8, 0.6]])
                        on.path(ellipse(mouth[0], mouth[1], r, r, -wide, wide, 6), 0.4, WHITE);
                });
                break;
            }
        }
    }

    // What shows beside it: z's and a dream asleep, hearts when pleased or stroked, notes to a song, a "!" in
    // a worry. `head` is where its head is in the box.
    _drawSigns(pen, head, t, animate) {
        const clock = animate ? t : 0;
        // Beside its head, on the side with room.
        const beside = (dx, dy) => [clamp(head[0] + (head[0] > WIDTH / 2 ? -dx - 2 : dx), 2.5, WIDTH - 6), Math.max(4, head[1] + dy)];
        const hearts = (age, spots) => {
            for (const [dx, dy, size, delay] of spots) {
                const since = age - delay;
                const [x, y] = beside(dx, dy - Math.max(0, since) * 2);
                pen.faded(smoothstep(0, 0.25, since) * (1 - smoothstep(1.5, 2.3, since)), () => pen.poly(heart(x, Math.max(3, y), size), HEART));
            }
        };
        for (const prop of this.props) {
            if (prop.kind === 'purr')
                hearts(prop.age, [[8, -2, 1.9, 0]]);
            if (prop.kind === 'dream') {
                // A thought going up, and in it a fish.
                pen.faded(prop.k * 0.92, () => {
                    const x = clamp(head[0] + 3, 9, WIDTH - 9), y = 9;
                    pen.circle(x - 5.5, y + 6.6, 0.7, WHITE);
                    pen.circle(x - 3.6, y + 4.6, 1.1, WHITE);
                    pen.poly(ellipse(x, y, 6.6, 4.4), WHITE);
                    pen.poly(ellipse(x - 0.8, y, 2.9, 1.5), [110, 170, 235]);
                    pen.poly([[x + 1.6, y], [x + 4, y - 1.6], [x + 4, y + 1.6]], [110, 170, 235]);
                    pen.circle(x - 2.3, y - 0.3, 0.32, DARK);
                });
            }
        }
        switch (this.state) {
        case 'dozing':
        case 'sleeping': {
            if (this.props.some(prop => prop.kind === 'dream'))
                break;
            const bob = (Math.sin(clock * 1.4) + 1) * 0.7;
            const x = clamp(head[0] - 2, 4, WIDTH - 12);
            pen.text(x, 12.5 - bob, 'z', 7, SLEEP);
            if (this.state === 'sleeping')
                pen.text(x + 5, 8 - bob, 'z', 5.5, SLEEP);
            break;
        }
        case 'happy':
            hearts(this.age, [[8.5, -1, 2.1, 0], [-11.5, 1, 1.7, 0.3]]);
            break;
        case 'satisfied':
            hearts(this.age, [[8.5, -1, 2.2, 0]]);
            break;
        case 'music':
            // Notes going up beside it, one after the other.
            for (const [dx, delay] of [[9, 0], [-12, 1.6]]) {
                const age = (this.musicAge + delay) % 3.2;
                const [x, y] = beside(dx + Math.sin(age * 2.4), 4 - age * 2.4);
                pen.faded(smoothstep(0, 0.4, age) * (1 - smoothstep(2.3, 3.2, age)) * smoothstep(0, 1, this.age), () => {
                    pen.seg([x + 1.1, y - 4.4], [x + 1.1, y], 0.8, WHITE);
                    pen.seg([x + 1.1, y - 4], [x + 3, y - 3.3], 1, WHITE);
                    pen.circle(x, y, 1.3, WHITE);
                });
            }
            break;
        case 'worried': {
            // Over its head.
            const x = clamp(head[0] - 0.75, 1, WIDTH - 2.5), y = Math.max(0.8, head[1] - 15.5);
            pen.fill(x, y, 1.5, 3.8, 0.75, YELLOW);
            pen.circle(x + 0.75, y + 5.6, 0.85, YELLOW);
            break;
        }
        }
    }
}

/** The box it is drawn in, as the eyes'. */
export {HEIGHT, WIDTH};
