// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian
//
// The companion's life: a face of two eyes on the closed island, as Daozai's pet
// (https://github.com/Renly1994/xiaotang-daozai, src/pet.rs and src/pet_expressions.rs), carried over state by
// state and number by number: Copyright (c) 2026 小唐的Token and Daozai contributors, MIT (see
// NOTICE-daozai.txt). What state it is in, how its eyes and the things beside them move, and which of its twelve
// drawn expressions plays; drawn through a pen (companion.js gives Cairo's). No GNOME here:
// tests/extension/pet.test.js runs it under node.

/** Its box, in its own units: the face's middle is at `cx`, the eyes on the line y = 14.5. */
export const WIDTH = 48;
export const HEIGHT = 30;

const WHITE = [255, 255, 255];
const GREEN = [48, 209, 88];
const CYAN = [102, 219, 255];
const YELLOW = [255, 196, 61];
const SLEEP = [170, 160, 255];

/** No one at the computer this long (s), it dozes; this long, it sleeps. Back, it takes `WAKING_S` to wake. */
export const DOZE_S = 45;
export const SLEEP_S = 180;
export const WAKING_S = 2.2;

// The drawn expressions: a strip of 16 frames each (pet/NN-name.png, 144 × 1440: 48 × 30 at three times).
export const EXPRESSIONS = ['wink', 'smug', 'blush', 'delighted', 'side-glance', 'praised',
    'heart', 'giggle', 'shy-peek', 'scan', 'peek', 'search'];
const [WINK, SMUG, BLUSH, DELIGHTED, SIDE_GLANCE, PRAISED, HEART, GIGGLE, SHY_PEEK, SCAN, PEEK, SEARCH] = EXPRESSIONS.keys();
export const FRAMES = 16;
/** How long each frame shows (s): the three that look about (scan, peek, search), and the others. */
const LOOKING_TIMES = [0.35, 0.13, 0.15, 0.18, 0.35, 0.28, 0.16, 0.11, 0.11, 0.16, 0.35, 0.28, 0.16, 0.14, 0.20, 0.35];
const TIMES = [0.35, 0.12, 0.12, 0.12, 0.13, 0.13, 0.14, 0.40, 0.18, 0.14, 0.12, 0.12, 0.12, 0.14, 0.14, 0.45];
const timesOf = expression => expression >= SCAN ? LOOKING_TIMES : TIMES;
/** The frame shown with animations off. */
const STILL_FRAME = 7;

/** An expression's file in `pet/`. */
export function sheetName(expression) {
    return `${String(expression).padStart(2, '0')}-${EXPRESSIONS[expression]}.png`;
}

/** How long (s) an expression plays. */
export function expressionDuration(expression) {
    return timesOf(expression).reduce((sum, seconds) => sum + seconds, 0);
}

/** The frame of an expression `time` seconds in. */
export function expressionFrame(expression, time) {
    let end = 0;
    const times = timesOf(expression);
    for (let index = 0; index < times.length; index++) {
        end += times[index];
        if (time < end)
            return index;
    }
    return FRAMES - 1;
}

const lerp = (a, b, t) => a + (b - a) * t;
const approach = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
const MASK = (1n << 64n) - 1n;
/** The same 0..1 for the same whole number: when in each 5.6 s it blinks. */
function hash01(n) {
    let x = (BigInt(n) * 0x9E3779B97F4A7C15n) & MASK;
    x ^= x >> 31n;
    x = (x * 0xBF58476D1CE4E5B9n) & MASK;
    x ^= x >> 29n;
    return Number(x >> 40n) / 2 ** 24;
}

// Which expression plays, and when the next one may: one now and then awake, one as the pointer comes by (not
// again for 18 s), one for a reaction; none while it sings, works, worries, wakes or rests.
class Expressions {
    constructor() {
        this.clear();
        this._next = [0, 0, 0, 0];
    }

    /** The expression playing, or null. */
    get current() {
        return this.clip?.expression ?? null;
    }

    play(expression, time = 0) {
        this.clip = {expression, time};
    }

    clear() {
        this.clip = null;
        this._wait = 8;
        this._cooldown = 0;
        this._hovered = false;
    }

    // Each kind of moment goes through its own expressions in turn.
    _choose(bucket, pool) {
        return pool[this._next[bucket]++ % pool.length];
    }

