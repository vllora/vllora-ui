#!/usr/bin/env bash
#
# Sync the OTel trace finetune skill (`finetune-skill-otel/`) to a target project.
#
# Sibling to sync-finetune-skill.sh. Handles the second user-facing skill.
#
# Usage:
#   ./scripts/sync-finetune-otel-skill.sh /path/to/target-project
#   ./scripts/sync-finetune-otel-skill.sh ~/Documents/GitHub/test-samples/otel-phoenix
#
# What it does:
#   1. Copies finetune-skill-otel/ → target/.claude/skills/finetune-skill-otel/
#   2. Verifies the installation
#
# **Isolation rule**: this script ONLY touches `finetune-skill-otel/` — it never
# reads from or writes to `finetune-skill/`. Per
# `docs/workflow-skill-first-approach/trace-pipeline-isolation.md`.
#
# Safe to run multiple times — overwrites existing files with latest versions.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_SRC="$REPO_ROOT/finetune-skill-otel"

# ─── Validate args ────────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <target-project-dir>"
  echo ""
  echo "Example:"
  echo "  $0 ~/Documents/GitHub/test-samples/otel-phoenix"
  exit 1
fi

TARGET="$(cd "$1" 2>/dev/null && pwd || echo "$1")"

if [[ ! -d "$TARGET" ]]; then
  echo "Error: Target directory does not exist: $TARGET"
  echo "Create it first: mkdir -p $1"
  exit 1
fi

# ─── Validate source files exist ──────────────────────────────────────────────

if [[ ! -f "$SKILL_SRC/SKILL.md" ]]; then
  echo "Error: Cannot find finetune-skill-otel/SKILL.md at $SKILL_SRC"
  echo "Run this script from the vllora/ui repo root."
  exit 1
fi

# ─── Sync skill ──────────────────────────────────────────────────────────────

SKILL_DEST="$TARGET/.claude/skills/finetune-skill-otel"
mkdir -p "$SKILL_DEST"

echo "Syncing skill → $SKILL_DEST"

# Copy the top-level skill definition
cp "$SKILL_SRC/SKILL.md" "$SKILL_DEST/"

# Copy required directories (reference + scripts). Optional directories
# (templates, subagents) are copied if they exist and have content.
cp -r "$SKILL_SRC/reference" "$SKILL_DEST/"
cp -r "$SKILL_SRC/scripts" "$SKILL_DEST/"

for optional in templates subagents; do
  if [[ -d "$SKILL_SRC/$optional" ]] && [[ -n "$(ls -A "$SKILL_SRC/$optional" 2>/dev/null)" ]]; then
    cp -r "$SKILL_SRC/$optional" "$SKILL_DEST/"
  fi
done

# Drop tests/ — not needed in the installed skill
rm -rf "$SKILL_DEST/tests" 2>/dev/null || true

# Copy .gitignore if present
[[ -f "$SKILL_SRC/.gitignore" ]] && cp "$SKILL_SRC/.gitignore" "$SKILL_DEST/"

SKILL_FILES=$(find "$SKILL_DEST" -type f | wc -l | tr -d ' ')
echo "  ✓ $SKILL_FILES files"

# ─── Verify ──────────────────────────────────────────────────────────────────

echo ""
echo "Verification:"

PASS=true

if [[ -f "$SKILL_DEST/SKILL.md" ]]; then
  echo "  ✓ SKILL.md"
else
  echo "  ✗ SKILL.md missing"
  PASS=false
fi

REF_COUNT=$(find "$SKILL_DEST/reference" -name "*.md" -o -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
echo "  ✓ reference/ ($REF_COUNT files)"

SCRIPT_COUNT=$(find "$SKILL_DEST/scripts" -name "*.py" 2>/dev/null | wc -l | tr -d ' ')
echo "  ✓ scripts/ ($SCRIPT_COUNT Python files)"

# Check that the key trace-pipeline scripts are present
for expected in otel_extract.py otel_distill.py trace_grader.py trace_probe_gates.py finetune-otel.py; do
  if [[ -f "$SKILL_DEST/scripts/$expected" ]]; then
    echo "  ✓ scripts/$expected"
  else
    echo "  ✗ scripts/$expected missing"
    PASS=false
  fi
done

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
if $PASS; then
  echo "✅ Sync complete → $TARGET/.claude/skills/finetune-skill-otel/"
  echo ""
  echo "Structure:"
  echo "  $TARGET/.claude/skills/finetune-skill-otel/"
  echo "  ├── SKILL.md"
  echo "  ├── reference/ ($REF_COUNT files)"
  echo "  └── scripts/ ($SCRIPT_COUNT files, incl. finetune-otel.py orchestrator)"
  echo ""
  echo "Next steps:"
  echo "  1. cd $TARGET"
  echo "  2. Ensure gateway is running: curl -s http://localhost:9090/finetune/workflows"
  echo "  3. Start Claude Code: claude"
  echo "  4. Tell it: \"I want to finetune a tool-routing model on these OTel traces\""
else
  echo "❌ Sync completed with errors — check above"
  exit 1
fi
