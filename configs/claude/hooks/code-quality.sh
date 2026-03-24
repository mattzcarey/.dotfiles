#!/bin/bash
# Combined code quality hook for Write|Edit operations
# Checks:
#   1. No .js/.jsx extensions in imports (bundler resolution doesn't need them)
#   2. No dynamic imports (await import(...)) mid-file
#   3. Duplicate function detection (warning only)

RG=/opt/homebrew/bin/rg
JQ=/usr/bin/jq

INPUT=$(cat)

CONTENT=$(echo "$INPUT" | $JQ -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | $JQ -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$CONTENT" ] && exit 0

# Only check JS/TS files
case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx|*.mts|*.mjs) ;;
    *) exit 0 ;;
esac

ERRORS=""

# --- Check 1: No .js/.jsx extensions in imports ---
# Matches: from "..." or from '...' or import("...") or import('...')  or require("...") or require('...')
# where the path ends in .js or .jsx
JS_EXT_IMPORTS=$(echo "$CONTENT" | $RG -n '(from\s+["\x27].*\.jsx?["\x27]|import\s*\(\s*["\x27].*\.jsx?["\x27]|require\s*\(\s*["\x27].*\.jsx?["\x27])' 2>/dev/null)

if [ -n "$JS_EXT_IMPORTS" ]; then
    ERRORS="${ERRORS}BLOCKED: .js/.jsx file extensions in imports are unnecessary with bundler module resolution. Remove them.\n"
    ERRORS="${ERRORS}${JS_EXT_IMPORTS}\n\n"
fi

# --- Check 2: No dynamic imports (await import(...)) ---
DYNAMIC_IMPORTS=$(echo "$CONTENT" | $RG -n 'await\s+import\s*\(' 2>/dev/null)

if [ -n "$DYNAMIC_IMPORTS" ]; then
    ERRORS="${ERRORS}BLOCKED: Dynamic import detected (await import(...)). Use static imports instead: import { x } from 'module'\n"
    ERRORS="${ERRORS}${DYNAMIC_IMPORTS}\n\n"
fi

# If any blocking errors, fail
if [ -n "$ERRORS" ]; then
    echo -e "$ERRORS" >&2
    exit 2
fi

# --- Check 3: Duplicate function detection (warning only) ---
WORK_DIR=$(pwd)

FUNC_NAMES=$(echo "$CONTENT" | $RG -o '(?:function|async function|const|let|var|def|pub fn|fn|func)\s+([a-zA-Z_][a-zA-Z0-9_]*)' --only-matching -r '$1' 2>/dev/null | sort -u)
ARROW_FUNCS=$(echo "$CONTENT" | $RG -o '(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=' --only-matching -r '$1' 2>/dev/null | sort -u)
ALL_FUNCS=$(echo -e "$FUNC_NAMES\n$ARROW_FUNCS" | grep -v '^$' | sort -u)

[ -z "$ALL_FUNCS" ] && exit 0

DUPLICATES=""

while IFS= read -r func_name; do
    [ -z "$func_name" ] && continue
    [ ${#func_name} -lt 3 ] && continue

    EXISTING=$($RG -l \
        "(function|async function|const|let|var|def|pub fn|fn|func)\s+${func_name}\s*[(=]" \
        --type-add 'code:*.{js,ts,tsx,jsx,py,zig,go,rs,c,cpp,h,hpp}' \
        --type code \
        --glob '!node_modules/*' \
        --glob '!dist/*' \
        --glob '!build/*' \
        --glob '!.git/*' \
        --glob '!*.min.js' \
        "$WORK_DIR" 2>/dev/null | grep -v "^${FILE_PATH}$" | head -3)

    if [ -n "$EXISTING" ]; then
        LOCATIONS=$($RG -n \
            "(function|async function|const|let|var|def|pub fn|fn|func)\s+${func_name}\s*[(=]" \
            --type-add 'code:*.{js,ts,tsx,jsx,py,zig,go,rs,c,cpp,h,hpp}' \
            --type code \
            --glob '!node_modules/*' \
            --glob '!dist/*' \
            --glob '!build/*' \
            --glob '!.git/*' \
            "$WORK_DIR" 2>/dev/null | grep -v "^${FILE_PATH}:" | head -3)

        if [ -n "$LOCATIONS" ]; then
            DUPLICATES="${DUPLICATES}Function '${func_name}' already exists:\n${LOCATIONS}\n\n"
        fi
    fi
done <<< "$ALL_FUNCS"

if [ -n "$DUPLICATES" ]; then
    echo "DUPLICATE FUNCTION WARNING: Consider using the existing function(s) instead of creating a new one with the same name." >&2
    echo -e "$DUPLICATES" >&2
fi

exit 0
