// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The apps' bubbles: beside the open island, on its right, a narrow capsule with a round icon for each app that
// has notifications in the list, read or not (WeChat, QQ, mail…), or a window asking for attention (what a flashing taskbar button
// is elsewhere: a chat app that tells of a message so and sends no notification), the latest first, a red count
// on its corner (a dot for a window alone). A click on one goes to that app, to the window that asks or as a
// click on its latest notification does, and its notifications leave the list; a right click only takes them off it. As the closed island's bell, a bubble stays until its notifications are cleared, here or on the Notifications page. It shows while the island is open on its Notifications page and an app has something, and counts as the island for the
// pointer: moving from the pages onto it closes nothing. The idea is Daozai's
// (https://github.com/Renly1994/xiaotang-daozai): there the unread WeChat and QQ accounts sit beside the panel.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {VERTICAL, px} from './compat.js';
import {_, ngettext} from './i18n.js';
import {icon} from './widgets.js';

/** The apps shown at most; more wait their turn (the latest come first). */
export const MAX_BUBBLES = 6;
/** Sizes in CSS pixels: an app's icon, and the capsule's distance from the island. */
const ICON = 26;
export const BUBBLES_GAP = 8;
const FADE_MS = 160;

/** "3", or "99+": a count as its badge writes it. */
export function badgeText(count) {
    return count > 99 ? '99+' : String(count);
}

// One app: its icon, and how many notifications it has in the list.
const Bubble = GObject.registerClass({
    Signals: {'opened': {}, 'read': {}},
}, class Bubble extends St.Button {
    _init() {
        super._init({
            style_class: 'isle-bubble',
            can_focus: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
        });
        // A button lays out one child: the icon and, over its corner, the count.
        const stack = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true});
        this._icon = new St.Icon({icon_size: ICON, x_expand: true, y_expand: true,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        this._badge = new St.Label({style_class: 'isle-bubble-badge', x_expand: true, y_expand: true,
            x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.START});
        stack.add_child(this._icon);
        stack.add_child(this._badge);
        this.set_child(stack);
        this.connect('clicked', (_button, which) => this.emit(which === 3 ? 'read' : 'opened'));
    }

    /** Shows `group` ({title, gicon, count}); a count of 0 (a window asking, no notification) is a dot. */
    update(group) {
        this._icon.gicon = group.gicon ?? icon('isle-bell');
        this._badge.text = group.count ? badgeText(group.count) : '';
        if (group.count)
            this._badge.remove_style_class_name('isle-bubble-dot');
        else
            this._badge.add_style_class_name('isle-bubble-dot');
        if (!group.count) {
            this.accessible_name = _('{app} wants your attention', {app: group.title || _('An app')});
            return;
        }
        this.accessible_name = ngettext('{app}: {count} notification', '{app}: {count} notifications',
            group.count, {app: group.title || _('An app'), count: group.count});
    }
});

// The windows asking for attention (GNOME's "is ready", an urgent window), until each is looked at or closes.
class Attention {
    /** `changed` is called as a window starts or stops asking. */
    constructor(changed) {
        this._changed = changed;
        /** Each asking window, with what it is watched by. */
        this._windows = new Map();
        const display = global.display;
        this._ids = ['window-demands-attention', 'window-marked-urgent'].map(signal =>
            display.connect(signal, (_display, window) => this._add(window)));
        this._ids.push(display.connect('notify::focus-window', () => this._remove(display.focus_window)));
    }

    _add(window) {
        if (!window || this._windows.has(window) || window === global.display.focus_window)
            return;
        this._windows.set(window, {at: Date.now(), id: window.connect('unmanaged', () => this._remove(window))});
        this._changed();
    }

    _remove(window) {
        const watched = this._windows.get(window);
        if (!watched)
            return;
        window.disconnect(watched.id);
        this._windows.delete(window);
        this._changed();
    }