    /** The expression for a reaction, started; how long (s) the reaction lasts. */
    react(state) {
        const pool = {happy: [PRAISED, SMUG, DELIGHTED, GIGGLE], satisfied: [HEART, DELIGHTED]}[state];
        if (!pool)
            return 2.6;
        const expression = this._choose(state === 'happy' ? 2 : 3, pool);
        this.play(expression);
        return expressionDuration(expression);
    }

    step(state, dt, visible, animate) {
        if (!visible)
            return;
        if (!['awake', 'curious', 'happy', 'satisfied'].includes(state)) {
            this.clear();
            return;
        }
        this._cooldown = Math.max(0, this._cooldown - dt);
        if (this.clip) {
            this.clip.time += dt;
            if (this.clip.time >= expressionDuration(this.clip.expression)) {
                this.clip = null;
                this._wait = 22 + this._next[0] % 4 * 3;
            }
        }
        const hovered = state === 'curious';
        if (hovered && !this._hovered && this._cooldown <= 0 && !this.clip) {
            this.play(this._choose(1, [WINK, BLUSH, SIDE_GLANCE, SHY_PEEK]));
            this._cooldown = 18;
        }
        this._hovered = hovered;
        if (state === 'awake' && !this.clip && animate) {
            this._wait -= dt;
            if (this._wait <= 0)
                this.play(this._choose(0, [SCAN, DELIGHTED, PEEK, SMUG, SEARCH, GIGGLE, PRAISED, SHY_PEEK]));
        }
    }
}

// Singing: six poses in turn, 16 s each, one of the expressions between two of them.
const MUSIC_PERIOD = 16;
const MUSIC_EXPRESSIONS = [WINK, DELIGHTED, SMUG, BLUSH, HEART, SCAN, SIDE_GLANCE, GIGGLE, PRAISED, PEEK, SHY_PEEK, SEARCH];
const MUSIC_POSES = ['microphone', 'hum', 'side-sing', 'squint', 'high-note', 'smile'];
const MUSIC_CYCLE = MUSIC_EXPRESSIONS.reduce((sum, expression) => sum + MUSIC_PERIOD + expressionDuration(expression), 0);

/** Where the song is `age` seconds into its singing: {pose, elapsed, expression: {expression, time} | null}. */
export function musicSegmentAt(age) {
    let time = age % MUSIC_CYCLE;
    for (const [index, expression] of MUSIC_EXPRESSIONS.entries()) {
        const pose = MUSIC_POSES[index % MUSIC_POSES.length];
        if (time < MUSIC_PERIOD)
            return {pose, elapsed: time, expression: null};
        time -= MUSIC_PERIOD;
        if (time < expressionDuration(expression))
            return {pose, elapsed: MUSIC_PERIOD, expression: {expression, time}};
        time -= expressionDuration(expression);
    }
    return {pose: 'microphone', elapsed: 0, expression: null};
}

/** The microphone's head ([x, y] from the face's middle and line) and its angle, `age` seconds in. */
export function microphonePose(age) {
    return {head: [5.9 + Math.sin(age * 0.95) * 0.2, 20.8 + Math.sin(age * 1.35) * 0.45],
        angle: 35 * Math.PI / 180 + Math.sin(age * 1.1) * 0.07};
}

const open = height => ({height, spread: 0, curve: 0, y: 0, tilt: 0});
const arc = (spread, curve) => ({...open(0), spread, curve});

/** The state for what goes on, the first that applies (Daozai's `pet_state`): a reaction under way, waking,
 * a focus session, a worry (the battery low, the network gone), a song (not under an alert), the pointer near,
 * no one there for a while. `pet` is the Pet, `now` its clock (s), `idle` the seconds since the last input. */
export function stateFor(pet, {now, focusing, worried, singing, alerting, hovered, idle}) {
    if (pet.reaction)
        return pet.reaction.state;
    if (pet.wakingUntil > now)
        return 'waking';
    if (focusing)
        return 'focused';
    if (worried)
        return 'worried';
    if (singing)
        return alerting ? 'awake' : 'music';
    if (hovered)
        return 'curious';
    if (idle >= SLEEP_S)
        return 'sleeping';
    if (idle >= DOZE_S)
        return 'dozing';
    return 'awake';
}

