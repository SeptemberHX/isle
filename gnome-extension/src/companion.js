// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The companion on the closed island (Settings → Island → Appearance): Daozai's pet (see pet.js, which holds
// its life), drawn here with Cairo and fed what goes on: where the pointer is, how long no one has been at the
// computer, and from the closed island (compact.js) whether a song plays, a focus session runs, something
// worries it, or something was just done. A face of two eyes, 48 × 30 of its units, drawn 20 times a second
// while it is seen (10 asleep); with animations off it holds still. Or, as Settings has it, a cat in the eyes'
// place (cat.js), living the same life in the same box.

import Cairo from 'cairo';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Cat} from './cat.js';
import {cairoPen} from './catPen.js';
import {onUiScale, px} from './compat.js';
import {HEIGHT, Pet, sheetName, stateFor, WIDTH} from './pet.js';
import {extensionFile} from './widgets.js';
import * as Theme from './theme.js';

/** Between two drawings (ms), awake and asleep. */
const FRAME_MS = 50;
const ASLEEP_FRAME_MS = 100;
/** The pointer counts as near (the pet is curious) this far to each side of its face, and this far below the
 * screen's top, in its units. */
const NEAR_X = 110;
const NEAR_Y = 70;
/** A strip's frame, in its own pixels: three to a unit. */
const SHEET_SCALE = 3;

