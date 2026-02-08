import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { YamlReader } from '../yaml/reader';
import { TaskService } from '../services/task-service';
import { StoryService } from '../services/story-service';
import { ActivityService } from '../services/activity-service';
import { ArtifactService } from '../services/artifact-service';
import { getTaskStoragePathsFromMark2Dir } from '../utils/storage';
import { getMark2Dir } from '../utils/mark2-dir';

// ---------------------------------------------------------------------------
// MCP Server Factory
// ---------------------------------------------------------------------------

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'mark2',
    version: '0.1.0',
  });

  // ── mark2_report_status ──────────────────────────────────────────────

  server.tool(
    'mark2_report_status',
    'Agent reports current status/progress for a task',
    {
      task_id: z.string().describe('The task ID (e.g. TASK-1)'),
      status: z.string().describe('Current status label'),
      message: z.string().describe('Human-readable progress message'),
    },
    async ({ task_id, status, message }) => {
      const mark2Dir = getMark2Dir();
      const activityService = new ActivityService(mark2Dir);

      activityService.log(task_id, 'agent', 'note', `[${status}] ${message}`);

      return {
        content: [
          { type: 'text' as const, text: `Status reported for ${task_id}: ${status}` },
        ],
      };
    },
  );

  // ── mark2_save_artifact ──────────────────────────────────────────────

  server.tool(
    'mark2_save_artifact',
    'Save and register an artifact for a task. This writes the content to the artifacts directory and registers it.',
    {
      task_id: z.string().describe('The task ID (e.g. TASK-1)'),
      filename: z.string().describe('Filename for the artifact (e.g. design.md, test-results.json)'),
      content: z.string().describe('Content of the artifact'),
    },
    async ({ task_id, filename, content }) => {
      const mark2Dir = getMark2Dir();
      const stateDir = path.join(mark2Dir, '.state');
      const reader = new YamlReader(stateDir);
      const artifactService = new ArtifactService(mark2Dir);

      const { data: task } = reader.readTask(task_id);
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `Error: Task ${task_id} not found` }],
          isError: true,
        };
      }

      // Generate unique filename: {phase}-{filename}-{timestamp}-{random}.{ext}
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const uniqueFilename = `${task.phase}-${base}-${timestamp}-${random}${ext}`;

      // Save to artifacts directory (always in main .mark2/storage/)
      const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, task_id);
      const artifactPath = path.join(storagePaths.artifacts, uniqueFilename);

      // Ensure directory exists
      fs.mkdirSync(storagePaths.artifacts, { recursive: true });
      fs.writeFileSync(artifactPath, content, 'utf-8');

      // Register the artifact
      const artifact = artifactService.report(task_id, {
        name: base,
        phase: task.phase,
        path: uniqueFilename,
        mime_type: ext === '.md' ? 'text/markdown' : ext === '.json' ? 'application/json' : 'text/plain',
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Artifact saved: ${artifact.name} at ${artifactPath}`,
          },
        ],
      };
    },
  );

  // ── mark2_get_paths ─────────────────────────────────────────────────

  server.tool(
    'mark2_get_paths',
    'Get storage paths for a task (artifacts, prompts, sessions)',
    {
      task_id: z.string().describe('The task ID'),
    },
    async ({ task_id }) => {
      const mark2Dir = getMark2Dir();
      const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, task_id);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(storagePaths, null, 2),
          },
        ],
      };
    },
  );

  // ── mark2_report_artifact (legacy) ──────────────────────────────────

  server.tool(
    'mark2_report_artifact',
    'Register an existing artifact for a task (use mark2_save_artifact to save AND register)',
    {
      task_id: z.string().describe('The task ID'),
      name: z.string().describe('Artifact name'),
      path: z.string().describe('File path relative to the worktree'),
      mime_type: z.string().optional().describe('MIME type of the artifact'),
    },
    async ({ task_id, name, path: artifactPath, mime_type }) => {
      const mark2Dir = getMark2Dir();
      const stateDir = path.join(mark2Dir, '.state');
      const reader = new YamlReader(stateDir);
      const artifactService = new ArtifactService(mark2Dir);

      const { data: task } = reader.readTask(task_id);
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `Error: Task ${task_id} not found` }],
          isError: true,
        };
      }

      const artifact = artifactService.report(task_id, {
        name,
        phase: task.phase,
        path: artifactPath,
        mime_type,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Artifact reported: ${artifact.name} at ${artifact.path}`,
          },
        ],
      };
    },
  );

  // ── mark2_get_task ───────────────────────────────────────────────────

  server.tool(
    'mark2_get_task',
    'Agent reads full task details',
    {
      task_id: z.string().describe('The task ID'),
    },
    async ({ task_id }) => {
      const mark2Dir = getMark2Dir();
      const taskService = new TaskService(mark2Dir);

      const task = taskService.getById(task_id);
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `Error: Task ${task_id} not found` }],
          isError: true,
        };
      }

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(task, null, 2) },
        ],
      };
    },
  );

  // ── mark2_list_artifacts ─────────────────────────────────────────────

  server.tool(
    'mark2_list_artifacts',
    'List all artifacts for a task, sorted chronologically (oldest first)',
    {
      task_id: z.string().describe('The task ID'),
    },
    async ({ task_id }) => {
      const mark2Dir = getMark2Dir();
      const artifactService = new ArtifactService(mark2Dir);

      try {
        const artifacts = artifactService.getForTask(task_id);

        // Sort chronologically (oldest first)
        const sorted = [...artifacts].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        if (sorted.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No artifacts found for ${task_id}` }],
          };
        }

        const list = sorted.map((a, i) =>
          `${i + 1}. [${a.phase}] ${a.name} - ${a.path} (${new Date(a.created_at).toISOString()})`
        ).join('\n');

        return {
          content: [{ type: 'text' as const, text: `Artifacts for ${task_id}:\n\n${list}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_get_artifact ──────────────────────────────────────────────

  server.tool(
    'mark2_get_artifact',
    'Get the content of a specific artifact by its path',
    {
      task_id: z.string().describe('The task ID'),
      artifact_path: z.string().describe('The artifact path (from mark2_list_artifacts)'),
    },
    async ({ task_id, artifact_path }) => {
      const mark2Dir = getMark2Dir();
      const storagePath = path.join(mark2Dir, 'storage', task_id, 'artifacts', artifact_path);

      if (!fs.existsSync(storagePath)) {
        return {
          content: [{ type: 'text' as const, text: `Artifact not found: ${artifact_path}` }],
          isError: true,
        };
      }

      const content = fs.readFileSync(storagePath, 'utf-8');
      return {
        content: [{ type: 'text' as const, text: content }],
      };
    },
  );

  // ── mark2_get_latest_artifact ───────────────────────────────────────

  server.tool(
    'mark2_get_latest_artifact',
    'Get the content of the MOST RECENT artifact matching a name pattern. Use this to get the latest review, test results, etc.',
    {
      task_id: z.string().describe('The task ID'),
      name_pattern: z.string().describe('Pattern to match artifact name (e.g. "review", "test", "design")'),
    },
    async ({ task_id, name_pattern }) => {
      const mark2Dir = getMark2Dir();
      const artifactService = new ArtifactService(mark2Dir);

      const { content, artifact } = artifactService.getMostRecentContent(task_id, name_pattern);

      if (!artifact) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No artifact matching "${name_pattern}" found for ${task_id}`,
            },
          ],
          isError: true,
        };
      }

      if (!content) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Artifact found but file missing: ${artifact.path}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `[${artifact.phase}] ${artifact.name} (${artifact.created_at}):\n\n${content}`,
          },
        ],
      };
    },
  );

  // ── mark2_get_design ─────────────────────────────────────────────────

  server.tool(
    'mark2_get_design',
    'Agent reads the design document for a task (shortcut for mark2_get_latest_artifact with "design")',
    {
      task_id: z.string().describe('The task ID'),
    },
    async ({ task_id }) => {
      const mark2Dir = getMark2Dir();
      const artifactService = new ArtifactService(mark2Dir);

      const { content, artifact } = artifactService.getMostRecentContent(task_id, 'design');

      if (!artifact) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No design document found for ${task_id}`,
            },
          ],
          isError: true,
        };
      }

      if (!content) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Design artifact registered but file not found: ${artifact.path}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: content }],
      };
    },
  );

  // ── mark2_log_activity ───────────────────────────────────────────────

  server.tool(
    'mark2_log_activity',
    'Agent logs an activity entry for a task',
    {
      task_id: z.string().describe('The task ID'),
      type: z.enum(['note', 'error', 'artifact']).describe('Activity type'),
      message: z.string().describe('Log message'),
    },
    async ({ task_id, type, message }) => {
      const mark2Dir = getMark2Dir();
      const activityService = new ActivityService(mark2Dir);

      activityService.log(task_id, 'agent', type, message);

      return {
        content: [
          { type: 'text' as const, text: `Activity logged for ${task_id}: [${type}] ${message}` },
        ],
      };
    },
  );

  // ── mark2_signal_complete ────────────────────────────────────────────

  server.tool(
    'mark2_signal_complete',
    'Agent signals phase completion with an end token. This triggers the phase transition.',
    {
      task_id: z.string().describe('The task ID'),
      token: z.string().describe('The end token (e.g. [DESIGN_COMPLETED])'),
    },
    async ({ task_id, token }) => {
      const apiUrl = process.env.MARK2_API_URL || 'http://localhost:3100';

      try {
        // Call the hook-complete endpoint to trigger phase transition
        const response = await fetch(`${apiUrl}/api/tasks/${task_id}/phase/hook-complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            source: 'mcp',
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          return {
            content: [{ type: 'text' as const, text: `Error signaling completion: ${response.status} ${text}` }],
            isError: true,
          };
        }

        const result = await response.json();
        return {
          content: [
            {
              type: 'text' as const,
              text: `Phase completion signaled for ${task_id} with token: ${token}. Status: ${result.status || 'awaiting_approval'}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error signaling completion: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_get_diff ─────────────────────────────────────────────────

  server.tool(
    'mark2_get_diff',
    'Get the git diff for a task (all changes from origin/main to current branch)',
    {
      task_id: z.string().describe('The task ID'),
    },
    async ({ task_id }) => {
      const mark2Dir = getMark2Dir();
      const cloneDir = path.join(mark2Dir, 'clones', task_id);

      try {
        // Get the merge base with origin/main or origin/HEAD
        let mergeBase: string;
        try {
          mergeBase = execSync('git merge-base origin/main HEAD', { cwd: cloneDir, encoding: 'utf-8' }).trim();
        } catch {
          // Fallback to origin/HEAD if origin/main doesn't exist
          mergeBase = execSync('git merge-base origin/HEAD HEAD', { cwd: cloneDir, encoding: 'utf-8' }).trim();
        }

        const diff = execSync(`git diff ${mergeBase}`, { cwd: cloneDir, encoding: 'utf-8' });

        if (!diff.trim()) {
          return {
            content: [{ type: 'text' as const, text: '(No changes - diff is empty)' }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: diff }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error getting diff: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_git_status ────────────────────────────────────────────────

  server.tool(
    'mark2_git_status',
    'Get git status for the task worktree',
    {
      task_id: z.string().describe('The task ID'),
    },
    async ({ task_id }) => {
      const mark2Dir = getMark2Dir();
      const cloneDir = path.join(mark2Dir, 'clones', task_id);

      try {
        const status = execSync('git status --porcelain', { cwd: cloneDir, encoding: 'utf-8' });
        const branch = execSync('git branch --show-current', { cwd: cloneDir, encoding: 'utf-8' }).trim();

        return {
          content: [
            {
              type: 'text' as const,
              text: `Branch: ${branch}\n\nStatus:\n${status || '(no changes)'}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_git_commit ────────────────────────────────────────────────

  server.tool(
    'mark2_git_commit',
    'Stage all changes and commit in the task worktree',
    {
      task_id: z.string().describe('The task ID'),
      message: z.string().describe('Commit message'),
    },
    async ({ task_id, message }) => {
      const mark2Dir = getMark2Dir();
      const cloneDir = path.join(mark2Dir, 'clones', task_id);

      try {
        execSync('git add -A', { cwd: cloneDir, encoding: 'utf-8' });
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: cloneDir, encoding: 'utf-8' });

        const hash = execSync('git rev-parse --short HEAD', { cwd: cloneDir, encoding: 'utf-8' }).trim();

        return {
          content: [
            {
              type: 'text' as const,
              text: `Committed: ${hash} - ${message}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_git_push ──────────────────────────────────────────────────

  server.tool(
    'mark2_git_push',
    'Push the task branch to remote',
    {
      task_id: z.string().describe('The task ID'),
    },
    async ({ task_id }) => {
      const mark2Dir = getMark2Dir();
      const cloneDir = path.join(mark2Dir, 'clones', task_id);

      try {
        const branch = execSync('git branch --show-current', { cwd: cloneDir, encoding: 'utf-8' }).trim();
        execSync(`git push -u origin ${branch}`, { cwd: cloneDir, encoding: 'utf-8' });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Pushed branch ${branch} to origin`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_git_sync ──────────────────────────────────────────────────

  server.tool(
    'mark2_git_sync',
    'Sync the task branch with latest from main (fetch + rebase)',
    {
      task_id: z.string().describe('The task ID'),
    },
    async ({ task_id }) => {
      const mark2Dir = getMark2Dir();
      const cloneDir = path.join(mark2Dir, 'clones', task_id);

      try {
        execSync('git fetch origin main', { cwd: cloneDir, encoding: 'utf-8' });
        execSync('git rebase origin/main', { cwd: cloneDir, encoding: 'utf-8' });

        return {
          content: [
            {
              type: 'text' as const,
              text: 'Synced with origin/main successfully',
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_create_task ─────────────────────────────────────────────────

  server.tool(
    'mark2_create_task',
    'Create a new task in mark2',
    {
      title: z.string().describe('Task title'),
      description: z.string().describe('Task description'),
      priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional().default('P2').describe('Task priority (P0=critical, P3=low)'),
      story_id: z.string().optional().describe('Story ID to attach task to'),
    },
    async ({ title, description, priority, story_id }) => {
      const mark2Dir = getMark2Dir();
      const taskService = new TaskService(mark2Dir);

      try {
        const task = await taskService.create({
          title,
          description,
          priority,
          story_id,
          created_by: 'mcp',
        });

        // If story_id provided, also add task to story's task list
        if (story_id) {
          const storyService = new StoryService(mark2Dir);
          try {
            await storyService.addTask(story_id, task.id);
          } catch (storyError) {
            // Log warning but don't fail the task creation
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Task created: ${task.id} - ${task.title}\nWarning: Could not add to story ${story_id}: ${storyError}`,
                },
              ],
            };
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `Task created: ${task.id} - ${task.title}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error creating task: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_create_story ────────────────────────────────────────────────

  server.tool(
    'mark2_create_story',
    'Create a new story in mark2',
    {
      title: z.string().describe('Story title'),
      description: z.string().describe('Story description'),
    },
    async ({ title, description }) => {
      const mark2Dir = getMark2Dir();
      const storyService = new StoryService(mark2Dir);

      try {
        const story = await storyService.create({
          title,
          description,
          created_by: 'mcp',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Story created: ${story.id} - ${story.title}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error creating story: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_add_to_story ─────────────────────────────────────────────────

  server.tool(
    'mark2_add_to_story',
    'Assign or move a task to a story. Pass null for story_id to unassign the task from any story.',
    {
      task_id: z.string().describe('The task ID (e.g. TASK-1)'),
      story_id: z.string().nullable().describe('The story ID to assign to, or null to unassign'),
    },
    async ({ task_id, story_id }) => {
      const mark2Dir = getMark2Dir();
      const taskService = new TaskService(mark2Dir);
      const storyService = new StoryService(mark2Dir);

      try {
        // Validate task exists
        const task = taskService.getById(task_id);
        if (!task) {
          return {
            content: [{ type: 'text' as const, text: `Error: Task ${task_id} not found` }],
            isError: true,
          };
        }

        // Validate story exists (if not unassigning)
        if (story_id !== null) {
          const story = storyService.getById(story_id);
          if (!story) {
            return {
              content: [{ type: 'text' as const, text: `Error: Story ${story_id} not found` }],
              isError: true,
            };
          }
        }

        // Remove from old story if it had one
        const oldStoryId = task.story_id;
        if (oldStoryId && oldStoryId !== story_id) {
          try {
            await storyService.removeTask(oldStoryId, task_id);
          } catch {
            // Ignore errors removing from old story
          }
        }

        // Update task's story_id (convert null to undefined for Task type)
        await taskService.update(task_id, { story_id: story_id ?? undefined });

        // Add to new story's task list (if assigning)
        if (story_id !== null) {
          try {
            await storyService.addTask(story_id, task_id);
          } catch {
            // Task may already be in story's list, ignore
          }
        }

        const message = story_id
          ? `Task ${task_id} assigned to story ${story_id}`
          : `Task ${task_id} unassigned from story`;

        return {
          content: [{ type: 'text' as const, text: message }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_add_task_blocker ─────────────────────────────────────────────

  server.tool(
    'mark2_add_task_blocker',
    'Add a blocker to a task. The blocker_id task must complete before task_id can proceed. Idempotent - no error if already blocked.',
    {
      task_id: z.string().describe('The task ID that will be blocked'),
      blocker_id: z.string().describe('The task ID that blocks this task'),
    },
    async ({ task_id, blocker_id }) => {
      const mark2Dir = getMark2Dir();
      const taskService = new TaskService(mark2Dir);

      try {
        await taskService.addBlocker(task_id, blocker_id);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Added blocker: ${task_id} is now blocked by ${blocker_id}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error}` }],
          isError: true,
        };
      }
    },
  );

  // ── mark2_save_plan_artifact ──────────────────────────────────────────

  server.tool(
    'mark2_save_plan_artifact',
    'Save an artifact file for a plan (PRD, tech spec, or task proposal)',
    {
      plan_id: z.string().describe('Plan ID (e.g., PLAN-1)'),
      filename: z.string().describe('Filename to save (e.g., prd.md, tech-spec.md, task-proposal.json)'),
      content: z.string().describe('Content of the artifact'),
    },
    async ({ plan_id, filename, content }) => {
      try {
        const mark2Dir = getMark2Dir();
        const { PlanService } = await import('../services/plan-service');
        const planService = new PlanService(mark2Dir);

        const plan = planService.getById(plan_id);
        if (!plan) {
          return { content: [{ type: 'text' as const, text: `Error: Plan ${plan_id} not found` }], isError: true };
        }

        // Sanitize filename to prevent path traversal
        const safeFilename = path.basename(filename);
        if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
          return { content: [{ type: 'text' as const, text: 'Error: Invalid filename' }], isError: true };
        }

        // Save to storage
        const artifactDir = path.join(mark2Dir, 'storage', plan_id, 'artifacts');
        if (!fs.existsSync(artifactDir)) {
          fs.mkdirSync(artifactDir, { recursive: true });
        }
        fs.writeFileSync(path.join(artifactDir, safeFilename), content, 'utf-8');

        // Determine mime type
        let mime_type = 'text/plain';
        if (safeFilename.endsWith('.md')) mime_type = 'text/markdown';
        else if (safeFilename.endsWith('.json')) mime_type = 'application/json';

        // Register artifact
        await planService.addArtifact(plan_id, {
          name: safeFilename.replace(/\.[^/.]+$/, ''),
          phase: plan.phase,
          path: safeFilename,
          mime_type,
          created_at: new Date().toISOString(),
          source: 'agent',
        });

        // If this is a task-proposal.json, parse and store proposed_stories + project_prefix
        if (filename === 'task-proposal.json') {
          try {
            const proposal = JSON.parse(content);
            if (proposal.stories && Array.isArray(proposal.stories)) {
              const updateData: Partial<{ proposed_stories: any[]; project_prefix: string }> = { proposed_stories: proposal.stories };
              if (proposal.project_prefix) {
                updateData.project_prefix = proposal.project_prefix;
              }
              await planService.update(plan_id, updateData);
            }
          } catch {
            // Parse error is ok, just skip storing proposed stories
          }
        }

        return {
          content: [{ type: 'text' as const, text: `Artifact "${filename}" saved for plan ${plan_id}` }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${error}` }], isError: true };
      }
    },
  );

  // ── mark2_get_plan_artifact ─────────────────────────────────────────

  server.tool(
    'mark2_get_plan_artifact',
    'Read a plan artifact by name pattern',
    {
      plan_id: z.string().describe('Plan ID (e.g., PLAN-1)'),
      name_pattern: z.string().describe('Filename or pattern to match (e.g., prd, tech-spec)'),
    },
    async ({ plan_id, name_pattern }) => {
      try {
        const mark2Dir = getMark2Dir();
        const artifactDir = path.join(mark2Dir, 'storage', plan_id, 'artifacts');

        if (!fs.existsSync(artifactDir)) {
          return { content: [{ type: 'text' as const, text: `No artifacts found for plan ${plan_id}` }], isError: true };
        }

        // Find matching file
        const files = fs.readdirSync(artifactDir);
        const match = files.find(f => f.includes(name_pattern));

        if (!match) {
          return {
            content: [{ type: 'text' as const, text: `No artifact matching "${name_pattern}" found. Available: ${files.join(', ')}` }],
            isError: true,
          };
        }

        const fileContent = fs.readFileSync(path.join(artifactDir, match), 'utf-8');
        return {
          content: [{ type: 'text' as const, text: fileContent }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${error}` }], isError: true };
      }
    },
  );

  // ── mark2_signal_plan_complete ──────────────────────────────────────

  server.tool(
    'mark2_signal_plan_complete',
    'Signal that a plan phase is complete',
    {
      plan_id: z.string().describe('Plan ID (e.g., PLAN-1)'),
      token: z.string().describe('Completion token (e.g., [PRD_COMPLETED], [TECH_SPEC_COMPLETED], [TASKS_GENERATED])'),
    },
    async ({ plan_id, token }) => {
      try {
        const apiBaseUrl = process.env.MARK2_API_URL || `http://localhost:${process.env.PORT || 3100}`;
        const response = await fetch(`${apiBaseUrl}/api/plans/${plan_id}/phase/hook-complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, source: 'mcp' }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          return {
            content: [{ type: 'text' as const, text: `Error signaling completion: ${(err as Record<string, string>).error || response.statusText}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Plan ${plan_id} phase completion signaled with token: ${token}` }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${error}` }], isError: true };
      }
    },
  );

  // ── mark2_get_plan ──────────────────────────────────────────────────

  server.tool(
    'mark2_get_plan',
    'Read full plan details',
    {
      plan_id: z.string().describe('Plan ID (e.g., PLAN-1)'),
    },
    async ({ plan_id }) => {
      try {
        const mark2Dir = getMark2Dir();
        const { PlanService } = await import('../services/plan-service');
        const planService = new PlanService(mark2Dir);

        const plan = planService.getById(plan_id);
        if (!plan) {
          return { content: [{ type: 'text' as const, text: `Plan ${plan_id} not found` }], isError: true };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(plan, null, 2) }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${error}` }], isError: true };
      }
    },
  );

  return server;
}
