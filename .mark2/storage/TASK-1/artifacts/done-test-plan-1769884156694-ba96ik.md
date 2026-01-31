# Manual Test Plan: Tmux Session Picker

## Overview
This test plan covers manual testing of the `npm run mark2 tmuxes` command, which provides an interactive TUI for selecting and attaching to tmux sessions.

## Prerequisites
- Node.js and npm installed
- tmux installed on the system
- The Mark2 project properly set up with dependencies installed (`npm install`)

## Test Environment Setup
No development server is required for this CLI tool. No ports are in use.

## Test Scenarios

### 1. Basic Functionality Tests

#### Test 1.1: Command Execution
**Steps:**
1. Open a terminal
2. Navigate to the Mark2 project directory
3. Run `npm run mark2 tmuxes`

**Expected Result:**
- Command should execute without errors
- If no tmux sessions exist, should display "No tmux sessions found."
- If tmux sessions exist, should display an interactive selection menu

#### Test 1.2: Tmux Not Installed
**Steps:**
1. Test on a system without tmux installed (or temporarily rename tmux binary)
2. Run `npm run mark2 tmuxes`

**Expected Result:**
- Should display error: "Error: tmux is not installed or not available in PATH."
- Should exit with code 1

### 2. Session Display Tests

#### Test 2.1: Multiple Sessions
**Preparation:**
1. Create multiple tmux sessions:
   ```bash
   tmux new-session -d -s test-session-1
   tmux new-session -d -s test-session-2
   tmux new-session -d -s very-long-session-name-that-should-be-truncated-properly
   ```

**Steps:**
1. Run `npm run mark2 tmuxes`

**Expected Result:**
- All sessions should be listed
- Each session should show:
  - Session name (truncated if > 38 chars)
  - Number of windows (e.g., "[1 window]" or "[3 windows]")
  - Attached status (shows "(attached)" if attached)
  - Session size (e.g., "80x24")
  - Creation time (e.g., "5m ago", "2h ago", "1d ago")

#### Test 2.2: Session with Multiple Windows
**Preparation:**
1. Create a session with multiple windows:
   ```bash
   tmux new-session -d -s multi-window
   tmux new-window -t multi-window
   tmux new-window -t multi-window
   ```

**Steps:**
1. Run `npm run mark2 tmuxes`

**Expected Result:**
- The multi-window session should show "[3 windows]" in the list

#### Test 2.3: Attached Session
**Preparation:**
1. In one terminal, attach to a session: `tmux attach -t test-session-1`
2. In another terminal, run the command

**Steps:**
1. Run `npm run mark2 tmuxes`

**Expected Result:**
- The attached session should show "(attached)" indicator

### 3. Interactive Selection Tests

#### Test 3.1: Arrow Key Navigation
**Steps:**
1. Run `npm run mark2 tmuxes` with multiple sessions
2. Use up/down arrow keys to navigate

**Expected Result:**
- Selection highlight should move up/down
- Navigation should wrap at top/bottom

#### Test 3.2: Session Selection
**Steps:**
1. Run `npm run mark2 tmuxes`
2. Navigate to a detached session
3. Press Enter

**Expected Result:**
- Should display "Attaching to tmux session: [session-name]"
- Terminal should attach to the selected tmux session
- User should be inside the tmux session

#### Test 3.3: Cancel Selection
**Steps:**
1. Run `npm run mark2 tmuxes`
2. Press Ctrl+C or ESC

**Expected Result:**
- Should display "Operation cancelled."
- Should return to normal terminal prompt

### 4. Edge Case Tests

#### Test 4.1: No Sessions
**Preparation:**
1. Kill all tmux sessions: `tmux kill-server`

**Steps:**
1. Run `npm run mark2 tmuxes`

**Expected Result:**
- Should display "No tmux sessions found."
- Should exit gracefully

#### Test 4.2: Session Names with Special Characters
**Preparation:**
1. Create sessions with special names:
   ```bash
   tmux new-session -d -s "session with spaces"
   tmux new-session -d -s "session|with|pipes"
   tmux new-session -d -s "session'with'quotes"
   ```

**Steps:**
1. Run `npm run mark2 tmuxes`
2. Select each special-named session

**Expected Result:**
- Sessions should display correctly
- Selection and attachment should work properly

#### Test 4.3: Very Long Session List
**Preparation:**
1. Create 20+ tmux sessions

**Steps:**
1. Run `npm run mark2 tmuxes`

**Expected Result:**
- List should be scrollable
- Performance should remain responsive

### 5. Time Display Tests

#### Test 5.1: Recent Sessions
**Steps:**
1. Create a new session: `tmux new-session -d -s just-created`
2. Immediately run `npm run mark2 tmuxes`

**Expected Result:**
- New session should show "just now" for creation time

#### Test 5.2: Old Sessions
**Preparation:**
1. Have sessions that are hours or days old

**Steps:**
1. Run `npm run mark2 tmuxes`

**Expected Result:**
- Correct time format: "5m ago", "2h ago", "3d ago"

### 6. Error Handling Tests

#### Test 6.1: Attach to Non-existent Session
**Note:** This shouldn't happen in normal usage but tests robustness

**Steps:**
1. If possible, manipulate the selection to try attaching to a non-existent session

**Expected Result:**
- Should show error message with exit code
- Should not crash

## Test Checklist

- [ ] Command executes successfully
- [ ] Handles no tmux installation gracefully
- [ ] Displays all tmux sessions correctly
- [ ] Shows proper session information (windows, attached, size, time)
- [ ] Arrow key navigation works
- [ ] Enter key attaches to session
- [ ] Ctrl+C/ESC cancels operation
- [ ] Handles no sessions gracefully
- [ ] Works with special characters in session names
- [ ] Time display is accurate
- [ ] Error messages are clear and helpful
- [ ] No memory leaks or performance issues with many sessions

## Notes
- The command uses the `@inquirer/prompts` library for the interactive selection
- Session attachment uses `tmux attach-session -t` command
- The tool properly escapes session names to prevent command injection