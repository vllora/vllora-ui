#!/usr/bin/env bash
#
# Sync the finetune skill + companion agents to a target project.
#
# Usage:
#   ./scripts/sync-finetune-skill.sh /path/to/target-project
#   ./scripts/sync-finetune-skill.sh ~/Documents/GitHub/test-samples
#
# What it does:
#   1. Copies finetune-skill/ → target/.claude/skills/finetune-skill/
#   2. Copies agents/*.md     → target/.claude/agents/
#   3. Verifies the installation
#
# Safe to run multiple times — overwrites existing files with latest versions.

set -euo pipefail

# ─── Resolve paths ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_SRC="$REPO_ROOT/finetune-skill"
AGENTS_SRC="$REPO_ROOT/agents"

# ─── Validate args ────────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <target-project-dir>"
  echo ""
  echo "Example:"
  echo "  $0 ~/Documents/GitHub/test-samples"
  echo "  $0 /tmp/my-finetune-project"
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
  echo "Error: Cannot find finetune-skill/SKILL.md at $SKILL_SRC"
  echo "Run this script from the vllora/ui repo root or via scripts/sync-finetune-skill.sh"
  exit 1
fi

# ─── Sync skill ──────────────────────────────────────────────────────────────

SKILL_DEST="$TARGET/.claude/skills/finetune-skill"
mkdir -p "$SKILL_DEST"

echo "Syncing skill → $SKILL_DEST"

# Copy skill files (exclude README.md from skill dir — it's dev-only docs)
cp "$SKILL_SRC/SKILL.md" "$SKILL_DEST/"
cp -r "$SKILL_SRC/reference" "$SKILL_DEST/"
cp -r "$SKILL_SRC/scripts" "$SKILL_DEST/"
cp -r "$SKILL_SRC/templates" "$SKILL_DEST/"

# Copy .gitignore if present
[[ -f "$SKILL_SRC/.gitignore" ]] && cp "$SKILL_SRC/.gitignore" "$SKILL_DEST/"

SKILL_FILES=$(find "$SKILL_DEST" -type f | wc -l | tr -d ' ')
echo "  ✓ $SKILL_FILES files"

# ─── Sync agents ─────────────────────────────────────────────────────────────

AGENTS_DEST="$TARGET/.claude/agents"
mkdir -p "$AGENTS_DEST"

echo "Syncing agents → $AGENTS_DEST"

AGENT_COUNT=0
for agent_file in "$AGENTS_SRC"/*.md; do
  [[ -f "$agent_file" ]] || continue
  agent_name="$(basename "$agent_file")"
  cp "$agent_file" "$AGENTS_DEST/$agent_name"
  echo "  ✓ $agent_name"
  AGENT_COUNT=$((AGENT_COUNT + 1))
done

if [[ $AGENT_COUNT -eq 0 ]]; then
  echo "  ⚠ No agent files found at $AGENTS_SRC"
fi

# ─── Verify ──────────────────────────────────────────────────────────────────

echo ""
echo "Verification:"

PASS=true

# Check skill
if [[ -f "$SKILL_DEST/SKILL.md" ]]; then
  echo "  ✓ SKILL.md"
else
  echo "  ✗ SKILL.md missing"
  PASS=false
fi

# Check reference docs
REF_COUNT=$(find "$SKILL_DEST/reference" -name "*.md" -o -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
echo "  ✓ reference/ ($REF_COUNT files)"

# Check scripts
SCRIPT_COUNT=$(find "$SKILL_DEST/scripts" -name "*.py" 2>/dev/null | wc -l | tr -d ' ')
echo "  ✓ scripts/ ($SCRIPT_COUNT Python files)"

# Check agents
for expected_agent in knowledge-extractor relation-builder training-monitor; do
  if [[ -f "$AGENTS_DEST/$expected_agent.md" ]]; then
    echo "  ✓ $expected_agent.md"
  else
    echo "  ✗ $expected_agent.md missing"
    PASS=false
  fi
done

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
if $PASS; then
  echo "✅ Sync complete → $TARGET/.claude/"
  echo ""
  echo "Structure:"
  echo "  $TARGET/.claude/"
  echo "  ├── agents/"
  for f in "$AGENTS_DEST"/*.md; do
    [[ -f "$f" ]] && echo "  │   └── $(basename "$f")"
  done
  echo "  └── skills/"
  echo "      └── finetune-skill/"
  echo "          ├── SKILL.md"
  echo "          ├── reference/ ($REF_COUNT files)"
  echo "          ├── scripts/ ($SCRIPT_COUNT files)"
  echo "          └── templates/"
  echo ""
  echo "Next steps:"
  echo "  1. cd $TARGET"
  echo "  2. Ensure gateway is running: curl -s http://localhost:9090/health"
  echo "  3. Start Claude Code: claude"
  echo "  4. Tell it: \"I want to finetune a model on my documents\""
else
  echo "❌ Sync completed with errors — check above"
  exit 1
fi
