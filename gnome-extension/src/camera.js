// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The camera's picture lifted by a level (cameraRules.js says what each turns), on the camera itself through v4l2-ctl
// (v4l-utils), so every app sees the change at once, a call already running too. The level is kept by camera in
// Settings (`camera-levels`) and set again each time the camera is taken up: a USB camera forgets on being unplugged,
// and every camera on restarting. Nothing is asked while the camera is not in use (isled says when it is).
//
// With several cameras the first one with a brightness is the one turned; a laptop's camera has a second node, for
// metadata, which has none.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

import {canLift, levelOf, parseControls, pendingSettings} from './cameraRules.js';

const NODES = '/sys/class/video4linux';

/** `argv`'s output, in the C locale; rejects when it fails. */
function run(argv, cancellable) {
    return new Promise((resolve, reject) => {
        let process;
        try {
            const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE});
            launcher.setenv('LC_ALL', 'C', true);
            process = launcher.spawnv(argv);
        } catch (error) {
            reject(error);
            return;
        }
        process.communicate_utf8_async(null, cancellable, (_process, result) => {
            try {
                const [, out, err] = process.communicate_utf8_finish(result);
                if (process.get_successful())
                    resolve(out ?? '');
                else
                    reject(new Error(`${argv.join(' ')}: ${(err ?? '').trim()}`));
            } catch (error) {
                reject(error);
            }
        });
    });
}

/** The camera nodes there are now (video0, video1, …), in number order. */
function nodes() {
    const found = [];
    try {
        const children = Gio.File.new_for_path(NODES).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = children.next_file(null)))
            found.push(info.get_name());
        children.close(null);
    } catch {
        // No cameras at all.
    }
    return found.filter(name => /^video\d+$/.test(name)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
}

/** The name a camera node gives itself ("FHD Camera: FHD Camera"), by which its level is kept. */
function nodeName(node) {
    try {
        const [, bytes] = GLib.file_get_contents(`${NODES}/${node}/name`);
        return new TextDecoder().decode(bytes).trim() || node;
    } catch {
        return node;
    }
}

/** Signals: `changed` (a camera came or went, or its level changed). */
export class CameraAdjuster extends Signals.EventEmitter {
    constructor(daemon, settings) {
        super();
        this._daemon = daemon;
        this._settings = settings;
        this._cancellable = new Gio.Cancellable();
        this._tool = GLib.find_program_in_path('v4l2-ctl');
        /** The camera in use: {device, name, controls}; null while none is. */
        this.camera = null;
        this._inUse = false;
        /** Counts each time the camera is taken up or let go, or a level is picked, so a slow answer can tell it
         * is out of date. */
        this._generation = 0;
        this._daemonId = daemon.connect('changed', (_daemon, key) => {
            if (key === 'system')
                this._sync();
        });
        this._sync();
    }

    /** Whether a camera in use can be lifted. */
    get available() {
        return this.camera !== null;
    }

    /** The level the camera in use is at, or -1 when it is set otherwise. */
    get level() {
        return this.camera ? levelOf(this.camera.controls) : -1;
    }

    /** Follows isled: looks the camera over and sets its kept level as it is taken up, forgets it as it is let go. */
    async _sync() {
        const inUse = Boolean(this._daemon.state.system?.camera_in_use);
        if (inUse === this._inUse)
            return;
        this._inUse = inUse;
        const generation = ++this._generation;
        if (!inUse || !this._tool) {
            this._setCamera(null);
            return;
        }
        let camera = null;
        try {
            camera = await this._find();
            const kept = camera && this._settings.get_value('camera-levels').recursiveUnpack()[camera.name];
            if (kept && generation === this._generation)
                await this._turn(camera, kept);
        } catch (error) {
            if (!this._cancellable.is_cancelled())
                console.warn(`Isle: camera: ${error.message}`);
        }
        if (generation === this._generation)
            this._setCamera(camera);
    }

    /** The first camera node with a brightness, as it is set now. */
    async _find() {
        for (const node of nodes()) {
            const device = `/dev/${node}`;
            let text;
            try {
                text = await run([this._tool, '-d', device, '--list-ctrls'], this._cancellable);
            } catch {
                continue;
            }
            const controls = parseControls(text);
            if (canLift(controls))
                return {device, name: nodeName(node), controls};
        }
        return null;
    }

    /** Sets `camera` to `level`, where it is not already. */
    async _turn(camera, level) {
        const pairs = pendingSettings(camera.controls, level);
        if (!pairs.length)
            return;
        await run([this._tool, '-d', camera.device, '-c', pairs.join(',')], this._cancellable);
        for (const pair of pairs) {
            const [name, value] = pair.split('=');
            camera.controls.get(name).value = Number(value);
        }
    }

    /** Lifts the camera in use to `level` (0 is the camera as it is made), and keeps it for that camera. */
    async setLevel(level) {
        const camera = this.camera;
        if (!camera)
            return;
        const kept = this._settings.get_value('camera-levels').recursiveUnpack();
        if (level > 0)
            kept[camera.name] = level;
        else
            delete kept[camera.name];
        this._settings.set_value('camera-levels', new GLib.Variant('a{si}', kept));
        try {
            await this._turn(camera, level);
        } catch (error) {
            if (!this._cancellable.is_cancelled())
                console.warn(`Isle: camera: ${error.message}`);
        }
        if (camera === this.camera)
            this.emit('changed');
    }

    _setCamera(camera) {
        if (camera === this.camera)
            return;
        this.camera = camera;
        this.emit('changed');
    }

    destroy() {
        this.disconnectAll();
        this._cancellable.cancel();
        this._daemon.disconnect(this._daemonId);
    }
}
