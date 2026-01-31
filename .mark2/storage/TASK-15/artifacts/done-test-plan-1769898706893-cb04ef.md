# Manual Testing Plan: Claude Model Version Updates (4.0 to 4.5)

## Overview
This test plan verifies that all Claude model references have been properly updated from version 4.0 to 4.5 throughout the Mark2 application.

## Test Environment
- **Server Port:** 3100 (tsx server)
- **Web UI Port:** 3120 (Next.js)
- **URLs:**
  - Main API: http://localhost:3100
  - Web Interface: http://localhost:3120

## Prerequisites
- Both servers are running (npm run dev & npm run dev:next)
- Access to .mark2/config.yaml and .mark2/agents.yaml files
- Terminal access for CLI testing

## Test Cases

### 1. Configuration File Verification

#### Test 1.1: Project Configuration
**Steps:**
1. Open `.mark2/config.yaml` in your editor
2. Check all `phase_defaults` sections
3. Verify each phase's model setting

**Expected Results:**
- All Claude models should show:
  - `claude-sonnet-4-5` (NOT `claude-sonnet-4-20250514`)
  - `claude-opus-4-5` (NOT `claude-opus-4-20250514`)

#### Test 1.2: Agent Configuration
**Steps:**
1. Open `.mark2/agents.yaml` in your editor
2. Check all agent definitions

**Expected Results:**
- All Claude agent models should use the new 4.5 format
- No timestamped model IDs should be present

### 2. Web UI Testing

#### Test 2.1: Task Creation
**Steps:**
1. Navigate to http://localhost:3120
2. Create a new task
3. View task details

**Expected Results:**
- Default agent assignments should show Claude 4.5 models
- Agent dropdown should list correct model versions

#### Test 2.2: Agent Management
**Steps:**
1. Navigate to the Agents section (if available)
2. View existing agents
3. Try creating a new agent

**Expected Results:**
- All Claude agents should display "Claude Sonnet 4.5" or "Claude Opus 4.5"
- Model selection dropdown should show 4.5 versions

### 3. CLI Testing

#### Test 3.1: New Project Initialization
**Steps:**
1. Create a temporary directory: `mkdir /tmp/mark2-test && cd /tmp/mark2-test`
2. Run: `mark2 init`
3. Check generated `.mark2/agents.yaml` and `.mark2/config.yaml`

**Expected Results:**
- All generated Claude model references should be 4.5 versions
- No old timestamped model IDs

#### Test 3.2: Agent Commands
**Steps:**
1. In the project directory, run: `mark2 agents list`
2. View the output

**Expected Results:**
- All Claude agents should show the new model IDs
- Output should be properly formatted

### 4. API Testing

#### Test 4.1: Agents API Endpoint
**Steps:**
1. Run: `curl http://localhost:3100/api/agents`
2. Examine the JSON response

**Expected Results:**
- All agent definitions should have `model: "claude-sonnet-4-5"` or `model: "claude-opus-4-5"`
- No old model IDs in response

#### Test 4.2: Config API Endpoint
**Steps:**
1. Run: `curl http://localhost:3100/api/config`
2. Examine the JSON response

**Expected Results:**
- Phase defaults should show updated Claude 4.5 models
- Configuration should be valid and properly formatted

### 5. Backward Compatibility Testing

#### Test 5.1: Model Migration Verification
**Steps:**
1. If you have an existing task database with old model IDs, check if tasks still function
2. Try running a task through phases

**Expected Results:**
- Old model IDs should be automatically migrated to new ones
- Tasks should execute without errors

### 6. Regression Testing

#### Test 6.1: Non-Claude Models
**Steps:**
1. Check configuration files for other CLI tools (codex-cli, gemini-cli, opencode)
2. Verify their model definitions remain unchanged

**Expected Results:**
- Only Claude models should be updated
- Other CLI tool models should remain as they were

## Verification Checklist

- [ ] All configuration files use Claude 4.5 model IDs
- [ ] No timestamped model IDs remain (e.g., `claude-*-20250514`)
- [ ] Web UI displays correct model versions
- [ ] CLI generates correct configurations for new projects
- [ ] API endpoints return updated model IDs
- [ ] Automated tests pass (`npm test`)
- [ ] No regression in non-Claude model configurations

## Known Issues to Watch For

1. **Cache Issues**: Browser or server cache might show old values - clear if needed
2. **Migration**: Existing tasks might need model migration handling
3. **UI Display**: Ensure UI shows friendly names ("Claude Sonnet 4.5") not just IDs

## Post-Test Cleanup

1. Stop development servers: `pkill -f "npm run dev"`
2. Remove test directories if created
3. Document any issues found

## Sign-off

- [ ] All test cases pass
- [ ] No critical issues found
- [ ] Changes ready for production deployment

---

**Test Duration:** Approximately 15-20 minutes
**Last Updated:** $(date)