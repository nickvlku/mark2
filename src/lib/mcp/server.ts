import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { YamlReader } from '../yaml/reader';
import { TaskService } from '../services/task-service';
import { ActivityService } from '../services/activity-service';
import { ArtifactService } from '../services/artifact-service';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMark2Dir(): string {
  return process.env.MARK2_DIR ?? path.join(process.cwd(), '.mark2');
}

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

  // ── mark2_report_artifact ────────────────────────────────────────────

  server.tool(
    'mark2_report_artifact',
    'Agent reports a created artifact for a task',
    {
      task_id: z.string().describe('The task ID'),
      name: z.string().describe('Artifact name'),
      path: z.string().describe('File path relative to the worktree'),
      mime_type: z.string().optional().describe('MIME type of the artifact'),
    },
    async ({ task_id, name, path: artifactPath, mime_type }) => {
      const mark2Dir = getMark2Dir();
      const reader = new YamlReader(mark2Dir);
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

  // ── mark2_get_design ─────────────────────────────────────────────────

  server.tool(
    'mark2_get_design',
    'Agent reads the design document for a task',
    {
      task_id: z.string().describe('The task ID'),
    },
    async ({ task_id }) => {
      const mark2Dir = getMark2Dir();
      const artifactService = new ArtifactService(mark2Dir);

      const designArtifacts = artifactService.getForTask(task_id, 'design');
      if (designArtifacts.length === 0) {
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

      const firstDesign = designArtifacts[0];
      const { content, exists } = artifactService.getContent(firstDesign.path);

      if (!exists) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Design artifact registered but file not found: ${firstDesign.path}`,
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
    'Agent signals phase completion with an end token',
    {
      task_id: z.string().describe('The task ID'),
      token: z.string().describe('The end token (e.g. [DESIGN_COMPLETE])'),
    },
    async ({ task_id, token }) => {
      const mark2Dir = getMark2Dir();
      const activityService = new ActivityService(mark2Dir);

      activityService.log(
        task_id,
        'agent',
        'note',
        `Agent signaled completion with token: ${token}`,
        { token },
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: `Completion signal recorded for ${task_id} with token: ${token}`,
          },
        ],
      };
    },
  );

  return server;
}
