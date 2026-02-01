#!/usr/bin/env bash
#
# mark2 Installation Script
#
# This script installs mark2 from the current directory.
# For npm global install, use: npm install -g mark2
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│         Installing Mark2               │"
echo "└─────────────────────────────────────────┘"
echo ""

# Check for required dependencies
check_dependency() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗ $1 is not installed${NC}"
    echo "  Please install $1 first."
    return 1
  fi
  echo -e "${GREEN}✓${NC} $1 found"
  return 0
}

echo "Checking dependencies..."
echo ""

missing=0
check_dependency "node" || missing=1
check_dependency "npm" || missing=1
check_dependency "tmux" || missing=1

if [ $missing -eq 1 ]; then
  echo ""
  echo -e "${RED}Missing required dependencies. Please install them and try again.${NC}"
  echo ""
  echo "Required dependencies:"
  echo "  - Node.js 18+ (https://nodejs.org/)"
  echo "  - npm or pnpm"
  echo "  - tmux (brew install tmux / apt install tmux)"
  exit 1
fi

# Check Node.js version
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
  echo ""
  echo -e "${YELLOW}Warning: Node.js 18+ is recommended. You have Node.js v$(node -v)${NC}"
fi

echo ""
echo "Installing dependencies..."

# Prefer pnpm if available
if command -v pnpm &> /dev/null; then
  pnpm install
else
  npm install
fi

echo ""
echo "Building mark2..."

if command -v pnpm &> /dev/null; then
  pnpm build
else
  npm run build
fi

echo ""
echo "Creating symlink..."

# Create a symlink to the CLI
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARK2_BIN="$INSTALL_DIR/cli/index.ts"

# Check if /usr/local/bin exists and is writable
if [ -w "/usr/local/bin" ]; then
  cat > /usr/local/bin/mark2 << EOF
#!/usr/bin/env bash
exec npx tsx "$MARK2_BIN" "\$@"
EOF
  chmod +x /usr/local/bin/mark2
  echo -e "${GREEN}✓${NC} mark2 command installed to /usr/local/bin/mark2"
else
  echo -e "${YELLOW}!${NC} Cannot write to /usr/local/bin. You can add this to your PATH:"
  echo ""
  echo "    export PATH=\"\$PATH:$INSTALL_DIR/bin\""
  echo ""
  echo "  Or run with: npx tsx $MARK2_BIN"
fi

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│         ✓ Installation Complete!        │"
echo "└─────────────────────────────────────────┘"
echo ""
echo "Next steps:"
echo "  1. Navigate to your project directory"
echo "  2. Run: mark2 init"
echo "  3. Run: mark2 start"
echo ""
echo "For help: mark2 --help"
echo ""
