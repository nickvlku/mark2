// Model definitions for each CLI tool
// Used in agent configuration dialogs to show a dropdown of available models

export interface ModelDefinition {
  id: string;
  name: string;
  description?: string;
}

export type CLITool = 'claude-code' | 'codex-cli' | 'gemini-cli' | 'opencode';

export const MODELS_BY_CLI: Record<CLITool, ModelDefinition[]> = {
  'claude-code': [
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  ],
  'codex-cli': [
    { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', description: 'Latest agentic coding model' },
    { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', description: 'Long-horizon agentic tasks' },
    { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', description: 'Cost-effective' },
    { id: 'o4-mini', name: 'O4 Mini', description: 'Fast reasoning' },
  ],
  'gemini-cli': [
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', description: 'Pro-level at Flash speed' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', description: 'State-of-the-art reasoning' },
  ],
  'opencode': [
    { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2' },
    { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
  ],
};

export const CLI_TOOLS: CLITool[] = ['claude-code', 'codex-cli', 'gemini-cli', 'opencode'];

// Model migration map for backward compatibility
// Automatically maps old model IDs to current aliases
export const MODEL_MIGRATIONS: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-5',
  'claude-opus-4-20250514': 'claude-opus-4-5',
  'claude-opus-4-5': 'claude-opus-4-6',
};
