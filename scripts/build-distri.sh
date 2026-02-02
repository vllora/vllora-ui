#!/bin/bash
#
# Build distri binaries and install to ~/.vllora/distri
# This script calls the build script in the distri repository.
#
# Usage:
#   ./scripts/build-distri.sh          # Build and install
#   ./scripts/build-distri.sh --clean  # Clean build first
#   pnpm run build:distri              # Via npm script
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_DIR="$(dirname "$SCRIPT_DIR")"
VLLORA_DIR="$(dirname "$UI_DIR")"

# Default distri repo location (sibling to vllora)
DISTRI_REPO="${DISTRI_REPO:-$(dirname "$VLLORA_DIR")/distri}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
CLEAN_BUILD=false
for arg in "$@"; do
    case $arg in
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Build distri binaries and install to ~/.vllora/distri"
            echo ""
            echo "Options:"
            echo "  --clean    Clean build (cargo clean) before building"
            echo "  --help     Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  DISTRI_REPO    Path to distri repository (default: ../distri relative to vllora)"
            echo ""
            echo "Examples:"
            echo "  $0                           # Build and install"
            echo "  $0 --clean                   # Clean build"
            echo "  DISTRI_REPO=/path/to/distri $0  # Custom distri path"
            exit 0
            ;;
    esac
done

# Check if distri repo exists
if [ ! -d "$DISTRI_REPO" ]; then
    log_error "Distri repository not found at: $DISTRI_REPO"
    log_error ""
    log_error "Please either:"
    log_error "  1. Clone distri repo to: $DISTRI_REPO"
    log_error "  2. Set DISTRI_REPO environment variable to the correct path"
    log_error ""
    log_error "Example:"
    log_error "  DISTRI_REPO=/path/to/distri $0"
    exit 1
fi

# Check if build script exists
BUILD_SCRIPT="$DISTRI_REPO/scripts/build-for-vllora.sh"
if [ ! -f "$BUILD_SCRIPT" ]; then
    log_error "Build script not found at: $BUILD_SCRIPT"
    log_error "Please ensure the distri repository has the build-for-vllora.sh script."
    exit 1
fi

log_info "Using distri repository: $DISTRI_REPO"

# Build arguments
BUILD_ARGS=""
if [ "$CLEAN_BUILD" = true ]; then
    BUILD_ARGS="--clean"
fi

# Run the build script
exec "$BUILD_SCRIPT" $BUILD_ARGS
