import fs from "fs";
import path from "path";
import type { CLIAdapter } from "./types";
import type { AgentInvocationParams } from "../../types";
import {
  getTaskStoragePaths,
  ensureTaskStorageExistsSync,
} from "../utils/storage";
import { getMark2InstallDir } from "../utils/mark2-dir";

/**
 * Adapter for OpenAI's Codex CLI.
 * Runs in full-auto mode with approval workflow.
 * Preparing for future MCP and session naming support.
 *
 * Note: buildCommand() performs filesystem I/O as a side effect
 * (writes MCP config and AGENTS.md). This matches the ClaudeCodeAdapter pattern.
 */
export class CodexCLIAdapter implements CLIAdapter {
  readonly toolId = "codex-cli" as const;
  readonly supportsMCP = true;
  readonly supportsNaming = false;

  buildCommand(params: AgentInvocationParams): string {
    // Set up configuration files before building command
    this.setupMcpConfig(params);
    this.setupAgentsMd(params);

    // TODO: Verify exact Codex CLI flag names when integration is finalized.
    // --approval-mode full-auto is used instead of separate --full-auto and
    // --ask-for-approval flags to avoid potential flag conflicts.
    const projectRoot = this.getProjectRoot(
      params.workingDirectory,
      params.taskId,
    );

    // Ensure storage directories exist
    ensureTaskStorageExistsSync(projectRoot, params.taskId);

    // Generate AGENTS.md for Codex CLI to discover
    this.setupAgentsMd(params);

    // Save individual prompt components for debugging (matches Claude adapter pattern)
    const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);
    fs.writeFileSync(
      path.join(storagePaths.prompts, `${params.phase}-orchestration.md`),
      params.orchestrationPrompt ?? "",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(storagePaths.prompts, `${params.phase}-agent.md`),
      params.agentPrompt ?? "",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(storagePaths.prompts, `${params.phase}-task.md`),
      params.taskPrompt ?? params.prompt,
      "utf-8",
    );

    // Use taskPrompt (just the task description) since AGENTS.md handles
    // orchestration and role instructions
    const taskPrompt = params.taskPrompt ?? params.prompt;

    const parts: string[] = [
      "codex",
      "--approval-mode",
      "full-auto",
      "--model",
      this.shellQuote(params.model),
      this.shellQuote(taskPrompt),
    ];

