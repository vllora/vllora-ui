#!/bin/bash
#
# sync-distri.sh
#
# Syncs @distri/core and @distri/react from the local distrijs repository
# to the vendored packages in vllora/ui.
#
# Usage:
#   ./scripts/sync-distri.sh           # Build and sync both packages
#   ./scripts/sync-distri.sh --core    # Only sync @distri/core
#   ./scripts/sync-distri.sh --react   # Only sync @distri/react
#   ./scripts/sync-distri.sh --no-build # Skip build, just copy
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VLLORA_UI_DIR="$(dirname "$SCRIPT_DIR")"
DISTRIJS_DIR="${DISTRIJS_DIR:-$VLLORA_UI_DIR/../../distri/distrijs}"

CORE_SRC="$DISTRIJS_DIR/packages/core"
REACT_SRC="$DISTRIJS_DIR/packages/react"
CORE_DEST="$VLLORA_UI_DIR/vendor/distri-core"
REACT_DEST="$VLLORA_UI_DIR/vendor/distri-react"

# Options
SYNC_CORE=true
SYNC_REACT=true
DO_BUILD=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --core)
      SYNC_REACT=false
      shift
      ;;
    --react)
      SYNC_CORE=false
      shift
      ;;
    --no-build)
      DO_BUILD=false
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --core      Only sync @distri/core"
      echo "  --react     Only sync @distri/react"
      echo "  --no-build  Skip building, just copy existing dist folders"
      echo "  --help      Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  DISTRIJS_DIR  Path to distrijs repo (default: ../distri/distrijs)"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Check if distrijs directory exists
if [ ! -d "$DISTRIJS_DIR" ]; then
  echo -e "${RED}Error: distrijs directory not found at $DISTRIJS_DIR${NC}"
  echo "Set DISTRIJS_DIR environment variable to point to your distrijs repo"
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Syncing Distri Packages${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Source:      ${YELLOW}$DISTRIJS_DIR${NC}"
echo -e "Destination: ${YELLOW}$VLLORA_UI_DIR/vendor${NC}"
echo ""

# Build packages if requested
if [ "$DO_BUILD" = true ]; then
  echo -e "${BLUE}Building packages...${NC}"

  if [ "$SYNC_CORE" = true ]; then
    echo -e "  Building ${GREEN}@distri/core${NC}..."
    (cd "$CORE_SRC" && pnpm build) || {
      echo -e "${RED}Failed to build @distri/core${NC}"
      exit 1
    }
  fi

  if [ "$SYNC_REACT" = true ]; then
    echo -e "  Building ${GREEN}@distri/react${NC}..."
    (cd "$REACT_SRC" && pnpm build) || {
      echo -e "${RED}Failed to build @distri/react${NC}"
      exit 1
    }
  fi

  echo -e "${GREEN}Build complete!${NC}"
  echo ""
fi

# Sync packages
echo -e "${BLUE}Copying dist folders...${NC}"

if [ "$SYNC_CORE" = true ]; then
  if [ ! -d "$CORE_SRC/dist" ]; then
    echo -e "${RED}Error: $CORE_SRC/dist does not exist. Run build first.${NC}"
    exit 1
  fi

  echo -e "  Syncing ${GREEN}@distri/core${NC}..."
  rm -rf "$CORE_DEST/dist"
  cp -r "$CORE_SRC/dist" "$CORE_DEST/"

  # Get version from source package.json
  CORE_VERSION=$(grep '"version"' "$CORE_SRC/package.json" | head -1 | sed 's/.*: "\(.*\)".*/\1/')
  echo -e "    Version: ${YELLOW}$CORE_VERSION${NC}"
fi

if [ "$SYNC_REACT" = true ]; then
  if [ ! -d "$REACT_SRC/dist" ]; then
    echo -e "${RED}Error: $REACT_SRC/dist does not exist. Run build first.${NC}"
    exit 1
  fi

  echo -e "  Syncing ${GREEN}@distri/react${NC}..."
  rm -rf "$REACT_DEST/dist"
  cp -r "$REACT_SRC/dist" "$REACT_DEST/"

  # Get version from source package.json
  REACT_VERSION=$(grep '"version"' "$REACT_SRC/package.json" | head -1 | sed 's/.*: "\(.*\)".*/\1/')
  echo -e "    Version: ${YELLOW}$REACT_VERSION${NC}"
fi

echo ""
echo -e "${GREEN}Sync complete!${NC}"
echo ""

# Reinstall dependencies
echo -e "${BLUE}Reinstalling dependencies...${NC}"
(cd "$VLLORA_UI_DIR" && pnpm install) || {
  echo -e "${RED}Failed to install dependencies${NC}"
  exit 1
}

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All done!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Test your changes: ${YELLOW}pnpm dev${NC}"
echo -e "  2. Check types:       ${YELLOW}pnpm tsc --noEmit${NC}"
echo -e "  3. Commit vendor:     ${YELLOW}git add vendor/ && git commit -m 'chore: update vendored distri packages'${NC}"
