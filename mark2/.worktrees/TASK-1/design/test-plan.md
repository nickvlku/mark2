# Manual Test Plan: End Token Fix Test

## Overview
This test plan validates the end token detection mechanism in the Mark2 orchestration system. End tokens are critical for phase transitions in the agentic workflow, allowing agents to signal completion of their assigned tasks.

## Prerequisites

### Development Environment Setup
1. Ensure Node.js (v20+) and npm are installed
2. Install dependencies: `npm install`
3. Start the development servers:
   - **Mark2 Server**: `npm run dev` (Port: 3100)
   - **Frontend** (optional): `npm run dev:next` (Port: 3000)

### Required Ports
- **3100**: Mark2 orchestration server with WebSocket support
- **3000**: Next.js frontend (if testing UI components)

## Test Scenarios

### Test 1: Basic End Token Detection
**Objective**: Verify that the EndTokenWatcher correctly detects valid end tokens in TMUX sessions.

**Steps**:
1. Create a new task in manual_testing phase
2. Start the Mark2 server (`npm run dev`)
3. Monitor the orchestration logs
4. In a TMUX session, echo the manual testing end token: `echo "[MANUAL_TESTING_READY]"`
5. Verify the end token is detected and the task transitions to the next phase

**Expected Results**:
- End token watcher should detect `[MANUAL_TESTING_READY]`
- Task phase should transition appropriately
- Activity log should record the end token detection event

### Test 2: End Token Baseline Content Filtering
**Objective**: Ensure the watcher ignores end tokens that appear in initial prompt content.

**Steps**:
1. Start a task that includes end token text in its initial prompt
2. Wait for the baseline content to stabilize (15 seconds max)
3. Add actual end token content after the baseline period
4. Verify only the new end token is detected

**Expected Results**:
- Initial prompt content containing end token strings should be ignored
- Only newly added end tokens should trigger phase transitions
- No false positives from prompt content

### Test 3: Multiple End Token Support
**Objective**: Test phases that support multiple valid end tokens (e.g., testing phase).

**Steps**:
1. Create a task in the testing phase
2. Test both valid end tokens:
   - `echo "[TESTING_PASSED]"`
   - `echo "[TESTING_FAILED]"`
3. Verify both tokens are properly detected

**Expected Results**:
- Both `[TESTING_PASSED]` and `[TESTING_FAILED]` should be detected
- Appropriate phase transitions should occur for each token type

### Test 4: Session Death Handling
**Objective**: Verify proper handling when TMUX sessions die unexpectedly.

**Steps**:
1. Start a task with active end token watching
2. Manually kill the TMUX session: `tmux kill-session -t <session_name>`
3. Observe the watcher behavior

**Expected Results**:
- EndTokenWatcher should detect session death
- Watcher should clean up and stop monitoring
- System should handle the crash gracefully without calling token callbacks

### Test 5: Performance Under Load
**Objective**: Test end token detection with multiple concurrent watchers.

**Steps**:
1. Start multiple tasks across different phases simultaneously
2. Monitor system resource usage
3. Emit end tokens for various tasks
4. Verify all tokens are detected correctly

**Expected Results**:
- All active watchers should function independently
- No performance degradation with multiple concurrent watchers
- All end tokens should be detected within the 2-second polling interval

### Test 6: Edge Case Scenarios

#### Test 6a: Rapid End Token Emission
**Steps**:
1. Start a task with end token watching
2. Rapidly emit multiple end tokens in quick succession
3. Verify only the first valid token triggers transition

#### Test 6b: Partial Token Matches
**Steps**:
1. Emit incomplete or modified end tokens (e.g., `[MANUAL_TESTING_READ` or `MANUAL_TESTING_READY]`)
2. Verify these are not detected as valid tokens

#### Test 6c: Case Sensitivity
**Steps**:
1. Emit end tokens with different cases (e.g., `[manual_testing_ready]`)
2. Verify case-sensitive matching behavior

### Test 7: Integration with Orchestration Engine
**Objective**: Test end-to-end integration with the orchestration engine.

**Steps**:
1. Create a complete task workflow through all phases
2. Use actual agents (claude-code, etc.) if available
3. Monitor end token detection throughout the entire lifecycle
4. Verify proper phase transitions and task completion

**Expected Results**:
- End tokens from each phase should be detected correctly
- Phase transitions should occur smoothly
- Final task completion should be recorded properly

## Performance Criteria

### Response Times
- End token detection should occur within 2 seconds (POLL_INTERVAL_MS)
- Baseline content stabilization should complete within 15 seconds
- No memory leaks during extended testing sessions

### Reliability
- 100% detection rate for valid end tokens
- 0% false positive rate from baseline content
- Graceful handling of all error conditions

## Test Environment Configuration

### TMUX Requirements
- TMUX must be installed and accessible
- Sessions should be created with sufficient scroll buffer
- Pane capture functionality must work correctly

### Database State
- Clean database state for each test run
- Proper task and activity logging
- WebSocket connections for real-time updates

## Debugging and Monitoring

### Key Log Messages to Monitor
- "End token detected: [TOKEN]" in orchestration logs
- Phase transition events in activity logs
- TMUX session lifecycle events

### Diagnostic Commands
```bash
# Check active TMUX sessions
tmux list-sessions

# Monitor Mark2 server logs
tail -f <server_log_file>

# Check database state
npm run mark2 status

# View task activities
# (Access via web interface or database queries)
```

## Success Criteria
- ✅ All test scenarios pass without errors
- ✅ No false positive or negative detections
- ✅ Proper resource cleanup after session termination
- ✅ Stable performance under concurrent load
- ✅ Complete integration with orchestration workflow

## Known Issues and Workarounds
- If Node.js is not available, install it before running tests
- Ensure proper permissions for TMUX session access
- Database migration may be needed: `npx drizzle-kit migrate`

## Post-Test Cleanup
1. Stop all development servers
2. Clean up any test TMUX sessions: `tmux kill-server`
3. Reset database state if needed: `npm run mark2 reindex`
4. Remove temporary test files and artifacts