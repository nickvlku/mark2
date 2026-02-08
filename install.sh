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

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARK2_BIN="$INSTALL_DIR/cli/index.js"

# --- Helper functions ---

install_wrapper() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  cat > "$target_dir/mark2" << EOF
#!/usr/bin/env bash
exec node "$MARK2_BIN" "\$@"
EOF
  chmod +x "$target_dir/mark2"
}

sudo_install_wrapper() {
  local target_dir="$1"
  local tmpfile
  tmpfile=$(mktemp)
  cat > "$tmpfile" << EOF
#!/usr/bin/env bash
exec node "$MARK2_BIN" "\$@"
EOF
  chmod +x "$tmpfile"
  sudo mkdir -p "$target_dir"
  sudo mv "$tmpfile" "$target_dir/mark2"
}

detect_shell_profile() {
  local shell_name
  shell_name="$(basename "$SHELL")"
  case "$shell_name" in
    zsh)
      echo "$HOME/.zshrc"
      ;;
    bash)
      if [[ "$(uname)" == "Darwin" ]]; then
        if [[ -f "$HOME/.bash_profile" ]]; then
          echo "$HOME/.bash_profile"
        else
          echo "$HOME/.bashrc"
        fi
      else
        echo "$HOME/.bashrc"
      fi
      ;;
    *)
      if [[ "$(uname)" == "Darwin" ]]; then
        echo "$HOME/.zshrc"
      else
        echo "$HOME/.bashrc"
      fi
      ;;
  esac
}

# --- Create project-local wrapper ---

echo ""
echo "Creating local wrapper..."
mkdir -p "$INSTALL_DIR/bin"
install_wrapper "$INSTALL_DIR/bin"
echo -e "${GREEN}✓${NC} Local wrapper created at $INSTALL_DIR/bin/mark2"

# --- Interactive install location prompt ---

echo ""
echo "Where would you like to install the mark2 command?"
echo ""
echo "  1) Global install to /usr/local/bin (may require sudo)"
echo "  2) Local install to ~/.local/bin (current user only)  [default]"
echo "  3) Skip - just use the local wrapper"
echo ""

if [ -t 0 ]; then
  read -r -p "Choice [2]: " choice
  choice="${choice:-2}"
else
  # Non-interactive (CI) - default to local install
  choice="2"
  echo "Non-interactive mode detected, defaulting to option 2 (local install)"
fi

case "$choice" in
  1)
    if [ -w "/usr/local/bin" ]; then
      install_wrapper "/usr/local/bin"
    else
      echo "Requires sudo to write to /usr/local/bin..."
      sudo_install_wrapper "/usr/local/bin"
    fi
    echo -e "${GREEN}✓${NC} mark2 installed to /usr/local/bin/mark2"

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
    ;;
  2)
    LOCAL_BIN="$HOME/.local/bin"
    mkdir -p "$LOCAL_BIN"
    install_wrapper "$LOCAL_BIN"
    echo -e "${GREEN}✓${NC} mark2 installed to $LOCAL_BIN/mark2"

    # Check if ~/.local/bin is in PATH
    if ! echo "$PATH" | tr ':' '\n' | grep -qx "$LOCAL_BIN"; then
      PROFILE="$(detect_shell_profile)"
      echo ""
      echo -e "${YELLOW}!${NC} $LOCAL_BIN is not in your PATH."

      if [ -t 0 ]; then
        read -r -p "  Add to $PROFILE? [Y/n] " add_path
        add_path="${add_path:-Y}"
      else
        add_path="Y"
      fi

      if [[ "$add_path" =~ ^[Yy]$ ]]; then
        # Guard against duplicate entries
        if ! grep -q 'Added by mark2 installer' "$PROFILE" 2>/dev/null; then
          echo '' >> "$PROFILE"
          echo '# Added by mark2 installer' >> "$PROFILE"
          echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$PROFILE"
          echo -e "${GREEN}✓${NC} Added to $PROFILE"
        else
          echo -e "${YELLOW}!${NC} PATH entry already exists in $PROFILE"
        fi
        echo ""
        echo "  Run: source $PROFILE   (or open a new terminal)"
      else
        echo ""
        echo "  To add manually, put this in your shell profile:"
        echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
      fi
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
    ;;
  3)
    echo ""
    echo "┌─────────────────────────────────────────┐"
    echo "│         ✓ Installation Complete!        │"
    echo "└─────────────────────────────────────────┘"
    echo ""
    echo "The local wrapper is available at:"
    echo "  $INSTALL_DIR/bin/mark2"
    echo ""
    echo "You can run mark2 from the project directory with:"
    echo "  ./bin/mark2 --help"
    echo ""
    ;;
  *)
    echo -e "${RED}Invalid choice. Skipping install.${NC}"
    echo "The local wrapper is available at: $INSTALL_DIR/bin/mark2"
    echo ""
    ;;
esac
