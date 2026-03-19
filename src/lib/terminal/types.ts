export type TerminalTargetKind = 'task' | 'plan';

export type TerminalMode = 'observe' | 'control';

export interface TerminalTarget {
  kind: TerminalTargetKind;
  id: string;
}

export interface TerminalSessionInfo {
  tmux_session: string;
  agent_name: string;
  phase: string;
  status: string;
}

export interface TerminalMetadata {
  ws_path: string;
  default_mode: TerminalMode;
  control_supported: boolean;
}

export interface TerminalSessionResponse {
  session: TerminalSessionInfo | null;
  terminal: TerminalMetadata;
}

export interface TerminalBridge {
  connectionId: string;
  target: TerminalTarget;
  tmuxSession: string;
  mode: TerminalMode;
  cols: number;
  rows: number;
  connectedAt: string;
}

export interface TerminalResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface TerminalInputMessage {
  type: 'input';
  data: string;
}

export interface TerminalPingMessage {
  type: 'ping';
}

export type TerminalClientMessage =
  | TerminalResizeMessage
  | TerminalInputMessage
  | TerminalPingMessage;

export interface TerminalReadyMessage {
  type: 'ready';
  session: string;
  mode: TerminalMode;
}

export interface TerminalOutputMessage {
  type: 'output';
  data: string;
}

export interface TerminalModeMessage {
  type: 'mode';
  mode: TerminalMode;
}

export interface TerminalExitMessage {
  type: 'exit';
  code: number;
}

export interface TerminalErrorMessage {
  type: 'error';
  message: string;
}

export type TerminalServerMessage =
  | TerminalReadyMessage
  | TerminalOutputMessage
  | TerminalModeMessage
  | TerminalExitMessage
  | TerminalErrorMessage;

// WebSocket close codes
export const CLOSE_CONTROL_CONFLICT = 4409;

// Error messages
export const CONTROL_CONFLICT_MESSAGE =
  'Another browser already has control of this terminal.';
