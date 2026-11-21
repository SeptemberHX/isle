// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 zickrian

// The pen the cat (cat.js) is drawn with: Cairo's, as the eyes' pen in companion.js, and with what a cat's
// looks need more: a colour that is a gradient, a drawing seen only where another is, a drawing made whole and
// then shown faintly, a drawing rubbed out of what is there, and a drawing in large squares or dots.

import Cairo from 'cairo';

const clamp01 = x => Math.max(0, Math.min(1, x));

/** A pen on `cr`, whose units are the companion's box of `width` × `height`. A colour is [r, g, b] in 0..255,
 * or {gradient: [x0, y0, x1, y1], stops: [[offset, [r, g, b]], …]} along a line in the box. */
export function cairoPen(cr, width, height) {
    let alpha = 1;
    const ink = color => {
        if (!color.gradient) {
            cr.setSourceRGBA(color[0] / 255, color[1] / 255, color[2] / 255, alpha);
            return;
        }
        const gradient = new Cairo.LinearGradient(...color.gradient);
        for (const [offset, [r, g, b]] of color.stops)
            gradient.addColorStopRGBA(offset, r / 255, g / 255, b / 255, alpha);
        cr.setSource(gradient);
    };
    // What `draw` draws at full strength, whatever the pen's is now.
    const whole = draw => {
        const before = alpha;
        alpha = 1;
        draw();
        alpha = before;
    };
    return {
        path: (points, lineWidth, color) => {
            ink(color);
            cr.setLineWidth(lineWidth);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setLineJoin(Cairo.LineJoin.ROUND);
            points.forEach(([x, y], index) => index ? cr.lineTo(x, y) : cr.moveTo(x, y));
            cr.stroke();
        },
        seg: ([ax, ay], [bx, by], lineWidth, color) => {
            ink(color);
            cr.setLineWidth(lineWidth);
            cr.setLineCap(Cairo.LineCap.BUTT);
            cr.moveTo(ax, ay);
            cr.lineTo(bx, by);
            cr.stroke();
        },
        circle: (x, y, r, color) => {
            ink(color);
            cr.arc(x, y, Math.max(0, r), 0, 2 * Math.PI);
            cr.fill();
        },
        fill: (x, y, w, h, r, color) => {
            ink(color);
            cr.newSubPath();
            cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
            cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
            cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
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
        text: (x, base, text, size, color) => {
            ink(color);
            cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
            cr.setFontSize(size);
            cr.moveTo(x, base);
            cr.showText(text);
        },
        faded: (k, draw) => {
            const before = alpha;
            alpha *= clamp01(k);
            draw();
            alpha = before;
        },
        /** All of `draw` as one picture, shown at `k` of its strength: where its shapes lie over each other
         * they do not show through. */
        layer: (k, draw) => {
            cr.pushGroup();
            whole(draw);
            cr.popGroupToSource();
            cr.paintWithAlpha(clamp01(k) * alpha);
        },
        /** What `paint` draws, seen only where `shape` drew. */
        masked: (shape, paint) => {
            cr.pushGroup();
            whole(shape);
            const mask = cr.popGroup();
            cr.pushGroup();
            paint();
            cr.popGroupToSource();
            cr.mask(mask);
        },
        /** Rubs what `draw` draws out of the layer being drawn. */
        erase: draw => {
            cr.save();
            cr.setOperator(Cairo.Operator.DEST_OUT);
            whole(draw);
            cr.restore();
        },
        /** What `draw` draws, in squares of about `cell` units (a whole number of the screen's pixels each), or
         * with `dots` as a round dot in each square. */
        pixelated(cell, draw, dots = false) {
            const [perUnit] = cr.userToDeviceDistance(1, 0);
            const size = Math.max(1, Math.round(cell * perUnit)) / perUnit;
            const columns = Math.ceil(width / size), rows = Math.ceil(height / size);
            const small = new Cairo.ImageSurface(Cairo.Format.ARGB32, columns, rows);
            const main = cr;
            cr = new Cairo.Context(small);
            cr.scale(1 / size, 1 / size);
            // A square is the cat's or it is not.
            cr.setAntialias(Cairo.Antialias.NONE);
            whole(draw);
            cr.$dispose();
            cr = main;
            const squares = () => {
                cr.save();
                cr.scale(size, size);
                cr.setSourceSurface(small, 0, 0);
                cr.getSource().setFilter(Cairo.Filter.NEAREST);
                cr.paintWithAlpha(alpha);
                cr.restore();
            };
            if (dots) {
                this.masked(() => {
                    cr.setSourceRGBA(1, 1, 1, 1);
                    for (let row = 0; row < rows; row++) {
                        for (let column = 0; column < columns; column++) {
                            cr.newSubPath();
                            cr.arc((column + 0.5) * size, (row + 0.5) * size, size * 0.4, 0, 2 * Math.PI);
                        }
                    }
                    cr.fill();
                }, squares);
            } else {
                squares();
            }
            small.finish();
        },
        sprite: () => {},
    };
}