export class Pet {
    constructor() {
        this.state = 'awake';
        /** {state, remaining}: happy or satisfied for a while, over everything else. */
        this.reaction = null;
        this.wakingUntil = 0;
        this.lastIdle = 0;
        this.expressions = new Expressions();
        this.age = 0;
        this.musicAge = 0;
        this._eyes = [open(4.4), open(4.4)];
        this._gaze = [0, 0];
        this._y = 0;
    }

    /** Pleased ('happy': something done) or content ('satisfied'), with an expression of that kind. */
    react(state) {
        this.reaction = {state, remaining: this.expressions.react(state)};
        this.age = 0;
    }

    /** A reaction's time runs only while it is seen. */
    advance(dt, visible) {
        if (visible && this.reaction) {
            this.reaction.remaining -= dt;
            if (this.reaction.remaining <= 0)
                this.reaction = null;
        }
    }

    /** Back at the computer after dozing or sleeping (`idle` the seconds since the last input): it wakes. */
    noticeIdle(idle, now) {
        if (this.lastIdle >= DOZE_S && idle < 1 && ['dozing', 'sleeping'].includes(this.state))
            this.wakingUntil = now + WAKING_S;
        this.lastIdle = idle;
    }

    get musicPose() {
        return musicSegmentAt(this.musicAge).pose;
    }

    /** Moves it on by `dt` (s) in `state` at clock `t` (s). `gaze` is where the pointer is ([x, y], see
     * companion.js); unseen, its ages stand still. */
    step(state, t, dt, gaze, visible, animate = true) {
        if (this.state === 'music' && ['awake', 'curious'].includes(state))
            this.expressions.clear();
        this.expressions.step(state, dt, visible, animate);
        if (state !== this.state) {
            this.state = state;
            this.age = 0;
        }
        if (visible)
            this.age += dt;
        if (state === 'music' && visible) {
            this.musicAge += dt;
            const {expression} = musicSegmentAt(this.musicAge);
            if (expression)
                this.expressions.play(expression.expression, expression.time);
        }
        const {age} = this;
        let eyes = [open(4.4), open(4.4)];
        let y = Math.sin(t * 1.7) * 0.35;
        let look = gaze;
        switch (state) {
        case 'curious':
            eyes[0].height = 5.6;
            eyes[1].height = 6.3;
            eyes[0].y = 0.6;
            eyes[1].y = -0.6;
            break;
        case 'waking':
            eyes[0].height = lerp(0, 4.4, smoothstep(0.1, 0.65, age));
            eyes[1].height = lerp(0, 4.4, smoothstep(0.4, 1.1, age));
            y = 1 - smoothstep(0, 1.2, age);
            look = [0, 0];
            break;
        case 'happy':
            eyes = [arc(2.6, -1.8), arc(2.6, -1.8)];
            y = -Math.abs(Math.sin(age * 7.5)) * 2 * Math.exp(-age * 0.65);
            break;
        case 'satisfied':
            eyes = [arc(2.2, -1.2), arc(2.2, -1.2)];
            y = Math.sin(age * 8) * 1.2 * Math.exp(-age * 0.8);
            break;
        case 'music': {
            const sway = Math.sin(this.musicAge * 1.4);
            look = [0, 0];
            y = -0.5 + sway * 0.25;
            switch (this.musicPose) {
            case 'microphone':
                eyes = [arc(2.5, 0.7), arc(2.5, 0.7)];
                break;
            case 'side-sing':
                eyes = [open(1.6), open(1.6)];
                eyes[0].y = -0.5;
                eyes[1].y = 0.5;
                look = [0.4, 0];
                y = sway * 0.35;
                break;
            case 'high-note':
                eyes = [arc(2.3, -0.7), arc(2.3, -0.7)];
                eyes[0].tilt = -0.3;
                eyes[1].tilt = 0.3;
                y = -1.5 + sway * 0.2;
                break;
            case 'hum':
                eyes = [arc(2.5, 0.7), arc(2.5, 0.7)];
                y = sway * 0.3;
                break;
            case 'squint':
                eyes = [arc(1.6, 0), arc(1.6, 0)];
                y = sway * 0.45;
                break;
            default:
                eyes = [arc(2.3, -0.8), arc(2.3, -0.8)];
                eyes[0].y = -0.5;
                eyes[1].y = 0.5;
                look = [sway * 0.5, 0];
            }
            break;
        }
        case 'worried':
            eyes[0] = {...open(2.8), spread: -0.6, tilt: -0.7, y: 0.4};
            eyes[1] = {...open(1.8), spread: 0.6, tilt: 0.7, y: 1};
            break;
        case 'focused':
            eyes = [open(1.8), open(1.8)];
            look = [gaze[0] * 0.2, 0];
            y = 0;
            break;
        case 'dozing':
            eyes = [open(0.6), open(0.6)];
            y = 1;
            look = [0, 0];
            break;
        case 'sleeping':
            eyes = [arc(2.4, 1), arc(2.4, 1)];
            y = 0.8 + Math.sin(t * 1.2) * 0.4;
            look = [0, 0];
            break;
        }
        const playing = this.expressions.current !== null;
        if (playing) {
            eyes = [open(4.4), open(4.4)];
            look = [0, 0];
            y = 0;
        }
        // A blink in each 5.6 s, at a time of its own.
        if (!playing && ['awake', 'curious', 'focused', 'worried'].includes(state)) {
            const start = 2 + hash01(Math.floor(t / 5.6)) * 2.7;
            const blink = (t % 5.6 - start) / 0.18;
            if (blink >= 0 && blink < 1) {
                for (const eye of eyes)
                    eye.height *= 1 - Math.sin(blink * Math.PI);
            }
        }
        // Singing, the eyes change slowly from one pose to the next.
        const eyeDt = state === 'music' ? dt * 0.2 : dt;
        this._eyes.forEach((eye, index) => {
            const goal = eyes[index];
            eye.height = approach(eye.height, goal.height, 17, eyeDt);
            eye.spread = approach(eye.spread, goal.spread, 17, eyeDt);
            eye.curve = approach(eye.curve, goal.curve, 17, eyeDt);
            eye.y = approach(eye.y, goal.y, 12, eyeDt);
            eye.tilt = approach(eye.tilt, goal.tilt, 12, eyeDt);
        });
        this._gaze = this._gaze.map((axis, index) => approach(axis, look[index], 10, dt));
        this._y = approach(this._y, y, 14, dt);
    }

