# Manual Test Plan for Interactive Tmux Session Picker

## Feature Overview
The `npm run mark2 tmuxes` command provides an interactive TUI (Terminal User Interface) for viewing and selecting tmux sessions. Users can navigate through available sessions using arrow keys and attach to their chosen session.

## Prerequisites
- Node.js and npm installed
- tmux installed on the system
- Terminal with arrow key support
- Project dependencies installed (`npm install` in the mark2 directory)

## Test Scenarios

### 1. Basic Functionality Test
**Steps:**
1. Open a terminal and navigate to the `mark2` directory
2. Create a few tmux sessions for testing:
   ```bash
   tmux new-session -d -s test-session-1
   tmux new-session -d -s test-session-2
   tmux new-session -d -s long-session-name-that-should-be-truncated-in-display
   ```
3. Run the command: `npm run mark2 tmuxes`

**Expected Results:**
- ✅ Command should execute without errors
- ✅ Interactive list should appear showing all tmux sessions
- ✅ Each session should display: name, window count, attached status, size, and creation time
- ✅ Long session names should be truncated with "..." after 35 characters

### 2. Navigation Test
**Steps:**
1. With the interactive list open from Test 1
2. Press the down arrow key multiple times
3. Press the up arrow key multiple times
4. Press Home key to go to the first item
5. Press End key to go to the last item

**Expected Results:**
- ✅ Selection highlight should move down with down arrow
- ✅ Selection highlight should move up with up arrow
- ✅ Home key should select the first session
- ✅ End key should select the last session
- ✅ Selection should wrap around at the boundaries

### 3. Session Attachment Test
**Steps:**
1. Run `npm run mark2 tmuxes`
2. Navigate to a session using arrow keys
3. Press Enter to select

**Expected Results:**
- ✅ Should print "Attaching to tmux session: [session-name]"
- ✅ Terminal should attach to the selected tmux session
- ✅ User should be inside the tmux session
- ✅ Pressing Ctrl+B, D should detach and return to the original terminal

### 4. Attached Session Display Test
**Steps:**
1. Attach to a tmux session: `tmux attach -t test-session-1`
2. Open a new terminal window/tab
3. Run `npm run mark2 tmuxes` in the new terminal

**Expected Results:**
- ✅ The attached session should show "(attached)" indicator
- ✅ All sessions should still be selectable, including attached ones

### 5. No Sessions Test
**Steps:**
1. Kill all tmux sessions: `tmux kill-server`
2. Run `npm run mark2 tmuxes`

**Expected Results:**
- ✅ Should display: "No tmux sessions found."
- ✅ Command should exit gracefully with no errors

### 6. Tmux Not Installed Test
**Steps:**
1. Temporarily rename tmux binary (if possible) or test on a system without tmux
2. Run `npm run mark2 tmuxes`

**Expected Results:**
- ✅ Should display: "Error: tmux is not installed or not available in PATH."
- ✅ Command should exit with error code 1

### 7. Cancel Operation Test
**Steps:**
1. Run `npm run mark2 tmuxes` with existing sessions
2. When the interactive list appears, press Ctrl+C or Esc

**Expected Results:**
- ✅ Should display: "Operation cancelled."
- ✅ Command should exit gracefully
- ✅ No tmux session should be attached

### 8. Multiple Windows Test
**Steps:**
1. Create a session with multiple windows:
   ```bash
   tmux new-session -d -s multi-window
   tmux new-window -t multi-window
   tmux new-window -t multi-window
   ```
2. Run `npm run mark2 tmuxes`

**Expected Results:**
- ✅ Session should show "[3 windows]" in the display
- ✅ Singular "window" should be used for sessions with 1 window
- ✅ Plural "windows" should be used for sessions with 2+ windows

### 9. Time Display Test
**Steps:**
1. Create sessions at different times:
   ```bash
   tmux new-session -d -s very-old  # Create and wait if possible
   tmux new-session -d -s hour-old   # Create an hour ago if possible
   tmux new-session -d -s recent     # Create just now
   ```
2. Run `npm run mark2 tmuxes`

**Expected Results:**
- ✅ Recently created sessions should show "just now" or "Xm ago"
- ✅ Hour-old sessions should show "Xh ago"
- ✅ Day-old sessions should show "Xd ago"
- ✅ Time format should be human-readable and consistent

### 10. Session Name Special Characters Test
**Steps:**
1. Create sessions with special characters:
   ```bash
   tmux new-session -d -s "session-with-spaces"
   tmux new-session -d -s "session@special#chars"
   tmux new-session -d -s "session_underscore"
   ```
2. Run `npm run mark2 tmuxes`

**Expected Results:**
- ✅ All sessions should display correctly
- ✅ Special characters should be preserved in the display
- ✅ Attachment should work correctly for sessions with special names

## Performance Considerations
- Command should respond quickly even with many sessions (test with 20+ sessions)
- Navigation should be smooth and responsive
- No noticeable lag when moving between items

## Edge Cases to Verify
1. Very long session names (100+ characters)
2. Sessions with identical names (if tmux allows)
3. Running the command from within a tmux session
4. Running on different terminal emulators (iTerm2, Terminal.app, WSL, etc.)

## Success Criteria
- All test scenarios pass without errors
- User experience is smooth and intuitive
- Error messages are clear and helpful
- Command handles edge cases gracefully
- No crashes or unexpected behavior

## Notes for Testers
- If any test fails, note the exact error message and terminal output
- Test on multiple operating systems if possible (macOS, Linux, WSL)
- Verify that the command follows the expected format: `npm run mark2 tmuxes`
- Check that the help text includes the new command when running `npm run mark2`