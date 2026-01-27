export * from '../lib/yaml/schemas';

import type {
  Task,
  Story,
  StoryStatus,
  Phase,
  TaskArtifact,
} from '../lib/yaml/schemas';

// ---------------------------------------------------------------------------
// Derived / Utility Types
// ---------------------------------------------------------------------------

export interface TaskWithStatus extends Task {
  status:
    | 'idle'
    | 'running'
    | 'waiting'
    | 'failed'
    | 'looping'
    | 'blocked'
    | 'stuck';
}

export interface StoryWithStatus extends Story {
  status: StoryStatus;
  task_count: number;
  completed_count: number;
}

export interface PhaseContext {
  task: Task;
  phase: Phase;
  design_document?: string;
  review_comments?: string;
  test_failures?: string;
  human_comments?: string;
  previous_artifacts: TaskArtifact[];
}

export interface WSMessage {
  event: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface AgentInvocationParams {
  prompt: string;
  workingDirectory: string;
  agentName: string;
  model: string;
  taskId: string;
  phase: Phase;
  mcpServerUrl?: string;
  apiBaseUrl: string;
  agentToken: string;
  timeoutMinutes: number;
}

export interface MergeResult {
  success: boolean;
  error?: 'merge_conflict' | 'rebase_failed';
}

export interface ReindexResult {
  tasks_indexed: number;
  stories_indexed: number;
  activities_indexed: number;
  errors: ParseError[];
}

export interface ParseError {
  file_path: string;
  error: string;
  preserved: boolean;
}
