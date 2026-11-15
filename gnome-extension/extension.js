// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// Isle: a notch-style island for the GNOME top bar. The extension only draws;
// isled (the Rust daemon) tracks media, timers and system state over D-Bus.

import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Controller} from './src/controller.js';
import {setTranslations} from './src/i18n.js';
import {releaseIconTheme, setIconDir} from './src/widgets.js';

/** The entry point GNOME Shell loads; everything else hangs off the controller. */
export default class IsleExtension extends Extension {
    /** Isle's words in the user's language (locale/, from po/), before anything is drawn. */
    constructor(metadata) {
        super(metadata);
        this.initTranslations();
        setTranslations(this);
    }

    /** Icons first: the widgets the controller builds look them up. */
    enable() {
        setIconDir(this.dir.get_child('icons'));
        this._controller = new Controller(this);
    }

    /** Builds the island again (to or from a light skin: every icon and drawing takes the other ink), once
     * what asked has returned. */
    rebuild() {
        this._rebuilding ||= GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._rebuilding = 0;
            if (this._controller) {
                this.disable();
                this.enable();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /** Takes the island down; GNOME also calls this when the screen locks. */
    disable() {
        if (this._rebuilding)
            GLib.source_remove(this._rebuilding);
        this._rebuilding = 0;
        this._controller?.destroy();
        this._controller = null;
        releaseIconTheme();
    }
}
