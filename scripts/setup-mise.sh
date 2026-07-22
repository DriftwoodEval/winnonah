#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"
eval "$(mise activate bash)"
cd "$CLAUDE_PROJECT_DIR"
mise trust
mise install
