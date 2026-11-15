#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Loads the extension's code as it is in this checkout into the running GNOME Shell, without logging out.
# For development on Wayland, where the Shell cannot restart and loads an extension's modules only once: the
# code is copied to a new folder each time (new files, so nothing cached), and the Shell is asked to take the
# running extension down and bring it up again from there. The installed copy is replaced too, so the next
# login runs the same code.
#
# Needs the Shell's unsafe mode, which lets programs of this session run code in it (org.gnome.Shell.Eval).
# It is off after every login. To turn it on: Alt+F2, "lg", Enter, then type
#     global.context.unsafe_mode = true
# and Enter, Esc. It stays on until you log out.
set -euo pipefail

UUID="isle@zickrian.github.io"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALLED="$HOME/.local/share/gnome-shell/extensions/$UUID"
HOT_ROOT="$HOME/.local/share/isle/hot"

eval_in_shell() {
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval "$1"
}

if [[ "$(eval_in_shell '1 + 1')" != "(true, '2')" ]]; then
    echo "The Shell's unsafe mode is off. Alt+F2, lg, Enter, then:" >&2
    echo "    global.context.unsafe_mode = true" >&2
    exit 1
fi

stage() {
    cp -r "$ROOT/gnome-extension/." "$1/"
    glib-compile-schemas "$1/schemas"
    "$ROOT/scripts/translations.sh" compile "$1" >/dev/null
}

# The installed copy, as install.sh leaves it.
mkdir -p "$HOME/.local/share/isle"
NEXT="$(mktemp -d "$HOME/.local/share/isle/ext.XXXX")"
stage "$NEXT"
rm -rf "$INSTALLED.old"
[[ -e "$INSTALLED" ]] && mv "$INSTALLED" "$INSTALLED.old"
mv "$NEXT" "$INSTALLED"
rm -rf "$INSTALLED.old"

# The copy the Shell loads now.
mkdir -p "$HOT_ROOT"
HOT="$(mktemp -d "$HOT_ROOT/$(date +%H%M%S).XXXX")"
stage "$HOT"
# The Shell names each class of widgets after its file's folder and name ("Gjs_src_widgets_Lines"), and a name
# is taken for good once registered: this copy's folders, and the shaders' own names, get a tag of their own.
TAG="h$(date +%s)"
# Settings open from this copy too, in a process of their own: prefs.js keeps src/ as it is.
cp -r "$HOT/src" "$HOT/src_$TAG"
mv "$HOT/src_$TAG/pages" "$HOT/src_$TAG/pages_$TAG"
sed -i "s#'\./src/#'./src_$TAG/#" "$HOT/extension.js"
sed -i "s#'\./pages/#'./pages_$TAG/#" "$HOT/src_$TAG"/*.js
sed -i "s#IsleShader\${name}#IsleShader${TAG}\${name}#" "$HOT/src_$TAG/shader.js"
grep -q "IsleShader${TAG}" "$HOT/src_$TAG/shader.js"
# The one before stays: the island goes back to it if this one does not come up.
ls -1dt "$HOT_ROOT"/*/ | tail -n +3 | xargs -r rm -rf

read -r -d '' CODE <<EOF || true
(async () => {
    const manager = Main.extensionManager;
    const extension = manager.lookup('$UUID');
    if (!extension)
        throw new Error('Isle is not installed in this session');
    const dir = Gio.File.new_for_path('$HOT');
    // Loaded and made before the running one is touched: a mistake in the new code leaves the island as it is.
    const module = await import(dir.get_child('extension.js').get_uri());
    const [, bytes] = dir.get_child('metadata.json').load_contents(null);
    const metadata = {...extension.metadata, ...JSON.parse(new TextDecoder().decode(bytes))};
    const next = new module.default({...metadata, dir, path: dir.get_path()});
    const old = {stateObj: extension.stateObj, metadata: extension.metadata, dir: extension.dir, path: extension.path};
    const wasOn = Boolean(old.stateObj?._controller);
    if (wasOn)
        old.stateObj.disable();
    manager._unloadExtensionStylesheet(extension);
    Object.assign(extension, {stateObj: next, metadata, dir, path: dir.get_path()});
    if (!wasOn)
        return 'loaded, Isle is turned off';
    try {
        next.enable();
        manager._loadExtensionStylesheet(extension);
    } catch (error) {
        // The old island again, and why the new one did not come up.
        try {
            next.disable();
        } catch {
            // Half built: nothing more to take down.
        }
        manager._unloadExtensionStylesheet(extension);
        Object.assign(extension, old);
        old.stateObj.enable();
        manager._loadExtensionStylesheet(extension);
        throw error;
    }
    return 'reloaded';
})()
EOF

RESULT="$(eval_in_shell "$CODE")"
echo "$RESULT"
[[ "$RESULT" == "(true,"* ]]