    /** The asking windows by app, as `NotificationCenter.byApp` gives the notifications: [{key, title, gicon,
     * count: 0, notifications: [], window, at}], the window the one that asked last. */
    groups() {
        const tracker = Shell.WindowTracker.get_default();
        const groups = new Map();
        for (const [window, {at}] of this._windows) {
            const app = tracker.get_window_app(window);
            const key = app?.get_id()?.replace(/\.desktop$/, '') || window.get_wm_class() || '';
            const before = groups.get(key);
            if (!before || at > before.at) {
                groups.set(key, {key, title: app?.get_name() ?? window.get_title() ?? '', gicon: app?.get_icon() ?? null,
                    count: 0, notifications: [], window, at});
            }
        }
        return [...groups.values()];
    }

    destroy() {
        this._ids.forEach(id => global.display.disconnect(id));
        for (const [window, {id}] of this._windows)
            window.disconnect(id);
        this._windows.clear();
    }
}

/** The apps with notifications and the asking ones as one list: an app in both once, with its count and its window; the
 * latest first. */
function merged(unread, asking) {
    const at = group => group.at ?? (group.notifications[0]?.isleUnreadSince || group.notifications[0]?.datetime.to_unix() * 1000 || 0);
    const groups = new Map(unread.map(group => [group.key, {...group, at: at(group)}]));
    for (const group of asking) {
        const same = groups.get(group.key);
        if (same)
            groups.set(group.key, {...same, window: group.window, at: Math.max(same.at, group.at)});
        else
            groups.set(group.key, group);
    }
    return [...groups.values()].sort((a, b) => b.at - a.at);
}

/** Signals: `changed` when it has something to show, or no more. */
export const UnreadBubbles = GObject.registerClass({
    // `opened`: the user went to an app from it.
    Signals: {'changed': {}, 'opened': {}},
}, class UnreadBubbles extends St.BoxLayout {
    /** `center` is the NotificationCenter the notifications come from and are cleared in. */
    _init(center) {
        super._init({...VERTICAL, name: 'isleBubbles', style_class: 'isle-bubbles', reactive: true, visible: false, opacity: 0});
        this._center = center;
        this._bubbles = [];
        this._wanted = false;
        this._attention = new Attention(() => this._update());
        this._handlers = ['changed', 'seen-changed', 'updated'].map(signal => center.connect(signal, () => this._update()));
        this.connect('destroy', () => {
            this._handlers.forEach(id => center.disconnect(id));
            this._attention.destroy();
        });
        this._update();
    }

    /** Whether any app has something. */
    get any() {
        return this._bubbles.length > 0;
    }

    /** Shown beside the open island (true), or not: faded in and out. */
    set wanted(wanted) {
        if (wanted === this._wanted)
            return;
        this._wanted = wanted;
        this._sync();
    }

    _sync() {
        const show = this._wanted && this.any;
        this.remove_transition('opacity');
        const animate = St.Settings.get().enable_animations;
        if (show) {
            this.show();
            if (animate)
                this.ease({opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            else
                this.opacity = 255;
        } else if (this.visible) {
            if (animate)
                this.ease({opacity: 0, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD, onComplete: () => this.hide()});
            else
                this.hide();
        }
    }

    /** Its width once shown, in stage pixels: the icon and the capsule's padding. */
    get preferredWidth() {
        return Math.ceil(this.get_preferred_width(-1)[1]) || px(ICON + 12);
    }

    _update() {
        const groups = merged(this._center.byApp(), this._attention.groups()).slice(0, MAX_BUBBLES);
        const had = this.any;
        while (this._bubbles.length > groups.length)
            this._bubbles.pop().destroy();
        while (this._bubbles.length < groups.length) {
            const bubble = new Bubble();
            const index = this._bubbles.length;
            bubble.connect('opened', () => {
                const group = this._groups[index];
                this.emit('opened');
                // The window that asks, if one does: a notification's own click may open another.
                if (group.window) {
                    this._center.dismiss(group.notifications);
                    Main.activateWindow(group.window);
                } else {
                    this._center.openApp(group);
                }
            });
            bubble.connect('read', () => this._center.dismiss(this._groups[index].notifications));
            this._bubbles.push(bubble);
            this.add_child(bubble);
        }
        this._groups = groups;
        groups.forEach((group, index) => this._bubbles[index].update(group));
        if (this.any !== had)
            this.emit('changed');
        this._sync();
    }
});
