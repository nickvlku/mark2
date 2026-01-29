# Design Document: npm mark2 start/stop Commands

## Overview

This design document outlines the implementation of two npm commands for the Mark2 project:
- `npm mark2 start` - Start the Mark2 server
- `npm mark2 stop` - Stop the Mark2 server

## Current State Analysis

### Existing Infrastructure

1. **Server Architecture**
   - Main server file: `server.ts`
   - Combines Next.js app server with WebSocket server
   - Runs on port 3100 by default (configurable via PORT env)
   - Handles HTTP requests and WebSocket upgrades on same port

2. **CLI Structure**
   - CLI entry point: `cli/index.ts`
   - Command pattern: `mark2 <command> [args]`
   - Existing `start` command in `cli/commands/start.ts`
   - No existing `stop` command

3. **npm Scripts**
   - Current `mark2` script: `"mark2": "tsx cli/index.ts"`
   - Server dev script: `"dev": "tsx server.ts"`

## Design Decisions

### 1. npm Script Integration

**Approach**: Use npm run scripts with arguments pass-through

**Implementation**:
```json
{
  "scripts": {
    "mark2": "tsx cli/index.ts"
  }
}
```

This allows users to run:
- `npm run mark2 -- start`
- `npm run mark2 -- stop`

The double dash (`--`) is required by npm to pass arguments to the underlying script.

**Alternative Considered**: Creating separate scripts like `mark2:start` and `mark2:stop`, but this would:
- Duplicate the CLI entry point logic
- Make it harder to maintain consistency
- Not follow the existing pattern

### 2. Process Management Strategy

**Challenge**: The current `start` command runs the server as a foreground process using `exec`, which blocks the terminal and makes it difficult to stop gracefully.

**Solution**: Implement proper process management with:

1. **Process ID (PID) Tracking**
   - Store server PID in `.mark2/server.pid` when starting
   - Use this PID to stop the server gracefully
   - Clean up PID file after stopping

2. **Daemon Mode**
   - Modify start command to run server in background by default
   - Add `--foreground` flag for development/debugging
   - Use Node.js `child_process.spawn` with `detached: true`

3. **Stop Command Implementation**
   - Read PID from `.mark2/server.pid`
   - Send SIGTERM for graceful shutdown
   - Wait for process to exit (with timeout)
   - Fall back to SIGKILL if needed
   - Clean up PID file

### 3. File Structure

```
cli/
├── index.ts          # (modified) Entry point
├── commands/
│   ├── start.ts      # (modified) Start command
│   ├── stop.ts       # (new) Stop command
│   └── ...
```

### 4. Error Handling

1. **Start Command**
   - Check if server is already running (PID file exists and process is alive)
   - Verify `.mark2` directory exists
   - Handle port conflicts
   - Log startup errors clearly

2. **Stop Command**
   - Handle missing PID file (server not started via mark2)
   - Handle stale PID file (process no longer exists)
   - Provide clear feedback on stop status
   - Clean up resources even on error

## Implementation Details

### 1. Modified start.ts

```typescript
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

interface StartOptions {
  foreground?: boolean;
  port?: number;
}

export async function startCommand(
  projectDir: string = process.cwd(),
  options: StartOptions = {}
): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');
  const pidFile = path.join(mark2Dir, 'server.pid');

  // Check if server is already running
  try {
    const pid = await fs.readFile(pidFile, 'utf-8');
    if (isProcessRunning(parseInt(pid))) {
      console.error('Mark2 server is already running (PID: ' + pid + ')');
      process.exit(1);
    }
    // Clean up stale PID file
    await fs.unlink(pidFile);
  } catch {
    // PID file doesn't exist, proceed
  }

  // Set environment variables
  const env = {
    ...process.env,
    MARK2_DIR: mark2Dir,
    MARK2_PROJECT_DIR: projectDir,
    PORT: options.port?.toString() || process.env.PORT || '3100'
  };

  if (options.foreground) {
    // Run in foreground (current behavior)
    // ... existing code ...
  } else {
    // Run in background
    const serverPath = path.join(__dirname, '..', '..', 'server.ts');
    const child = spawn('npx', ['tsx', serverPath], {
      cwd: path.join(__dirname, '..', '..'),
      env,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore']
    });

    // Save PID
    await fs.writeFile(pidFile, child.pid!.toString());

    // Detach from parent
    child.unref();

    console.log(`Mark2 server started in background (PID: ${child.pid})`);
    console.log(`Server running at http://localhost:${env.PORT}`);
  }
}
```

### 2. New stop.ts

```typescript
import path from 'path';
import fs from 'fs/promises';

