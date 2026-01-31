# Manual Test Plan: Interactive Tmux Session Picker

## Test Overview
This test plan covers the interactive tmux session picker feature accessible via `npm run mark2 tmuxes`. The feature allows users to view all active tmux sessions and interactively select one using arrow keys.

## Prerequisites
- Node.js and npm installed
- tmux installed and available in PATH
- Mark2 project set up with dependencies installed (`npm install`)

## Test Cases

### 1. Basic Functionality Tests

#### 1.1 Command Execution
**Steps:**
1. Open a terminal in the mark2 project directory
2. Run: `npm run mark2 tmuxes`

**Expected Results:**
- Command executes without errors
- If tmux sessions exist, shows interactive selection list
- If no sessions exist, shows "No tmux sessions found."

#### 1.2 No Tmux Installed
**Steps:**
1. Temporarily rename or hide tmux binary (or test on system without tmux)
2. Run: `npm run mark2 tmuxes`

**Expected Results:**
- Shows error: "Error: tmux is not installed or not available in PATH."
- Exits with code 1

### 2. Interactive Selection Tests

#### 2.1 Arrow Navigation
**Steps:**
1. Create multiple tmux sessions:
   ```bash
   tmux new-session -d -s test-session-1
   tmux new-session -d -s test-session-2
   tmux new-session -d -s test-session-3
   ```
2. Run: `npm run mark2 tmuxes`
3. Use arrow keys (↑/↓) to navigate through sessions

**Expected Results:**
- Arrow keys move the selection cursor
- All sessions are reachable via navigation
- Selection highlight follows cursor movement

#### 2.2 Session Selection
**Steps:**
1. With tmux sessions running, run: `npm run mark2 tmuxes`
2. Navigate to a detached session
3. Press Enter to select

**Expected Results:**
- Terminal attaches to the selected tmux session
- User enters the tmux environment
- Can detach normally (Ctrl+B, then D)

#### 2.3 Cancel Operation
**Steps:**
1. Run: `npm run mark2 tmuxes`
2. Press Ctrl+C or Esc

**Expected Results:**
- Shows "Operation cancelled."
- Returns to shell prompt
- No session attachment occurs

### 3. Display Format Tests

#### 3.1 Session Information Display
**Steps:**
1. Create sessions with various states:
   ```bash
   tmux new-session -d -s short-name
   tmux new-session -d -s very-long-session-name-that-should-be-truncated-properly
   tmux new-session -d -s multi-window -n window1
   tmux new-window -t multi-window -n window2
   ```
2. Attach to one session in another terminal
3. Run: `npm run mark2 tmuxes`

**Expected Results:**
- Each session shows:
  - Session name (truncated if > 38 chars with "...")
  - Number of windows with proper singular/plural
  - "(attached)" indicator for attached sessions
  - Terminal size (e.g., "80x24")
  - Creation time (e.g., "just now", "5m ago", "2h ago", "3d ago")
- All columns align properly

#### 3.2 Time Format Testing
**Steps:**
1. Create sessions at different times (or modify system time for testing)
2. Run: `npm run mark2 tmuxes`

**Expected Results:**
- Recent sessions show "just now" (< 1 minute)
- Sessions < 1 hour show minutes (e.g., "15m ago")
- Sessions < 24 hours show hours (e.g., "3h ago")
- Older sessions show days (e.g., "2d ago")

### 4. Edge Cases

#### 4.1 No Sessions
**Steps:**
1. Kill all tmux sessions: `tmux kill-server`
2. Run: `npm run mark2 tmuxes`

**Expected Results:**
- Shows: "No tmux sessions found."
- Exits gracefully

#### 4.2 Single Session
**Steps:**
1. Kill all sessions and create only one: `tmux new-session -d -s single`
2. Run: `npm run mark2 tmuxes`

**Expected Results:**
- Shows single session in selection interface
- Can still navigate and select
- Pressing Enter attaches to the session

#### 4.3 Already Attached Session
**Steps:**
1. In terminal A: Create and attach to a session
2. In terminal B: Run `npm run mark2 tmuxes`
3. Select the attached session and press Enter

**Expected Results:**
- Attaches to the session (creates grouped session)
- Both terminals share the same tmux session
- Changes in one terminal are visible in the other

#### 4.4 Special Characters in Session Names
**Steps:**
1. Create sessions with special names:
   ```bash
   tmux new-session -d -s "session-with-spaces"
   tmux new-session -d -s "session_with_underscores"
   tmux new-session -d -s "session.with.dots"
   ```
2. Run: `npm run mark2 tmuxes`
3. Select each session

**Expected Results:**
- All sessions display correctly
- Selection and attachment work properly
- No shell injection or escaping issues

### 5. Performance Tests

#### 5.1 Many Sessions
**Steps:**
1. Create 20+ tmux sessions
2. Run: `npm run mark2 tmuxes`

**Expected Results:**
- List loads quickly (< 1 second)
- Navigation remains responsive
- All sessions are accessible

### 6. Integration Tests

#### 6.1 npm Script Integration
**Steps:**
1. Run: `npm run mark2 tmuxes`
2. Also test direct CLI: `npx tsx cli/index.ts tmuxes`

**Expected Results:**
- Both methods work identically
- No path or environment issues

#### 6.2 Help Text
**Steps:**
1. Run: `npm run mark2` (without arguments)

**Expected Results:**
- Help text includes tmuxes command description:
  "tmuxes                    Show all tmux sessions and interactively select one"

## Accessibility Considerations
- Test with screen readers if possible
- Verify keyboard-only navigation works properly
- Check contrast and visibility of selection highlight

## Security Considerations
- Verify session names with shell metacharacters don't cause injection
- Test with session names containing quotes, backticks, $, etc.
- Ensure tmux commands use array arguments (not shell strings)

## Regression Tests
After any fixes or changes:
1. Re-run all basic functionality tests
2. Test the specific scenario that was fixed
3. Verify no new issues introduced

## Test Completion Checklist
- [ ] All basic functionality tests pass
- [ ] Interactive selection works properly
- [ ] Display format is correct and aligned
- [ ] Edge cases handled gracefully
- [ ] Performance is acceptable
- [ ] Integration with npm scripts works
- [ ] No security vulnerabilities found
- [ ] Help documentation is accurate

## Notes for Testers
- The feature uses @inquirer/prompts for interactive selection
- Terminal must support ANSI escape codes for proper display
- Some terminal emulators may have different behavior with arrow keys
- Test in different terminal environments if possible (Terminal, iTerm2, WSL, etc.)