    /** Draws it with `pen` (see companion.js), the face's middle at `cx`, at clock `t`. */
    draw(pen, cx, t, animate = true) {
        const {clip} = this.expressions;
        if (clip) {
            pen.sprite(clip.expression, animate ? expressionFrame(clip.expression, clip.time) : STILL_FRAME, cx - WIDTH / 2, 0);
            return;
        }
        this._eyes.forEach((eye, index) => {
            const x = cx + (index === 0 ? -5.6 : 5.6) + this._gaze[0];
            const y = 14.5 + this._y + eye.y + this._gaze[1];
            const points = [];
            for (let n = 0; n <= 12; n++) {
                const q = n / 6 - 1;
                points.push([x + q * eye.spread, y + q * (eye.height / 2 + eye.tilt) + (1 - q * q) * eye.curve]);
            }
            const stroke = this.state === 'music' ? 3.6 - 0.8 * smoothstep(0.5, 1.5, Math.abs(eye.spread)) : 3.6;
            pen.path(points, stroke, WHITE);
        });
        switch (this.state) {
        case 'dozing':
        case 'sleeping': {
            const bob = (Math.sin(t * 1.4) + 1) * 0.7;
            pen.text(cx + 14, 13 - bob, 'z', 7, SLEEP);
            if (this.state === 'sleeping')
                pen.text(cx + 19, 9 - bob, 'z', 5.5, SLEEP);
            break;
        }
        case 'happy':
            pen.faded(smoothstep(0, 0.2, this.age) * (1 - smoothstep(1.5, 2.5, this.age)), () => {
                for (const [dx, y, r] of [[-18, 9, 2.1], [18, 8, 2.8]]) {
                    pen.seg([cx + dx - r, y], [cx + dx + r, y], 1, GREEN);
                    pen.seg([cx + dx, y - r], [cx + dx, y + r], 1, GREEN);
                }
            });
            break;
        case 'satisfied':
            pen.poly(droplet(cx + 18, 12, 5), CYAN);
            break;
        case 'music': {
            const segment = musicSegmentAt(this.musicAge);
            pen.faded(smoothstep(0, 1, segment.elapsed), () => this._drawMusic(pen, cx, segment.pose, animate));
            break;
        }
        case 'worried':
            pen.fill(cx + 17, 8, 1.6, 4.2, 0.8, YELLOW);
            pen.circle(cx + 17.8, 14.5, 0.9, YELLOW);
            break;
        }
    }