export async function stopCommand(
  projectDir: string = process.cwd()
): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');
  const pidFile = path.join(mark2Dir, 'server.pid');

  try {
    const pid = parseInt(await fs.readFile(pidFile, 'utf-8'));

    if (!isProcessRunning(pid)) {
      console.log('Mark2 server is not running (stale PID file)');
      await fs.unlink(pidFile);
      return;
    }

    // Send SIGTERM for graceful shutdown
    process.kill(pid, 'SIGTERM');

    // Wait for process to exit (max 10 seconds)
    const maxWait = 10000;
    const checkInterval = 100;
    let waited = 0;

    while (waited < maxWait && isProcessRunning(pid)) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (isProcessRunning(pid)) {
      console.warn('Server did not stop gracefully, forcing shutdown...');
      process.kill(pid, 'SIGKILL');
    }

    // Clean up PID file
    await fs.unlink(pidFile);
    console.log('Mark2 server stopped');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('Mark2 server is not running (no PID file found)');
    } else {
      console.error('Error stopping server:', error);
    }
    process.exit(1);
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

### 3. Updated CLI index.ts

Add the stop command case:

```typescript
case 'stop': {
  const { stopCommand } = await import('./commands/stop');
  await stopCommand(projectDir);
  break;
}
```

Update help text to include:
```
  stop                      Stop the Mark2 server
```

### 4. Server Graceful Shutdown

Modify `server.ts` to handle shutdown signals:

```typescript
// Add near the end of server.ts
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');

  // Close WebSocket server
  wss?.close();

  // Close HTTP server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
});
```

## User Experience

### Starting the Server

```bash
# Start in background (default)
npm run mark2 -- start

# Start in foreground (for development)
npm run mark2 -- start --foreground

# Start with custom port
npm run mark2 -- start --port 4000
```

Output:
```
Mark2 server started in background (PID: 12345)
Server running at http://localhost:3100
```

### Stopping the Server

```bash
npm run mark2 -- stop
```

Output:
```
Mark2 server stopped
```

### Error Cases

1. **Already Running**:
   ```
   Mark2 server is already running (PID: 12345)
   ```

2. **Not Running**:
   ```
   Mark2 server is not running (no PID file found)
   ```

3. **Stale PID**:
   ```
   Mark2 server is not running (stale PID file)
   ```

## Testing Strategy

1. **Unit Tests**
   - Test PID file operations
   - Test process checking logic
   - Test command argument parsing

2. **Integration Tests**
   - Start server and verify it's running
   - Stop server and verify it's stopped
   - Test error cases (double start, stop without start)
   - Test graceful shutdown

3. **Manual Testing**
   - Verify npm scripts work correctly
   - Test on different operating systems
   - Test with concurrent operations

## Security Considerations

1. **PID File Security**
   - Store in `.mark2` directory (project-specific)
   - Don't expose PID in logs unnecessarily
   - Validate PID before using

2. **Process Permissions**
   - Only allow stopping processes started by mark2
   - Don't require elevated permissions

## Future Enhancements

1. **Status Command Enhancement**
   - Show server status alongside agent sessions
   - Display server uptime and resource usage

2. **Restart Command**
   - Add `mark2 restart-server` for convenience
   - Preserve environment variables

3. **Multiple Instances**
   - Support running multiple mark2 servers (different projects)
   - Use project-specific PID files

## Risks and Mitigation

1. **Risk**: Orphaned processes if PID tracking fails
   - **Mitigation**: Implement process group management
   - **Mitigation**: Add cleanup command to find and kill orphaned processes

2. **Risk**: Port conflicts with existing services
   - **Mitigation**: Better error messages for EADDRINUSE
   - **Mitigation**: Automatic port selection option

3. **Risk**: Cross-platform compatibility issues
   - **Mitigation**: Test on Windows, macOS, and Linux
   - **Mitigation**: Use cross-platform process management libraries if needed

## Alternatives Considered

1. **PM2 Integration**: Use PM2 for process management
   - Pros: Robust process management, logs, monitoring
   - Cons: Additional dependency, complexity

2. **Systemd Service**: Create systemd service files
   - Pros: OS-level management, auto-restart
   - Cons: Linux-only, requires sudo

3. **Docker Container**: Run server in Docker
   - Pros: Isolation, easy cleanup
   - Cons: Requires Docker, overhead

**Decision**: Keep it simple with PID-based tracking for now, can evolve later.

## Conclusion

This design provides a clean, user-friendly way to start and stop the Mark2 server using familiar npm commands. The implementation focuses on simplicity while providing robust error handling and graceful shutdown capabilities. The approach aligns with the existing CLI architecture and can be extended in the future as needs evolve.