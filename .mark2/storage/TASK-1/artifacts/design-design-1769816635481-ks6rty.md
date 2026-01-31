# Design Document: Interactive Tmux Session Picker

## Overview

This document outlines the design for a new NPM task `npm run mark2 tmuxes` that displays all tmux sessions and allows interactive selection using arrow keys.

## Requirements

1. Show all tmux sessions (not just mark2 sessions)
2. Allow interactive selection using arrow keys
3. Integrate as an NPM command: `npm run mark2 tmuxes`
4. Provide a TUI (Text User Interface) experience

## Architecture

### Command Structure

The feature will follow the existing mark2 CLI pattern:
- Add a new case in `/mark2/cli/index.ts` for the 'tmuxes' command
- Create a new command file: `/mark2/cli/commands/tmuxes.ts`
- Update package.json to ensure the command routes properly

### Technical Approach

#### 1. TUI Library Selection

Since no TUI library is currently installed, we'll add `@inquirer/prompts` which provides:
- Lightweight, modern ESM-based implementation
- Built-in arrow key navigation
- TypeScript support
- Active maintenance

Alternative considered: `prompts` - but Inquirer has better TypeScript support.

#### 2. Tmux Integration

Extend existing tmux utilities in `/mark2/src/lib/utils/tmux.ts`:
- Add `listAllSessions()`: Get all tmux sessions (not just mark2 ones)
- Add `attachSession(name: string)`: Attach to selected session
- Parse session info to show meaningful details

#### 3. User Flow

1. User runs `npm run mark2 tmuxes`
2. System queries all active tmux sessions
3. Display interactive list with:
   - Session name
   - Creation time (if available)
   - Window count
   - Current window name
4. User navigates with arrow keys
5. User presses Enter to select
6. System attaches to selected tmux session

## Data Models

### TmuxSession Interface

```typescript
interface TmuxSession {
  name: string;
  created: string;      // Creation timestamp
  windows: number;      // Number of windows
  attached: boolean;    // Is session attached elsewhere
  currentWindow: string; // Name of current window
}
```

### Display Format

```
┌─ Select a tmux session ─────────────────────┐
│ ❯ mark2_TASK-1_claude_implement (2 windows) │
│   development (1 window) - attached          │
│   backend-api (3 windows)                    │
│   personal-notes (1 window)                  │
└──────────────────────────────────────────────┘
```

## Implementation Details

### File Changes

1. **mark2/cli/index.ts**
   - Add 'tmuxes' case to switch statement
   - Import tmuxesCommand from commands

2. **mark2/cli/commands/tmuxes.ts** (NEW)
   - Main command implementation
   - Handle session listing
   - Display interactive picker
   - Attach to selected session

3. **mark2/src/lib/utils/tmux.ts**
   - Add `listAllSessions()` function
   - Add `getSessionInfo()` for detailed info
   - Add `attachSession()` function

4. **mark2/package.json**
   - Add `@inquirer/prompts` to dependencies

### Code Structure

```typescript
// tmuxes.ts
export async function tmuxesCommand(): Promise<void> {
  // 1. Get all tmux sessions
  const sessions = await listAllSessions();
  
  // 2. Handle empty state
  if (sessions.length === 0) {
    console.log('No tmux sessions found.');
    return;
  }
  
  // 3. Format sessions for display
  const choices = formatSessionChoices(sessions);
  
  // 4. Show interactive picker
  const selected = await select({
    message: 'Select a tmux session',
    choices: choices
  });
  
  // 5. Attach to selected session
  await attachSession(selected);
}
```

### Tmux Commands

- List all sessions: `tmux list-sessions -F "#{session_name}:#{session_created}:#{session_windows}:#{session_attached}:#{window_name}"`
- Attach to session: `tmux attach-session -t <session_name>`
- Switch to session (if already in tmux): `tmux switch-client -t <session_name>`

## Error Handling

1. **No tmux installed**: Check if tmux is available, show helpful error
2. **No sessions**: Display friendly message
3. **Session disappeared**: Handle race condition if session is killed before attachment
4. **Already in tmux**: Detect if running inside tmux and use switch-client instead of attach-session

## Edge Cases

1. **Nested tmux sessions**: Detect if already in tmux and use appropriate command
2. **Session names with special characters**: Properly escape session names
3. **Large number of sessions**: Consider pagination if > 20 sessions
4. **Permission issues**: Handle cases where user can't attach to certain sessions
5. **Terminal compatibility**: Ensure arrow key navigation works across terminals

## Security Considerations

1. **Command injection**: Properly escape all session names before passing to shell
2. **Session privacy**: Only show sessions the current user has access to
3. **No elevated privileges**: Command runs with user's permissions only

## Testing Strategy

1. **Unit tests**:
   - Test session parsing logic
   - Test format functions
   - Mock tmux commands

2. **Integration tests**:
   - Test with 0, 1, and multiple sessions
   - Test special characters in session names
   - Test attach functionality

3. **Manual testing**:
   - Test on different terminals
   - Test with/without existing tmux sessions
   - Test nested tmux scenarios

## Future Enhancements

1. **Session preview**: Show pane content preview on hover
2. **Session search**: Filter sessions by name
3. **Recent sessions**: Sort by last accessed
4. **Session info**: Show more details (pane count, command running)
5. **Quick actions**: Kill session with hotkey (Ctrl+D)

## Dependencies

- `@inquirer/prompts`: For interactive TUI
- Existing tmux utilities
- Node.js child_process for tmux commands

## Timeline

- Add dependency: 5 minutes
- Implement core functionality: 30 minutes
- Add error handling: 15 minutes
- Testing: 20 minutes
- Documentation: 10 minutes

Total estimated time: ~1.5 hours

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Tmux not installed | Check availability, show install instructions |
| Terminal compatibility | Use well-tested Inquirer library |
| Performance with many sessions | Implement pagination if needed |
| Complex session names | Robust escaping and parsing |

## Conclusion

This design provides a user-friendly way to navigate tmux sessions while integrating smoothly with the existing mark2 CLI architecture. The implementation leverages established patterns and libraries to minimize risk and development time.