# TASK

Task ID: TASK-1
Title: Create an NPM task that lets you see all active tmux sessions and then interactively pick one

## Description
create a NPM task (npm run mark2 tmuxes) that show all tmux sessions and let you pick one using arrow keys (like a little tui)

## Design Document
# Design Document: Interactive Tmux Session Picker

## Overview

This document outlines the design for implementing an NPM task (`npm run mark2 tmuxes`) that displays all tmux sessions and allows users to interactively select one using arrow keys in a Terminal User Interface (TUI).

## Requirements

- **Command**: `npm run mark2 tmuxes`
- **Functionality**: 
  - List all active tmux sessions
  - Provide interactive selection using arrow keys
  - Attach to selected session
- **User Experience**: Terminal-based interactive UI with keyboard navigation

## Architecture

### Component Structure

```
mark2/
├── cli/
│   ├── index.ts                  # Main CLI entry point (modify)
│   └── commands/
│       └── tmuxes.ts            # New command implementation
├── package.json                  # Add TUI dependency
└── src/
    └── lib/
        └── cli/
            └── interactive.ts    # Reusable TUI utilities (new)
```

### Technology Choices

#### TUI Library Selection

After evaluating options, I recommend using **`@inquirer/prompts`** for the following reasons:

1. **Modern API**: Uses async/await and provides a clean, promise-based interface
2. **Lightweight**: Minimal dependencies, focused on interactive prompts
3. **TypeScript Support**: First-class TypeScript support with proper types
4. **Active Maintenance**: Part of the actively maintained Inquirer.js ecosystem
5. **Arrow Key Navigation**: Built-in support for list selection with arrow keys

Alternative considered:
- `blessed`/`blessed-contrib`: Too heavy for this use case
- `terminal-kit`: More complex than needed
- `ink` + React: Overkill for a simple list selection

### Data Flow

1. Execute `tmux list-sessions` command to get all sessions
2. Parse the output to extract session information
3. Present sessions in an interactive list
4. Handle user selection
5. Attach to the selected session

### Implementation Details

#### 1. Command Registration (cli/index.ts)

Add new case in the switch statement:
```typescript
case 'tmuxes': {
  const { tmuxesCommand } = await import('./commands/tmuxes');
  await tmuxesCommand();
  break;
}
```

#### 2. Main Command Implementation (cli/commands/tmuxes.ts)

```typescript
import { execSync, spawn } from 'child_process';
import { select } from '@inquirer/prompts';

interface TmuxSession {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
  size: string;
}

export async function tmuxesCommand(): Promise<void> {
  // Get tmux sessions
  const sessions = getTmuxSessions();
  
  if (sessions.length === 0) {
    console.log('No tmux sessions found.');
    return;
  }

  // Show interactive selection
  const selectedSession = await selectSession(sessions);
  
  if (selectedSession) {
    attachToSession(selectedSession);
  }
}
```

#### 3. Tmux Integration Functions

**Get Sessions**: Parse tmux output with detailed information
```bash
tmux list-sessions -F '#{session_name}|#{session_windows}|#{session_created_string}|#{?session_attached,attached,detached}|#{window_width}x#{window_height}'
```

**Attach to Session**: Use spawn for interactive attachment
```typescript
spawn('tmux', ['attach-session', '-t', sessionName], {
  stdio: 'inherit',
  shell: true
});
```

#### 4. Interactive Selection UI

Display format:
```
? Select a tmux session:
❯ mark2_task_123    [3 windows] (attached) 120x30    Created: 2 hours ago
  development       [2 windows]            80x24     Created: 1 day ago  
  backend-api       [1 window]             100x40    Created: 3 days ago
```

Features:
- Arrow keys for navigation
- Enter to select
- Escape/Ctrl+C to cancel
- Visual indicators for attached sessions
- Session details (windows, size, age)

### Error Handling

1. **No tmux installed**: Check if tmux is available before executing
2. **No tmux server**: Handle gracefully when no sessions exist
3. **Permission issues**: Handle cases where user can't attach to session
4. **Terminal compatibility**: Ensure TUI works across different terminal emulators

### Edge Cases

1. **Session names with special characters**: Properly escape session names
2. **Very long session lists**: Consider pagination for 20+ sessions
3. **Concurrent session changes**: Handle sessions that disappear during selection
4. **SSH/Remote sessions**: Ensure proper terminal handling over SSH

### Security Considerations

1. **Command injection**: Sanitize session names before passing to shell commands
2. **Process isolation**: Use proper escaping for spawn/exec commands

### Testing Strategy

1. **Unit tests**: Mock execSync/spawn calls for tmux commands
2. **Integration tests**: Test with actual tmux sessions (in CI environment)
3. **Manual testing**: Verify interactive behavior across terminals

### Future Enhancements

1. **Session preview**: Show last few lines of session output
2. **Multi-select**: Allow killing multiple sessions at once
3. **Create new session**: Option to create a new session with custom name
4. **Session management**: Rename, kill, or detach from the picker
5. **Filtering**: Search/filter sessions by name
6. **Session groups**: Group related sessions (e.g., all mark2_* sessions)

## Implementation Steps

1. **Add dependency**: Update package.json with `@inquirer/prompts`
2. **Create command file**: Implement `cli/commands/tmuxes.ts`
3. **Update CLI router**: Add case in `cli/index.ts`
4. **Add help text**: Update default case help output
5. **Test implementation**: Create test file if testing infrastructure exists
6. **Documentation**: Update README or docs with new command

## API Contract

### Command Line Interface

```bash
npm run mark2 tmuxes
```

No additional arguments or options in initial implementation.

### Exit Codes

- `0`: Success (session selected and attached)
- `1`: Error (no tmux, no sessions, or user cancelled)

## Dependencies

Add to package.json:
```json
"@inquirer/prompts": "^3.3.0"
```

This is a minimal, well-maintained dependency that provides exactly what we need for interactive selection.