    // The mouth for the pose, and beside it the microphone it sings into or a note.
    _drawMusic(pen, cx, pose, animate) {
        const y = this._y + this._gaze[1];
        const pulse = Math.sin(this.musicAge * 2) * 0.5 + 0.5;
        const mouth = (rx, ry) => {
            const points = [];
            for (let n = 0; n <= 24; n++) {
                const angle = n / 24 * 2 * Math.PI;
                points.push([cx - 0.8 + Math.cos(angle) * rx, 20.7 + y + Math.sin(angle) * ry]);
            }
            pen.path(points, 0.9, WHITE);
        };
        switch (pose) {
        case 'microphone':
            mouth(1.1, 0.8 + pulse * 0.5);
            break;
        case 'side-sing':
            mouth(1.5, 0.8 + pulse * 0.3);
            break;
        case 'high-note':
            mouth(1.7, 1.6 + pulse * 0.5);
            break;
        case 'hum':
            pen.path([[cx - 2.7, 20.7 + y], [cx - 1.8, 21.4 + y], [cx - 0.8, 21 + y], [cx + 0.2, 21.4 + y], [cx + 1.1, 20.7 + y]], 0.9, WHITE);
            break;
        case 'squint':
            mouth(1.2, 0.4 + pulse * 0.6);
            break;
        default:
            pen.path([[cx - 2.5, 20.6 + y], [cx - 1.6, 21.6 + y], [cx - 0.5, 21.9 + y], [cx + 0.6, 21.6 + y], [cx + 1.5, 20.6 + y]], 1, WHITE);
        }
        if (['microphone', 'side-sing', 'high-note'].includes(pose)) {
            drawMicrophone(pen, cx, y, animate ? this.musicAge : 0);
        } else {
            const noteY = 8.5 + Math.sin(this.musicAge * 1.4) * 0.6;
            pen.seg([cx + 16, noteY - 3], [cx + 16, noteY + 3], 1.1, WHITE);
            pen.seg([cx + 16, noteY - 3], [cx + 19, noteY - 2], 1.1, WHITE);
            pen.circle(cx + 14.8, noteY + 3, 1.5, WHITE);
        }
    }
}

// A hand microphone held to the mouth: its handle away from the face, its head a ball with a grille.
function drawMicrophone(pen, cx, y, age) {
    const {head, angle} = microphonePose(age);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const point = (s, v) => [cx + head[0] + s * cos - v * sin, y + head[1] + s * sin + v * cos];
    const capsule = (start, end, width, color) => pen.path([point(start, 0), point(end, 0)], width, color);
    const line = (a, b, width, color) => pen.seg(point(...a), point(...b), width, color);
    capsule(2.3, 7, 1.9, [176, 183, 197]);
    capsule(2.5, 6.8, 1.45, [76, 84, 101]);
    line([3.4, -0.53], [6.4, -0.53], 0.28, [218, 225, 237]);
    capsule(2.05, 2.65, 2.6, [126, 137, 157]);
    const [headX, headY] = point(0, 0);
    pen.circle(headX, headY, 2.6, [222, 228, 238]);
    pen.circle(headX, headY, 2.15, [164, 176, 194]);
    for (const s of [-1, 0, 1]) {
        const v = Math.sqrt(4 - s * s) * 0.88;
        line([s, -v], [s, v], 0.32, [92, 105, 126]);
    }
    for (const v of [-1, 0, 1]) {
        const s = Math.sqrt(4 - v * v) * 0.88;
        line([-s, v], [s, v], 0.3, [226, 232, 243]);
    }
}

// A drop: a point above a round bottom, the two joined along its tangents.
function droplet(cx, cy, size) {
    const r = size * 0.34;
    const center = [cx, cy + size * 0.5 - r];
    const tip = [cx, cy - size * 0.5];
    const phi = Math.acos(Math.max(-1, Math.min(1, r / (center[1] - tip[1]))));
    const points = [tip];
    for (let i = 0; i <= 20; i++) {
        const b = phi + (2 * Math.PI - 2 * phi) * i / 20;
        points.push([center[0] + r * Math.sin(b), center[1] - r * Math.cos(b)]);
    }
    return points;
}