    return parts.join(" ");
  }

  getEnvironment(params: AgentInvocationParams): Record<string, string> {
    const projectRoot = this.getProjectRoot(
      params.workingDirectory,
      params.taskId,
    );
    const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);

    return {
      NODE_ENV: "development",
      MARK2_AGENT_TOKEN: params.agentToken,
      MARK2_API_URL: params.apiBaseUrl,
      MARK2_TASK_ID: params.taskId,
      MARK2_STORAGE_DIR: storagePaths.root,
      MARK2_ARTIFACTS_DIR: storagePaths.artifacts,
      MARK2_PROMPTS_DIR: storagePaths.prompts,
      MARK2_SESSIONS_DIR: storagePaths.sessions,
    };
  }

  /**
   * Set up MCP configuration for future MCP support.
   * Currently a placeholder - will be implemented when Codex adds MCP support.
   */
  private setupMcpConfig(params: AgentInvocationParams): void {
    const mcpConfigPath = path.join(
      params.workingDirectory,
      ".codex",
      "mcp-config.json",
    );
    // TODO: When Codex adds MCP support, restructure to match ClaudeCodeAdapter's
    // buildMcpConfig() format with command/args/env per server entry.
    const mcpConfig = {
      mcpServers: {},
      taskId: params.taskId,
      apiBaseUrl: params.apiBaseUrl,
    };

    // Ensure .codex directory exists (recursive is a no-op if it already exists)
    const codexDir = path.dirname(mcpConfigPath);
    fs.mkdirSync(codexDir, { recursive: true });

    // Write MCP config file
    fs.writeFileSync(
      mcpConfigPath,
      JSON.stringify(mcpConfig, null, 2),
      "utf-8",
    );
  }

  /**
   * Generate AGENTS.md file for Codex CLI to discover.
   * Combines agent role prompt + orchestration instructions + MCP tools reference.
   * Writes to both worktree root (for Codex to discover) and debug directory.
   */
  private setupAgentsMd(params: AgentInvocationParams): void {
    const content = this.buildAgentsMdContent(params);

    // 1. Write to worktree root (where Codex CLI discovers it)
    const agentsMdPath = path.join(params.workingDirectory, "AGENTS.md");
    fs.writeFileSync(agentsMdPath, content, "utf-8");

    // 2. Write debug copy to storage/prompts/
    const projectRoot = this.getProjectRoot(
      params.workingDirectory,
      params.taskId,
    );
    const storagePaths = getTaskStoragePaths(projectRoot, params.taskId);
    fs.writeFileSync(
      path.join(storagePaths.prompts, `${params.phase}-agents.md`),
      content,
      "utf-8",
    );

    // 3. Exclude AGENTS.md from git tracking in this clone
    this.excludeFromGit(params.workingDirectory, "AGENTS.md");
  }

  /**
   * Build the complete AGENTS.md content from component parts.
   */
  private buildAgentsMdContent(params: AgentInvocationParams): string {
    const sections: string[] = [];

    // Section 1: Agent role/personality
    if (params.agentPrompt) {
      sections.push(`# Agent Role\n\n${params.agentPrompt}`);
    }

    // Section 2: Orchestration instructions (phase rules, completion protocol, etc.)
    if (params.orchestrationPrompt) {
      sections.push(params.orchestrationPrompt);
    }

    // Section 3: MCP tools quick-reference
    sections.push(this.buildMcpToolsReference());

    return sections.join("\n\n");
  }

  /**
   * Build a quick-reference section documenting available MCP tools.
   * This supplements the orchestration prompt's inline tool references.
   */
  private buildMcpToolsReference(): string {
    return `# Available MCP Tools

Brief reference of mark2_* MCP tools available in your environment.

## Task Management
- \`mark2_report_status(task_id, status, message)\` — Report progress
- \`mark2_get_task(task_id)\` — Read full task details
- \`mark2_log_activity(task_id, type, message)\` — Log activity

## Artifacts
- \`mark2_save_artifact(task_id, filename, content)\` — Save and register artifact
- \`mark2_get_design(task_id)\` — Get design document
- \`mark2_get_latest_artifact(task_id, name_pattern)\` — Get most recent artifact
- \`mark2_list_artifacts(task_id)\` — List all artifacts
- \`mark2_get_artifact(task_id, artifact_path)\` — Get specific artifact
- \`mark2_get_paths(task_id)\` — Get storage paths

## Git Operations
- \`mark2_git_status(task_id)\` — Check git status
- \`mark2_git_commit(task_id, message)\` — Stage all and commit
- \`mark2_git_push(task_id)\` — Push branch to remote
- \`mark2_git_sync(task_id)\` — Sync with main (fetch + rebase)
- \`mark2_get_diff(task_id)\` — Get diff from origin/main

## Phase Completion
- \`mark2_signal_complete(task_id, token)\` — Signal phase completion

## Planning (if needed)
- \`mark2_create_task(title, description, priority?, story_id?)\` — Create task
- \`mark2_create_story(title, description)\` — Create story
- \`mark2_add_to_story(task_id, story_id)\` — Assign task to story
- \`mark2_add_task_blocker(task_id, blocker_id)\` — Add dependency`;
  }

  /**
   * Exclude a file from git tracking using .git/info/exclude.
   * This is local to the clone and won't be committed.
   */
  private excludeFromGit(workingDirectory: string, filename: string): void {
    const gitDir = this.getGitDir(workingDirectory);
    const excludePath = path.join(gitDir, "info", "exclude");
    const excludeDir = path.dirname(excludePath);

    if (!fs.existsSync(excludeDir)) {
      fs.mkdirSync(excludeDir, { recursive: true });
    }

    const existing = fs.existsSync(excludePath)
      ? fs.readFileSync(excludePath, "utf-8")
      : "";

    if (!existing.includes(filename)) {
      fs.appendFileSync(excludePath, `\n${filename}\n`, "utf-8");
    }
  }

  /**
   * Get the .git directory path, handling both regular clones and worktrees.
   * For regular clones, .git is a directory.
   * For worktrees, .git is a file pointing to the actual gitdir.
   */
  private getGitDir(workingDirectory: string): string {
    const dotGit = path.join(workingDirectory, ".git");

    if (!fs.existsSync(dotGit)) {
      return dotGit;
    }

    const stat = fs.statSync(dotGit);
    if (stat.isFile()) {
      // Worktree: read the gitdir pointer
      const content = fs.readFileSync(dotGit, "utf-8").trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (match) {
        const gitdir = match[1];
        return path.isAbsolute(gitdir)
          ? gitdir
          : path.resolve(workingDirectory, gitdir);
      }
    }

    return dotGit;
  }

  /**
   * Extract the project root from the clone path.
   * Clone paths follow patterns like: /path/to/project/.mark2/clones/TASK-123
   */
  private getProjectRoot(workingDirectory: string, _taskId: string): string {
    const mark2Index = workingDirectory.indexOf(".mark2");
    if (mark2Index !== -1) {
      return workingDirectory.substring(0, mark2Index).replace(/\/$/, "");
    }

    const worktreesIndex = workingDirectory.indexOf(".worktrees");
    if (worktreesIndex !== -1) {
      return workingDirectory.substring(0, worktreesIndex).replace(/\/$/, "");
    }

    return workingDirectory;
  }

  private shellQuote(value: string): string {
    // Handle single quotes in the value by escaping them properly
    // Using the POSIX shell quoting format: 'text'\''more text'
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  /**
   * Remove configuration files created during buildCommand().
   * Best-effort: errors are logged but never thrown.
   */
  async cleanup(workingDirectory: string): Promise<void> {
    // 1. Delete .codex/config.toml
    try {
      await fs.promises.unlink(
        path.join(workingDirectory, ".codex", "config.toml"),
      );
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err ? err.code : null;
      if (code !== "ENOENT") {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          `[codex-cli] cleanup: failed to delete .codex/config.toml: ${message}`,
        );
      }
    }

    // 2. Delete AGENTS.md
    try {
      await fs.promises.unlink(path.join(workingDirectory, "AGENTS.md"));
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err ? err.code : null;
      if (code !== "ENOENT") {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          `[codex-cli] cleanup: failed to delete AGENTS.md: ${message}`,
        );
      }
    }

    // 3. Remove .codex directory only if empty
    try {
      await fs.promises.rmdir(path.join(workingDirectory, ".codex"));
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err ? err.code : null;
      if (code !== "ENOENT" && code !== "ENOTEMPTY") {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          `[codex-cli] cleanup: failed to remove .codex directory: ${message}`,
        );
      }
    }
  }
}
