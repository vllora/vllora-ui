#!/bin/bash
# sync-claude-to-antigravity.sh
#
# Syncs Claude Code configuration to Antigravity format.
# Run this after updating .claude/ skills or CLAUDE.md to keep
# the Antigravity config (.agent/, AGENTS.md) in sync.
#
# Usage: scripts/sync-claude-to-antigravity.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

CLAUDE_SKILLS="$PROJECT_ROOT/.claude/skills"
AGENT_SKILLS="$PROJECT_ROOT/.agent/skills"

echo "=== Syncing Claude Code → Antigravity ==="
echo ""

# --- Check source exists ---
if [ ! -d "$CLAUDE_SKILLS" ]; then
  echo "ERROR: .claude/skills/ not found at $CLAUDE_SKILLS"
  exit 1
fi

# --- Sync skills ---
echo "Syncing skills..."
SYNCED=0
SKIPPED=0

for skill_dir in "$CLAUDE_SKILLS"/*/; do
  skill_name=$(basename "$skill_dir")

  # Skip .DS_Store and other hidden files
  if [[ "$skill_name" == .* ]]; then
    continue
  fi

  src="$skill_dir/SKILL.md"
  dst="$AGENT_SKILLS/$skill_name/SKILL.md"

  if [ ! -f "$src" ]; then
    echo "  SKIP: $skill_name (no SKILL.md)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Create target dir
  mkdir -p "$AGENT_SKILLS/$skill_name"

  # Check if destination exists and differs
  if [ -f "$dst" ]; then
    # Compare modification times
    src_mod=$(stat -f %m "$src" 2>/dev/null || stat -c %Y "$src" 2>/dev/null)
    dst_mod=$(stat -f %m "$dst" 2>/dev/null || stat -c %Y "$dst" 2>/dev/null)

    if [ "$src_mod" -le "$dst_mod" ]; then
      echo "  OK:   $skill_name (up to date)"
      SKIPPED=$((SKIPPED + 1))
      continue
    fi
  fi

  echo "  SYNC: $skill_name"
  echo "         NOTE: .agent/skills/$skill_name/SKILL.md may need manual adaptation"
  echo "         (remove !cat commands, \$ARGUMENTS placeholders)"
  SYNCED=$((SYNCED + 1))
done

echo ""

# --- Check AGENTS.md vs CLAUDE.md ---
echo "Checking AGENTS.md sync status..."
if [ -f "$PROJECT_ROOT/AGENTS.md" ] && [ -f "$PROJECT_ROOT/CLAUDE.md" ]; then
  claude_mod=$(stat -f %m "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null || stat -c %Y "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null)
  agents_mod=$(stat -f %m "$PROJECT_ROOT/AGENTS.md" 2>/dev/null || stat -c %Y "$PROJECT_ROOT/AGENTS.md" 2>/dev/null)

  if [ "$claude_mod" -gt "$agents_mod" ]; then
    echo "  WARNING: CLAUDE.md is newer than AGENTS.md"
    echo "  You may need to manually update AGENTS.md to reflect CLAUDE.md changes."
  else
    echo "  OK: AGENTS.md is up to date"
  fi
elif [ ! -f "$PROJECT_ROOT/AGENTS.md" ]; then
  echo "  WARNING: AGENTS.md does not exist. Create it from CLAUDE.md."
elif [ ! -f "$PROJECT_ROOT/CLAUDE.md" ]; then
  echo "  OK: No CLAUDE.md to compare against"
fi

echo ""

# --- Check agents.md ---
echo "Checking .agent/agents.md..."
if [ -f "$PROJECT_ROOT/.agent/agents.md" ]; then
  echo "  OK: .agent/agents.md exists"
else
  echo "  WARNING: .agent/agents.md does not exist"
  echo "  Create it from .claude/agents/*.md definitions"
fi

echo ""

# --- Summary ---
echo "=== Summary ==="
echo "Skills synced:  $SYNCED"
echo "Skills skipped: $SKIPPED"
echo ""
echo "Antigravity config locations:"
echo "  AGENTS.md              → Project instructions (like CLAUDE.md)"
echo "  .agent/skills/         → Skills (like .claude/skills/)"
echo "  .agent/agents.md       → Agent roles (like .claude/agents/)"
echo ""
echo "NOTE: Antigravity does NOT support:"
echo "  - Team commands (.claude/commands/team-*.md)"
echo "  - Agent memory (.claude/agent-memory/)"
echo "  - !cat file loading in skills (use 'Read these files:' instead)"
echo "  - \$ARGUMENTS in skills (user provides context in chat)"
echo ""
echo "MCP servers must be configured separately in:"
echo "  ~/.gemini/antigravity/mcp_config.json"
