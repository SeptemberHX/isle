// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The Weather page: on the left the place's weather now (its icon, the temperature, what it is called, the place,
// then what it feels like, the humidity, the wind, sunrise and sunset); on the right the week ahead, a column a
// day (the day, its icon, the chance of rain when that is worth saying, the high and the low). Off until its
// switch in Settings is on. It changes as isled's state does (weather.rs reads Open-Meteo every quarter of an
// hour); opening the page asks for a fresh look, which isled gives at most every half a minute.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {VERTICAL} from '../compat.js';
import * as Format from '../format.js';
import {_} from '../i18n.js';
import {degrees, describe, iconName, isStale, weekdayOf} from '../weather.js';
import {icon, label} from '../widgets.js';
import {Page} from './page.js';

/** The chance of rain is said from this (percent) up. */
const RAIN_WORTH_SAYING = 20;
/** The days shown, at the usual width and at Large. */
const DAYS = 5;
const DAYS_WIDE = 7;

/** A weekday's short name ("Fri"), by 0 Sunday … 6 Saturday, in the user's language. */
function weekdayName(weekday) {
    // 2026-11-15 is a Sunday.
    // TRANSLATORS: a weekday's short name over a day of the forecast, as strftime writes it ("Fri").
    return GLib.DateTime.new_utc(2026, 11, 15 + weekday, 12, 0, 0).format(_('%a'));
}

