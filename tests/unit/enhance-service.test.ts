import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { EnhanceService } from '@/lib/services/enhance-service';
import { ConfigService } from '@/lib/services/config-service';
import { YamlWriter } from '@/lib/yaml/writer';
import type { Task, Story, Config, RolesFile } from '@/types';
import * as child_process from 'child_process';

// Mock child_process
vi.mock('child_process');

let mark2Dir: string;
let configService: ConfigService;
let enhanceService: EnhanceService;
let yamlWriter: YamlWriter;

const mockTask: Task = {
  id: 'TASK-1',
  title: 'Simple task',
  description: 'A simple task description',
  phase: 'pending',
  phase_agents: {},
  phase_overrides: {},
  blockers: [],
  priority: 'P2',
  artifacts: [],
  ports: [],
  worktrees: {},
  created_by: 'human',
  merge_strategy: 'squash',
  auto_advance: true,
  auto_approve: false,
  created_at: '2025-01-15T10:00:00.000Z',
  updated_at: '2025-01-15T10:00:00.000Z',
  phase_entered_at: '2025-01-15T10:00:00.000Z',
  loop_count: 0,
  archived: false,
};

const mockStory: Story = {
  id: 'STORY-1',
  title: 'Simple story',
  description: 'A simple story description',
  tasks: [],
  execution: {
    status: 'idle',
    base_branch: 'main',
    target_branch: 'main',
    task_merge_failures: [],
  },
  created_by: 'human',
  created_at: '2025-01-15T10:00:00.000Z',
  updated_at: '2025-01-15T10:00:00.000Z',
};

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-enhance-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });

  // Create YamlWriter to set up config and roles
  yamlWriter = new YamlWriter(mark2Dir);

  // Create minimal valid config
  const config: Config = {
    project_name: 'test-project',
    base_port: 3000,
    ports_per_task: 10,
    auto_fix: { P0: true, P1: false, P2: false },
    phase_defaults: {},
    plan_phase_defaults: {},
    max_loop_count: 5,
    server_port: 3100,
    merge_strategy: 'squash',
    ide_commands: ['code'],
    enhance_config: {
      role: 'task-enhancer',
      cli_tool: 'claude-code',
      model: 'claude-sonnet-4-5',
      timeout_minutes: 30,
    },
  };
  yamlWriter.writeConfig(config);

  // Create roles file with task-enhancer role
  const roles: RolesFile = {
    roles: [
      {
        name: 'task-enhancer',
        description: 'AI assistant for enhancing task and story descriptions',
        role_prompt: 'You are an expert technical writer who enhances task and story descriptions. Output ONLY valid JSON with enhanced_title and enhanced_description fields.',
        suggested_phases: [],
        timeout_minutes: 30,
      },
    ],
  };
  yamlWriter.writeRoles(roles);

  configService = new ConfigService(mark2Dir);
  enhanceService = new EnhanceService(configService);
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('EnhanceService', () => {
  describe('parseResult', () => {
    it('parses JSON in markdown code block', () => {
      const result = `Here is the enhanced version:
\`\`\`json
{
  "enhanced_title": "Enhanced Title",
  "enhanced_description": "Enhanced Description"
}
\`\`\`
Done!`;

      const parsed = (enhanceService as any).parseResult(result);
      expect(parsed.enhanced_title).toBe('Enhanced Title');
      expect(parsed.enhanced_description).toBe('Enhanced Description');
    });

    it('parses JSON in code block without json language tag', () => {
      const result = `\`\`\`
{
  "enhanced_title": "Enhanced Title",
  "enhanced_description": "Enhanced Description"
}
\`\`\``;

      const parsed = (enhanceService as any).parseResult(result);
      expect(parsed.enhanced_title).toBe('Enhanced Title');
      expect(parsed.enhanced_description).toBe('Enhanced Description');
    });

    it('parses standalone JSON object', () => {
      const result = `{"enhanced_title": "Enhanced Title", "enhanced_description": "Enhanced Description"}`;

      const parsed = (enhanceService as any).parseResult(result);
      expect(parsed.enhanced_title).toBe('Enhanced Title');
      expect(parsed.enhanced_description).toBe('Enhanced Description');
    });

    it('parses JSON object with extra text around it', () => {
      const result = `Some text before
{"enhanced_title": "Enhanced Title", "enhanced_description": "Enhanced Description"}
Some text after`;

      const parsed = (enhanceService as any).parseResult(result);
      expect(parsed.enhanced_title).toBe('Enhanced Title');
      expect(parsed.enhanced_description).toBe('Enhanced Description');
    });

    it('parses JSON with newlines in description', () => {
      const result = `\`\`\`json
{
  "enhanced_title": "Enhanced Title",
  "enhanced_description": "Line 1\\nLine 2\\nLine 3"
}
\`\`\``;

      const parsed = (enhanceService as any).parseResult(result);
      expect(parsed.enhanced_title).toBe('Enhanced Title');
      // JSON.parse converts \n to actual newlines
      expect(parsed.enhanced_description).toBe('Line 1\nLine 2\nLine 3');
    });

    it('truncates title to 200 characters', () => {
      const longTitle = 'A'.repeat(250);
      const result = `{"enhanced_title": "${longTitle}", "enhanced_description": "Desc"}`;

      const parsed = (enhanceService as any).parseResult(result);
      expect(parsed.enhanced_title).toHaveLength(200);
      expect(parsed.enhanced_title).toBe('A'.repeat(200));
    });

    it('throws PARSE_ERROR when JSON is invalid', () => {
      const result = `Not valid JSON at all`;

      expect(() => {
        (enhanceService as any).parseResult(result);
      }).toThrow('PARSE_ERROR: Could not find JSON in AI response');
    });

    it('throws PARSE_ERROR when JSON is missing required fields', () => {
      const result = `{"enhanced_title": "Only Title"}`;

      expect(() => {
        (enhanceService as any).parseResult(result);
      }).toThrow('PARSE_ERROR: Could not find JSON in AI response');
    });

    it('uses fallback regex extraction for partial JSON', () => {
      const result = `The enhanced version has:
"enhanced_title": "Enhanced Title",
"enhanced_description": "Enhanced Description",
`;

      const parsed = (enhanceService as any).parseResult(result);
      expect(parsed.enhanced_title).toBe('Enhanced Title');
      expect(parsed.enhanced_description).toBe('Enhanced Description');
    });
  });

  describe('extractJsonObjects', () => {
    it('extracts single JSON object', () => {
      const text = 'Some text {"key": "value"} more text';
      const objects = (enhanceService as any).extractJsonObjects(text);
      expect(objects).toEqual(['{"key": "value"}']);
    });

    it('extracts multiple JSON objects', () => {
      const text = '{"a": 1} and {"b": 2}';
      const objects = (enhanceService as any).extractJsonObjects(text);
      expect(objects).toEqual(['{"a": 1}', '{"b": 2}']);
    });

    it('handles nested braces', () => {
      const text = '{"outer": {"inner": "value"}}';
      const objects = (enhanceService as any).extractJsonObjects(text);
      expect(objects).toEqual(['{"outer": {"inner": "value"}}']);
    });

    it('returns empty array when no objects found', () => {
      const text = 'No JSON here at all';
      const objects = (enhanceService as any).extractJsonObjects(text);
      expect(objects).toEqual([]);
    });
  });

  describe('buildPrompt', () => {
    it('builds prompt for task with description', () => {
      const rolePrompt = 'You are a task enhancer.';
      const prompt = (enhanceService as any).buildPrompt(
        'Simple Task',
        'Task description here',
        'task',
        rolePrompt
      );

      expect(prompt).toContain('You are a task enhancer.');
      expect(prompt).toContain('Current task:');
      expect(prompt).toContain('Title: Simple Task');
      expect(prompt).toContain('Description:\nTask description here');
      expect(prompt).toContain('Please enhance this task');
      expect(prompt).toContain('ONLY valid JSON');
    });

    it('builds prompt for task without description', () => {
      const rolePrompt = 'You are a task enhancer.';
      const prompt = (enhanceService as any).buildPrompt(
        'Simple Task',
        '',
        'task',
        rolePrompt
      );

      expect(prompt).toContain('(no description provided)');
    });

    it('builds prompt for story', () => {
      const rolePrompt = 'You are a story enhancer.';
      const prompt = (enhanceService as any).buildPrompt(
        'Simple Story',
        'Story description',
        'story',
        rolePrompt
      );

      expect(prompt).toContain('Current story:');
      expect(prompt).toContain('Please enhance this story');
    });
  });

  describe('enhanceTask', () => {
    it('enhances task successfully with valid JSON response', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue(JSON.stringify({
        enhanced_title: 'Enhanced Task Title',
        enhanced_description: 'Enhanced task description with more details'
      }));

      const result = await enhanceService.enhanceTask(mockTask);

      expect(result.enhanced_title).toBe('Enhanced Task Title');
      expect(result.enhanced_description).toBe('Enhanced task description with more details');
      expect(mockExecSync).toHaveBeenCalledOnce();
    });

    it('enhances task with JSON in code block', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue(`Here's the result:
\`\`\`json
{
  "enhanced_title": "Better Title",
  "enhanced_description": "Better description"
}
\`\`\``);

      const result = await enhanceService.enhanceTask(mockTask);

      expect(result.enhanced_title).toBe('Better Title');
      expect(result.enhanced_description).toBe('Better description');
    });

    it('throws error when role not found', async () => {
      await expect(
        enhanceService.enhanceTask(mockTask, { role: 'non-existent-role' })
      ).rejects.toThrow('Role "non-existent-role" not found');
    });

    it('throws error when CLI tool is not claude-code', async () => {
      await expect(
        enhanceService.enhanceTask(mockTask, { cli_tool: 'other-tool' as any })
      ).rejects.toThrow('CLI tool "other-tool" is not supported');
    });

    it('throws TIMEOUT error when command times out', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      const timeoutError: any = new Error('Command timed out');
      timeoutError.killed = true;
      mockExecSync.mockImplementation(() => {
        throw timeoutError;
      });

      await expect(
        enhanceService.enhanceTask(mockTask)
      ).rejects.toThrow('TIMEOUT: Enhancement request timed out');
    });

    it('throws AI_ERROR when command fails', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      await expect(
        enhanceService.enhanceTask(mockTask)
      ).rejects.toThrow('AI_ERROR: Command failed');
    });

    it('throws error when response is empty', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue('');

      await expect(
        enhanceService.enhanceTask(mockTask)
      ).rejects.toThrow('AI_ERROR: Empty response from Claude');
    });

    it('uses config overrides correctly', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue(JSON.stringify({
        enhanced_title: 'Title',
        enhanced_description: 'Description'
      }));

      await enhanceService.enhanceTask(mockTask, {
        model: 'custom-model',
      });

      const callArgs = mockExecSync.mock.calls[0];
      expect(callArgs[0]).toContain('custom-model');
    });
  });

  describe('enhanceStory', () => {
    it('enhances story successfully', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue(JSON.stringify({
        enhanced_title: 'Enhanced Story Title',
        enhanced_description: 'Enhanced story description'
      }));

      const result = await enhanceService.enhanceStory(mockStory);

      expect(result.enhanced_title).toBe('Enhanced Story Title');
      expect(result.enhanced_description).toBe('Enhanced story description');
      expect(mockExecSync).toHaveBeenCalledOnce();
    });

    it('builds correct prompt for story', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue(JSON.stringify({
        enhanced_title: 'Title',
        enhanced_description: 'Description'
      }));

      await enhanceService.enhanceStory(mockStory);

      // Check that the prompt file contains story-specific text
      const callArgs = mockExecSync.mock.calls[0];
      expect(callArgs[0]).toContain('claude');
    });
  });

  describe('error handling and edge cases', () => {
    it('handles malformed JSON gracefully', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue('{broken json');

      await expect(
        enhanceService.enhanceTask(mockTask)
      ).rejects.toThrow('PARSE_ERROR');
    });

    it('handles JSON with missing enhanced_title', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue(JSON.stringify({
        enhanced_description: 'Only description'
      }));

      await expect(
        enhanceService.enhanceTask(mockTask)
      ).rejects.toThrow('PARSE_ERROR');
    });

    it('handles JSON with missing enhanced_description', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue(JSON.stringify({
        enhanced_title: 'Only title'
      }));

      await expect(
        enhanceService.enhanceTask(mockTask)
      ).rejects.toThrow('PARSE_ERROR');
    });

    it('handles very large responses', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      const largeDescription = 'A'.repeat(100000);
      mockExecSync.mockReturnValue(JSON.stringify({
        enhanced_title: 'Title',
        enhanced_description: largeDescription
      }));

      const result = await enhanceService.enhanceTask(mockTask);
      expect(result.enhanced_description).toBe(largeDescription);
    });

    it('converts non-string values to strings', async () => {
      const mockExecSync = vi.mocked(child_process.execSync);
      mockExecSync.mockReturnValue(JSON.stringify({
        enhanced_title: 123, // number instead of string
        enhanced_description: true // boolean instead of string
      }));

      const result = await enhanceService.enhanceTask(mockTask);
      expect(result.enhanced_title).toBe('123');
      expect(result.enhanced_description).toBe('true');
    });
  });
});
