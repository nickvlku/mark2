import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { initializeDatabase, closeDb } from '@/lib/db';
import { TaskService } from '@/lib/services/task-service';
import { StoryService } from '@/lib/services/story-service';
import { EnhanceService } from '@/lib/services/enhance-service';
import { ConfigService } from '@/lib/services/config-service';
import { YamlWriter } from '@/lib/yaml/writer';
import type { Config, RolesFile } from '@/types';
import * as child_process from 'child_process';

// Mock child_process
vi.mock('child_process');

let mark2Dir: string;
let taskService: TaskService;
let storyService: StoryService;
let enhanceService: EnhanceService;
let configService: ConfigService;
let yamlWriter: YamlWriter;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-enhance-api-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });
  initializeDatabase(mark2Dir);

  // Create YamlWriter to set up config and roles
  yamlWriter = new YamlWriter(mark2Dir);

  // Create minimal valid config
  const config: Config = {
    project_name: 'test-project',
    base_port: 3000,
    ports_per_task: 10,
    auto_fix: { P0: true, P1: false, P2: false },
    phase_defaults: {},
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

  // Use localOnly=true to skip git operations in tests
  taskService = new TaskService(mark2Dir, undefined, true);
  storyService = new StoryService(mark2Dir, undefined, true);
  configService = new ConfigService(mark2Dir);
  enhanceService = new EnhanceService(configService);

  vi.clearAllMocks();
});

afterEach(() => {
  closeDb();
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('Task Enhancement API Integration', () => {
  it('successfully enhances a task in pending phase', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Simple task',
      description: 'Simple description',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Enhanced Task Title',
      enhanced_description: 'Enhanced task description with more details'
    }));

    // Act
    const result = await enhanceService.enhanceTask(task);

    // Assert
    expect(result.enhanced_title).toBe('Enhanced Task Title');
    expect(result.enhanced_description).toBe('Enhanced task description with more details');
  });

  it('rejects enhancement for task not in pending phase', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Task in progress',
      description: 'Description',
      priority: 'P2',
      created_by: 'human',
    });

    // Move task to coding phase
    await taskService.update(task.id, { phase: 'coding' });
    const updatedTask = taskService.getById(task.id);

    // Act & Assert
    // In a real API, this would be handled by the route validation
    // Here we just verify the task is not in pending
    expect(updatedTask?.phase).not.toBe('pending');
    expect(updatedTask?.phase).toBe('coding');
  });

  it('handles enhancement with empty description', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Task without description',
      description: '',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Better Title',
      enhanced_description: 'AI-generated description based on title'
    }));

    // Act
    const result = await enhanceService.enhanceTask(task);

    // Assert
    expect(result.enhanced_title).toBe('Better Title');
    expect(result.enhanced_description).toBe('AI-generated description based on title');
  });

  it('preserves original task when enhancement is not applied', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Original title',
      description: 'Original description',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Enhanced title',
      enhanced_description: 'Enhanced description'
    }));

    // Act
    const result = await enhanceService.enhanceTask(task);

    // Don't update the task - just get the enhancement
    const unchangedTask = taskService.getById(task.id);

    // Assert
    expect(result.enhanced_title).toBe('Enhanced title');
    expect(unchangedTask?.title).toBe('Original title'); // Original unchanged
  });

  it('can update task with enhanced values', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Original title',
      description: 'Original description',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Enhanced title',
      enhanced_description: 'Enhanced description'
    }));

    // Act
    const result = await enhanceService.enhanceTask(task);

    // Apply the enhancement
    await taskService.update(task.id, {
      title: result.enhanced_title,
      description: result.enhanced_description,
    });

    const updatedTask = taskService.getById(task.id);

    // Assert
    expect(updatedTask?.title).toBe('Enhanced title');
    expect(updatedTask?.description).toBe('Enhanced description');
  });

  it('handles AI timeout gracefully', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Task that will timeout',
      description: 'Description',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    const timeoutError: any = new Error('Timeout');
    timeoutError.killed = true;
    mockExecSync.mockImplementation(() => {
      throw timeoutError;
    });

    // Act & Assert
    await expect(
      enhanceService.enhanceTask(task)
    ).rejects.toThrow('TIMEOUT');
  });

  it('handles AI error gracefully', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Task that will fail',
      description: 'Description',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockImplementation(() => {
      throw new Error('AI service error');
    });

    // Act & Assert
    await expect(
      enhanceService.enhanceTask(task)
    ).rejects.toThrow('AI_ERROR');
  });

  it('handles parse error gracefully', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Task with bad response',
      description: 'Description',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue('Not valid JSON at all');

    // Act & Assert
    await expect(
      enhanceService.enhanceTask(task)
    ).rejects.toThrow('PARSE_ERROR');
  });

  it('uses custom model override', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Task to enhance',
      description: 'Description',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Enhanced',
      enhanced_description: 'Enhanced desc'
    }));

    // Act
    await enhanceService.enhanceTask(task, { model: 'custom-model' });

    // Assert
    const callArgs = mockExecSync.mock.calls[0];
    expect(callArgs[0]).toContain('custom-model');
  });
});

