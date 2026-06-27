#!/bin/bash
set -e
PYDIR="/c/Users/USER/AppData/Local/Programs/Python/Python312"
CARGODIR="/c/Users/USER/.cargo/bin"
MINGWDIR="/c/Users/USER/mingw64/bin"
NODEDIR="/c/Program Files/nodejs"
export PATH="$PYDIR:$PYDIR/Scripts:$CARGODIR:$MINGWDIR:$NODEDIR:/c/Program Files/Git/bin:/c/Program Files/Git/usr/bin:/c/Program Files/Git/cmd:/usr/bin:/bin:$PATH"
export MOZCONFIG="/c/Users/USER/Documents/drift-gecko/engine/mozconfig"
export RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc
export MOZBUILD_STATE_PATH="/c/Users/USER/.mozbuild"
export CARGO_HOME="/c/Users/USER/.cargo"
export RUSTUP_HOME="/c/Users/USER/.rustup"
export MOZILLABUILD="C:\\mozilla-build"
export PYTHONUNBUFFERED=1
cd /c/Users/USER/Documents/drift-gecko/engine
echo "=== mach package starting: $(date) ==="
python3 mach package 2>&1
echo "=== mach package done: $(date) ==="