// One day of the week ahead.
const DayColumn = GObject.registerClass(
class DayColumn extends St.BoxLayout {
    _init() {
        super._init({...VERTICAL, style_class: 'isle-weather-day', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        const centred = {x_align: Clutter.ActorAlign.CENTER};
        this._name = label('', 'isle-weather-day-name', centred);
        this._icon = new St.Icon({style_class: 'isle-weather-day-icon', ...centred});
        this._rain = label('', 'isle-weather-day-rain', centred);
        this._high = label('', 'isle-weather-day-high', centred);
        this._low = label('', 'isle-weather-day-low', centred);
        for (const child of [this._name, this._icon, this._rain, this._high, this._low])
            this.add_child(child);
    }

    /** Shows `day` ({date, high, low, code, rain}), the `index`th from today. */
    update(day, index) {
        const weekday = weekdayOf(day.date);
        this._name.text = index === 0 ? _('Today') : weekday === null ? '' : weekdayName(weekday);
        this._icon.gicon = icon(iconName(day.code));
        // Its room kept either way, so the temperatures line up across the days.
        this._rain.text = day.rain >= RAIN_WORTH_SAYING ? `${day.rain}%` : ' ';
        this._high.text = degrees(day.high);
        this._low.text = degrees(day.low);
    }
});

export const WeatherPage = GObject.registerClass(
class WeatherPage extends Page {
    /** `height` is the expanded island's page height. */
    _init(daemon, {height}) {
        super._init(daemon, {
            style_class: 'isle-page isle-weather',
            layout_manager: new Clutter.BinLayout(),
            height,
        });
        this.name = 'weather';

        this._content = new St.BoxLayout({style_class: 'isle-weather-content', x_expand: true, y_expand: true});
        const now = new St.BoxLayout({...VERTICAL, style_class: 'isle-weather-now', y_align: Clutter.ActorAlign.CENTER});
        const head = new St.BoxLayout({style_class: 'isle-weather-head'});
        this._icon = new St.Icon({style_class: 'isle-weather-icon', y_align: Clutter.ActorAlign.CENTER});
        this._temp = label('', 'isle-weather-temp');
        head.add_child(this._icon);
        head.add_child(this._temp);
        this._what = label('', 'isle-weather-what');
        this._facts = label('', 'isle-weather-facts');
        this._sun = label('', 'isle-weather-facts');
        for (const line of [this._what, this._facts, this._sun])
            line.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        for (const child of [head, this._what, this._facts, this._sun])
            now.add_child(child);
        this._days = new St.BoxLayout({style_class: 'isle-weather-days', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._columns = [];
        this._content.add_child(now);
        this._content.add_child(this._days);
        this.add_child(this._content);

        // Nothing read yet, or it could not be: why, in the page's middle.
        this._empty = new St.BoxLayout({...VERTICAL, style_class: 'isle-empty', x_expand: true, y_expand: true,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        this._empty.add_child(new St.Icon({gicon: icon('weather-few-clouds-symbolic'), icon_size: 28,
            style_class: 'isle-empty-icon', x_align: Clutter.ActorAlign.CENTER}));
        this._emptyTitle = label('', 'isle-empty-title', {x_align: Clutter.ActorAlign.CENTER});
        this._emptyHint = label('', 'isle-empty-hint', {x_align: Clutter.ActorAlign.CENTER});
        this._empty.add_child(this._emptyTitle);
        this._empty.add_child(this._emptyHint);
        this.add_child(this._empty);

        this.watch(['weather'], () => this._update());
        this._update();
    }

    /** A fresh look when it is opened; isled gives one at most every half a minute. */
    onActivate() {
        this.daemon.call('weather', 'Refresh');
        this._update();
    }

    /** Isle's 12/24-hour setting changed: sunrise and sunset as it says now. */
    clockChanged() {
        this._update();
    }

    /** Settings → Size, or a height of its own: the week whole at Large. */
    onPageHeight() {
        this._update();
    }

    /** A time (ms) on the place's own clock, as Isle writes times. */
    _clock(ms, offset) {
        return Format.timeOfDay(GLib.DateTime.new_from_unix_utc(Math.floor(ms / 1000) + offset));
    }

    _update() {
        const {report, error} = this.daemon.state.weather ?? {};
        this._content.visible = Boolean(report);
        this._empty.visible = !report;
        if (!report) {
            this._emptyTitle.text = error === 'place' ? _('Couldn’t tell where you are')
                : error === 'offline' ? _('You’re offline')
                    : error === 'unreachable' ? _('The weather service isn’t answering')
                        : error ? _('Couldn’t get the weather') : _('Getting the weather…');
            this._emptyHint.text = error === 'place' ? _('Pick a place in Settings → Weather')
                : error ? _('Isle tries again in a moment') : '';
            this._emptyHint.visible = Boolean(this._emptyHint.text);
            return;
        }
        this._icon.gicon = icon(iconName(report.code, report.day));
        this._temp.text = degrees(report.temp);
        this._what.text = [_(describe(report.code)), report.place?.label].filter(Boolean).join(' · ');
        const today = report.days?.[0];
        this._facts.text = [
            today ? _('{high} / {low}', {high: degrees(today.high), low: degrees(today.low)}) : null,
            Number.isFinite(report.feels) ? _('Feels {temperature}', {temperature: degrees(report.feels)}) : null,
            Number.isFinite(report.humidity) ? _('Humidity {percent}%', {percent: report.humidity}) : null,
        ].filter(Boolean).join(' · ');
        const old = isStale(report.at_ms, Date.now());
        // What went wrong, or how old it is, takes the last line; else the wind and the sun.
        this._sun.text = error || old
            ? _('As of {time}', {time: Format.timeOfDay(GLib.DateTime.new_from_unix_local(Math.floor(report.at_ms / 1000)))})
            : [
                Number.isFinite(report.wind) ? _('Wind {speed} km/h', {speed: Math.round(report.wind)}) : null,
                report.sunrise_ms && report.sunset_ms ? _('Sun {rise} – {set}', {
                    rise: this._clock(report.sunrise_ms, report.utc_offset ?? 0),
                    set: this._clock(report.sunset_ms, report.utc_offset ?? 0),
                }) : null,
            ].filter(Boolean).join(' · ');
        this._sun.style_class = error || old ? 'isle-weather-facts isle-weather-old' : 'isle-weather-facts';

        const days = (report.days ?? []).slice(0, this.wide ? DAYS_WIDE : DAYS);
        while (this._columns.length > days.length)
            this._columns.pop().destroy();
        while (this._columns.length < days.length) {
            const column = new DayColumn();
            this._columns.push(column);
            this._days.add_child(column);
        }
        days.forEach((day, index) => this._columns[index].update(day, index));
    }
});