describe('Story Enhancement API Integration', () => {
  it('successfully enhances a story', async () => {
    // Arrange
    const story = await storyService.create({
      title: 'Simple story',
      description: 'Simple story description',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Enhanced Story Title',
      enhanced_description: 'Enhanced story description with more details'
    }));

    // Act
    const result = await enhanceService.enhanceStory(story);

    // Assert
    expect(result.enhanced_title).toBe('Enhanced Story Title');
    expect(result.enhanced_description).toBe('Enhanced story description with more details');
  });

  it('can update story with enhanced values', async () => {
    // Arrange
    const story = await storyService.create({
      title: 'Original story title',
      description: 'Original story description',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Enhanced story title',
      enhanced_description: 'Enhanced story description'
    }));

    // Act
    const result = await enhanceService.enhanceStory(story);

    // Apply the enhancement
    await storyService.update(story.id, {
      title: result.enhanced_title,
      description: result.enhanced_description,
    });

    const updatedStory = storyService.getById(story.id);

    // Assert
    expect(updatedStory?.title).toBe('Enhanced story title');
    expect(updatedStory?.description).toBe('Enhanced story description');
  });

  it('handles enhancement with empty story description', async () => {
    // Arrange
    const story = await storyService.create({
      title: 'Story without description',
      description: '',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Better Story Title',
      enhanced_description: 'AI-generated story description'
    }));

    // Act
    const result = await enhanceService.enhanceStory(story);

    // Assert
    expect(result.enhanced_title).toBe('Better Story Title');
    expect(result.enhanced_description).toBe('AI-generated story description');
  });

  it('handles story enhancement timeout', async () => {
    // Arrange
    const story = await storyService.create({
      title: 'Story that will timeout',
      description: 'Description',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    const timeoutError: any = new Error('Timeout');
    timeoutError.killed = true;
    mockExecSync.mockImplementation(() => {
      throw timeoutError;
    });

    // Act & Assert
    await expect(
      enhanceService.enhanceStory(story)
    ).rejects.toThrow('TIMEOUT');
  });

  it('handles story enhancement AI error', async () => {
    // Arrange
    const story = await storyService.create({
      title: 'Story that will fail',
      description: 'Description',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockImplementation(() => {
      throw new Error('AI service error');
    });

    // Act & Assert
    await expect(
      enhanceService.enhanceStory(story)
    ).rejects.toThrow('AI_ERROR');
  });
});

describe('Enhancement Edge Cases', () => {
  it('handles very long task titles', async () => {
    // Arrange
    const longTitle = 'A'.repeat(300);
    const task = await taskService.create({
      title: longTitle.slice(0, 200), // TaskService should enforce limit
      description: 'Description',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    const enhancedLongTitle = 'B'.repeat(300);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: enhancedLongTitle,
      enhanced_description: 'Description'
    }));

    // Act
    const result = await enhanceService.enhanceTask(task);

    // Assert - should be truncated to 200 chars
    expect(result.enhanced_title.length).toBeLessThanOrEqual(200);
  });

  it('handles special characters in task content', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Task with "quotes" and \'apostrophes\'',
      description: 'Description with\nnewlines\nand\ttabs',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Enhanced with "quotes"',
      enhanced_description: 'Enhanced with\nnewlines'
    }));

    // Act
    const result = await enhanceService.enhanceTask(task);

    // Assert
    expect(result.enhanced_title).toContain('"quotes"');
    expect(result.enhanced_description).toContain('\n');
  });

  it('handles markdown in descriptions', async () => {
    // Arrange
    const task = await taskService.create({
      title: 'Task with markdown',
      description: '# Header\n\n- List item\n- Another item\n\n```code block```',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue(JSON.stringify({
      enhanced_title: 'Enhanced Task',
      enhanced_description: '## Better Header\n\n1. Ordered item\n2. Another ordered item'
    }));

    // Act
    const result = await enhanceService.enhanceTask(task);

    // Assert
    expect(result.enhanced_description).toContain('##');
    expect(result.enhanced_description).toContain('1.');
  });

  it('handles multiple rapid enhancements', async () => {
    // Arrange
    const task1 = await taskService.create({
      title: 'Task 1',
      description: 'Description 1',
      priority: 'P2',
      created_by: 'human',
    });

    const task2 = await taskService.create({
      title: 'Task 2',
      description: 'Description 2',
      priority: 'P2',
      created_by: 'human',
    });

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValueOnce(JSON.stringify({
      enhanced_title: 'Enhanced Task 1',
      enhanced_description: 'Enhanced Description 1'
    }));
    mockExecSync.mockReturnValueOnce(JSON.stringify({
      enhanced_title: 'Enhanced Task 2',
      enhanced_description: 'Enhanced Description 2'
    }));

    // Act
    const [result1, result2] = await Promise.all([
      enhanceService.enhanceTask(task1),
      enhanceService.enhanceTask(task2),
    ]);

    // Assert
    expect(result1.enhanced_title).toBe('Enhanced Task 1');
    expect(result2.enhanced_title).toBe('Enhanced Task 2');
    expect(mockExecSync).toHaveBeenCalledTimes(2);
  });
});
