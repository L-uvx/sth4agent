#!/usr/bin/env sh
#
# Installs every VSCode extension stored in this folder into the local VSCode
# extensions directory, using symlinks so that the repository stays the single
# source of truth: `git pull` + "Developer: Reload Window" picks up changes.
#
# Usage:
#   ./install.sh                                          # symlink (default)
#   ./install.sh copy                                     # duplicate files
#   VSCODE_EXTENSIONS_DIR=~/.vscode-server/extensions ./install.sh
#
# VSCode Insiders and remote servers use a different directory; override it
# with VSCODE_EXTENSIONS_DIR (VSCodium: ~/.vscode-oss/extensions).

set -eu

MODE=${1:-link}
EXT_ROOT=${VSCODE_EXTENSIONS_DIR:-"$HOME/.vscode/extensions"}
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

case "$MODE" in
    link | copy) ;;
    *)
        echo "usage: $0 [link|copy]" >&2
        exit 2
        ;;
esac

# Read a flat string field from package.json without requiring node or jq.
# publisher, name and version never contain spaces, so a plain match is enough.
read_field() {
    sed -n "s/^[[:space:]]*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"[:space:]]*\)\".*/\1/p" "$2" | head -n 1
}

mkdir -p "$EXT_ROOT"

installed=0

for dir in "$REPO_ROOT"/*/; do
    src=${dir%/}
    manifest="$src/package.json"
    [ -f "$manifest" ] || continue

    publisher=$(read_field publisher "$manifest")
    name=$(read_field name "$manifest")
    version=$(read_field version "$manifest")

    if [ -z "$publisher" ] || [ -z "$name" ] || [ -z "$version" ]; then
        echo "skipping $(basename "$src"): package.json needs publisher, name and version" >&2
        continue
    fi

    id="$publisher.$name"
    target="$EXT_ROOT/$id-$version"

    # Drop an earlier version or an earlier link of the same extension.
    # rm on a symlink removes the link itself, never the link target.
    for stale in "$EXT_ROOT/$id"-*; do
        if [ -e "$stale" ] || [ -L "$stale" ]; then
            rm -rf -- "$stale"
        fi
    done

    if [ "$MODE" = 'link' ]; then
        ln -s -- "$src" "$target"
    else
        cp -R -- "$src" "$target"
        # Build output lives in the source tree; an installed copy does not need it.
        rm -f -- "$target"/*.vsix
    fi

    echo "installed $id-$version  ->  $(basename "$src")  [$MODE]"
    installed=$((installed + 1))
done

if [ "$installed" -eq 0 ]; then
    echo "no extension found next to $REPO_ROOT" >&2
    exit 1
fi

echo
echo "$installed extension(s) installed into $EXT_ROOT"
echo 'Reload the VSCode window: Ctrl+Shift+P -> Developer: Reload Window'
