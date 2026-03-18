export * from '../lib/yaml/schemas';
export type {
  TerminalBridge,
  TerminalClientMessage,
  TerminalMetadata,
  TerminalMode,
  TerminalServerMessage,
  TerminalSessionInfo,
  TerminalSessionResponse,
  TerminalTarget,
  TerminalTargetKind,
} from '../lib/terminal/types';

import type {
  Task,
  Story,
  StoryStatus,
  Phase,
  AssignablePhase,
  TaskArtifact,
} from '../lib/yaml/schemas';

// ---------------------------------------------------------------------------
// Derived / Utility Types
// ---------------------------------------------------------------------------

export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface LockInfo {
  locked_by: string;
  email: string;
  locked_at: string;
  machine: string;
}

export interface TaskWithSession extends Task {
  session_status: SessionStatus;
}

export interface TaskWithLock extends Task {
  lock?: LockInfo;
}

export interface TaskWithSessionAndLock extends TaskWithSession {
  lock?: LockInfo;
}

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
  // Split prompts for Claude CLI flags
  /** Orchestration instructions for --append-system-prompt */
  orchestrationPrompt?: string;
  /** Agent personality/role for --agents flag */
  agentPrompt?: string;
  /** Task description for first CLI argument */
  taskPrompt?: string;
  /** Agent slug for --agent flag */
  agentSlug?: string;
  /** Agent UUID for direct reference */
  agentUuid?: string;
}

export interface MergeResult {
  success: boolean;
  error?: 'merge_conflict' | 'rebase_failed';
}

export interface SyncResult {
  success: boolean;
  updated: boolean;
  message: string;
  conflicts?: string[];
}

export interface ReindexResult {
  tasks_indexed: number;
  stories_indexed: number;
  plans_indexed?: number;
  activities_indexed: number;
  errors: ParseError[];
  sync_result?: SyncResult;
}

export interface ParseError {
  file_path: string;
  error: string;
  preserved: boolean;
}