export const Companion = GObject.registerClass(
class Companion extends St.DrawingArea {
    /** `height` in CSS pixels; its width follows (48 to 30). `kind` is which companion (see `kind`). */
    _init(height, kind = 'eyes') {
        super._init();
        this._height = height;
        onUiScale(this, () => this._resize());
        this._kind = kind;
        this._pet = this._make(kind);
        /** What goes on, as the closed island says (see `stateFor`). */
        this.singing = false;
        this.focusing = false;
        this.worried = false;
        this.alerting = false;
        this._monitor = global.backend.get_core_idle_monitor();
        this._start = GLib.get_monotonic_time();
        this._last = 0;
        this._tick = 0;
        this._tickMs = 0;
        /** The strip of the expression playing: {expression, surface}, let go once it is over. */
        this._sheet = null;
        this.connect('repaint', area => this._paint(area));
        this.connect('notify::mapped', () => this._sync());
        this.connect('destroy', () => {
            this._stop();
            this._dropSheet();
        });
    }

    // The eyes, or a cat in the look named after "cat-".
    _make(kind) {
        return kind.startsWith('cat-') ? new Cat(kind.slice(4)) : new Pet();
    }

    /** Which companion lives here: 'eyes', or a cat by its look ('cat-moon', see STYLES in cat.js). */
    set kind(kind) {
        if (kind === this._kind)
            return;
        this._kind = kind;
        this._dropSheet();
        this._pet = this._make(kind);
        this._last = (GLib.get_monotonic_time() - this._start) / 1e6;
        this.queue_repaint();
    }

    /** Another height, in CSS pixels. */
    resize(height) {
        this._height = height;
        this._resize();
    }

    _resize() {
        this.set_size(Math.round(px(this._height) * WIDTH / HEIGHT), px(this._height));
    }

    /** Pleased: something was just done (a focus session, a reminder, a file put on the shelf). */
    cheer() {
        this._pet.react('happy');
        this._sync();
    }

    _stop() {
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
    }

    // Draws on while it is seen, slower asleep; unseen, nothing runs.
    _sync() {
        const ms = !this.mapped ? 0 : this._pet.state === 'sleeping' ? ASLEEP_FRAME_MS : FRAME_MS;
        if (ms === this._tickMs && Boolean(this._tick) === Boolean(ms))
            return;
        this._stop();
        this._tickMs = ms;
        if (!ms) {
            this._dropSheet();
            return;
        }
        this._step();
        this._tick = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._step();
            this._sync();
            return this._tick ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        });
    }

    // Moves the pet on to now and asks for a drawing.
    _step() {
        const now = (GLib.get_monotonic_time() - this._start) / 1e6;
        const dt = Math.min(0.25, Math.max(0, now - this._last));
        this._last = now;
        const [pointerX, pointerY] = global.get_pointer();
        const [x, y] = this.get_transformed_position();
        const unit = this.get_transformed_size()[1] / HEIGHT || 1;
        // The pointer from the face's middle and from the top, in the pet's units.
        // Not laid out yet, it has no place: the pointer is then straight ahead.
        const placed = Number.isFinite(x) && Number.isFinite(y);
        const dx = placed ? (pointerX - x) / unit - WIDTH / 2 : 0;
        const dy = placed ? (pointerY - y) / unit : 15;
        const idle = this._monitor.get_idletime() / 1000;
        const pet = this._pet;
        pet.noticeIdle(idle, now);
        pet.advance(dt, true);
        const state = stateFor(pet, {now, idle, focusing: this.focusing, worried: this.worried, singing: this.singing,
            alerting: this.alerting, hovered: Math.abs(dx) <= NEAR_X && dy >= 0 && dy < NEAR_Y});
        const gaze = [Math.max(-3, Math.min(3, dx / 28)), Math.max(-1, Math.min(1.5, (dy - 15) / 40))];
        this._animate = St.Settings.get().enable_animations;
        pet.step(state, now, dt, gaze, true, this._animate);
        this._now = now;
        this.queue_repaint();
    }

    _dropSheet() {
        this._sheet?.surface.finish();
        this._sheet = null;
    }

    // The strip of `expression`, read when it starts to play and kept only while it does.
    _sheetOf(expression) {
        if (this._sheet?.expression !== expression) {
            this._dropSheet();
            try {
                const path = this._sheetPath(expression);
                this._sheet = {expression, surface: Cairo.ImageSurface.createFromPNG(path)};
            } catch (error) {
                console.warn(`Isle: the companion's ${sheetName(expression)} could not be read: ${error.message}`);
                return null;
            }
        }
        return this._sheet.surface;
    }

    // The strip's file: the one that comes with Isle, or on a light skin a copy in its colours, made the first
    // time it is wanted and kept in the cache.
    _sheetPath(expression) {
        const file = extensionFile('pet', sheetName(expression));
        if (!Theme.light())
            return file.get_path();
        const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'isle', 'pet', Theme.name()]);
        const path = GLib.build_filenamev([dir, sheetName(expression)]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS))
            return path;
        const image = GdkPixbuf.Pixbuf.new_from_file(file.get_path());
        const pixels = image.get_pixels();
        const stride = image.get_rowstride(), channels = image.get_n_channels();
        // Few colours, each many times: mapped once.
        const mapped = new Map();
        for (let y = 0; y < image.get_height(); y++) {
            for (let at = y * stride, end = at + image.get_width() * channels; at < end; at += channels) {
                if (pixels[at + 3] === 0)
                    continue;
                const key = pixels[at] << 24 | pixels[at + 1] << 16 | pixels[at + 2] << 8 | pixels[at + 3];
                let colour = mapped.get(key);
                if (!colour) {
                    colour = Theme.ink([pixels[at] / 255, pixels[at + 1] / 255, pixels[at + 2] / 255], pixels[at + 3] / 255)
                        .map(c => Math.round(c * 255));
                    mapped.set(key, colour);
                }
                pixels.set(colour, at);
            }
        }
        GLib.mkdir_with_parents(dir, 0o755);
        GdkPixbuf.Pixbuf.new_from_bytes(pixels, GdkPixbuf.Colorspace.RGB, true, 8, image.get_width(), image.get_height(), stride)
            .savev(path, 'png', [], []);
        return path;
    }

    _paint(area) {
        const cr = area.get_context();
        const unit = area.get_surface_size()[1] / HEIGHT;
        cr.scale(unit, unit);
        // A cat has a pen and colours of its own, on any island; on a light one it gets a line round it.
        if (this._pet instanceof Cat) {
            this._pet.draw(cairoPen(cr, WIDTH, HEIGHT), WIDTH / 2, this._now ?? 0, this._animate ?? true, Theme.light());
            cr.$dispose();
            return;
        }
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        let alpha = 1;
        // As the look has it: on a light skin the eyes are its ink.
        const ink = color => cr.setSourceRGBA(...Theme.ink(color.map(c => c / 255), alpha));
        const pen = {
            // A line through the points, its ends round: an eye is a capsule so.
            path: (points, width, color) => {
                ink(color);
                cr.setLineWidth(width);
                cr.setLineCap(Cairo.LineCap.ROUND);
                points.forEach(([x, y], index) => index ? cr.lineTo(x, y) : cr.moveTo(x, y));
                cr.stroke();
            },
            seg: ([ax, ay], [bx, by], width, color) => {
                ink(color);
                cr.setLineWidth(width);
                cr.setLineCap(Cairo.LineCap.BUTT);
                cr.moveTo(ax, ay);
                cr.lineTo(bx, by);
                cr.stroke();
            },
            circle: (x, y, r, color) => {
                ink(color);
                cr.arc(x, y, r, 0, 2 * Math.PI);
                cr.fill();
            },
            // A rectangle with round corners.
            fill: (x, y, width, height, r, color) => {
                ink(color);
                cr.newSubPath();
                cr.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
                cr.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
                cr.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
                cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
                cr.closePath();
                cr.fill();
            },
            poly: (points, color) => {
                ink(color);
                points.forEach(([x, y], index) => index ? cr.lineTo(x, y) : cr.moveTo(x, y));
                cr.closePath();
                cr.fill();
            },
            // From `x`, on the line `base`.
            text: (x, base, text, size, color) => {
                ink(color);
                cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
                cr.setFontSize(size);
                cr.moveTo(x, base);
                cr.showText(text);
            },
            faded: (k, draw) => {
                const before = alpha;
                alpha *= Math.max(0, Math.min(1, k));
                draw();
                alpha = before;
            },
            // One frame of an expression's strip, its top left at (x, y).
            sprite: (expression, frame, x, y) => {
                const surface = this._sheetOf(expression);
                if (!surface)
                    return;
                cr.save();
                cr.rectangle(x, y, WIDTH, HEIGHT);
                cr.clip();
                cr.scale(1 / SHEET_SCALE, 1 / SHEET_SCALE);
                cr.setSourceSurface(surface, x * SHEET_SCALE, (y - frame * HEIGHT) * SHEET_SCALE);
                cr.paint();
                cr.restore();
            },
        };
        this._pet.draw(pen, WIDTH / 2, this._now ?? 0, this._animate ?? true);
        // An expression over: its strip is let go.
        if (this._pet.expressions.current === null)
            this._dropSheet();
        cr.$dispose();
    }
});
