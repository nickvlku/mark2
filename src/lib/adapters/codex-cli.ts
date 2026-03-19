import fs from "fs";
import os from "os";
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
 * Runs non-interactively with approvals and sandbox bypassed.
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
    const projectRoot = this.getProjectRoot(
      params.workingDirectory,
      params.taskId,
    );

    // Ensure storage directories exist BEFORE setting up config files
    ensureTaskStorageExistsSync(projectRoot, params.taskId);

    // Codex trusts exact project paths, so clone worktrees need explicit entries.
    this.ensureTrustedWorkingDirectory(params.workingDirectory);

    // Set up configuration files after storage directories exist
    this.setupMcpConfig(params);
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
    const mcpConfigOverrides = this.buildMcpConfigOverrides(
      projectRoot,
      params.taskId,
      params.apiBaseUrl,
    );

    const parts: string[] = [
      "codex",
      "--dangerously-bypass-approvals-and-sandbox",
      ...mcpConfigOverrides,
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
   * Write a debug copy of the mark2 MCP server config next to the clone.
   * Codex receives the same config via `-c mcp_servers...` overrides.
   */
  private setupMcpConfig(params: AgentInvocationParams): void {
    const projectRoot = this.getProjectRoot(
      params.workingDirectory,
      params.taskId,
    );
    const mcpConfigPath = path.join(
      params.workingDirectory,
      ".codex",
      "mcp-config.json",
    );
    const mcpConfig = this.buildMcpConfig(
      projectRoot,
      params.taskId,
      params.apiBaseUrl,
    );

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

  private tomlQuote(value: string): string {
    return JSON.stringify(value);
  }

  private buildMcpConfig(
    projectRoot: string,
    taskId: string,
    apiBaseUrl: string,
  ): {
    mcpServers: {
      mark2: {
        command: string;
        args: string[];
        env: Record<string, string>;
      };
    };
    taskId: string;
    apiBaseUrl: string;
  } {
    const mark2Dir = path.join(projectRoot, ".mark2");
    const installDir = getMark2InstallDir();
    const mcpServerPath = path.join(installDir, "src", "lib", "mcp", "index.ts");
    const tsxPath = path.join(installDir, "node_modules", ".bin", "tsx");

    return {
      mcpServers: {
        mark2: {
          command: tsxPath,
          args: [mcpServerPath],
          env: {
            MARK2_DIR: mark2Dir,
            MARK2_TASK_ID: taskId,
            MARK2_PROJECT_ROOT: projectRoot,
            MARK2_API_URL: apiBaseUrl,
          },
        },
      },
      taskId,
      apiBaseUrl,
    };
  }

  private buildMcpConfigOverrides(
    projectRoot: string,
    taskId: string,
    apiBaseUrl: string,
  ): string[] {
    const mcpConfig = this.buildMcpConfig(projectRoot, taskId, apiBaseUrl);
    const mark2 = mcpConfig.mcpServers.mark2;

    return [
      "-c",
      this.shellQuote(
        `mcp_servers.mark2.command=${this.tomlQuote(mark2.command)}`,
      ),
      "-c",
      this.shellQuote(
        `mcp_servers.mark2.args=${JSON.stringify(mark2.args)}`,
      ),
      "-c",
      this.shellQuote(
        `mcp_servers.mark2.env.MARK2_DIR=${this.tomlQuote(mark2.env.MARK2_DIR)}`,
      ),
      "-c",
      this.shellQuote(
        `mcp_servers.mark2.env.MARK2_TASK_ID=${this.tomlQuote(mark2.env.MARK2_TASK_ID)}`,
      ),
      "-c",
      this.shellQuote(
        `mcp_servers.mark2.env.MARK2_PROJECT_ROOT=${this.tomlQuote(mark2.env.MARK2_PROJECT_ROOT)}`,
      ),
      "-c",
      this.shellQuote(
        `mcp_servers.mark2.env.MARK2_API_URL=${this.tomlQuote(mark2.env.MARK2_API_URL)}`,
      ),
    ];
  }

  /**
   * If a parent project is already trusted in ~/.codex/config.toml, propagate
   * that trust to the exact clone path so Codex doesn't prompt in tmux.
   */
  private ensureTrustedWorkingDirectory(workingDirectory: string): void {
    try {
      const configPath = path.join(os.homedir(), ".codex", "config.toml");
      const configDir = path.dirname(configPath);
      const normalizedWorkingDir = path.resolve(workingDirectory);

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const existing = fs.existsSync(configPath)
        ? fs.readFileSync(configPath, "utf-8")
        : "";
      const projectTrust = this.parseProjectTrust(existing);
      const exactTrust = projectTrust.get(normalizedWorkingDir);

      if (exactTrust) {
        return;
      }

      const inheritedTrusted = Array.from(projectTrust.entries()).some(
        ([projectPath, trustLevel]) =>
          trustLevel === "trusted" &&
          this.isSameOrDescendantPath(normalizedWorkingDir, projectPath),
      );

      if (!inheritedTrusted) {
        return;
      }

      const escapedPath = normalizedWorkingDir
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
      const prefix = existing.trim().length > 0 ? "\n\n" : "";
      fs.appendFileSync(
        configPath,
        `${prefix}[projects."${escapedPath}"]\ntrust_level = "trusted"\n`,
        "utf-8",
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(
        `[codex-cli] trust setup: failed to seed trusted clone path: ${message}`,
      );
    }
  }

  private parseProjectTrust(config: string): Map<string, string> {
    const trustByProject = new Map<string, string>();
    let currentProject: string | null = null;

    for (const rawLine of config.split(/\r?\n/)) {
      const line = rawLine.trim();
      const projectMatch = line.match(/^\[projects\."((?:\\.|[^"])*)"\]$/);
      if (projectMatch) {
        currentProject = projectMatch[1]
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
        continue;
      }

      if (line.startsWith("[") && line.endsWith("]")) {
        currentProject = null;
        continue;
      }

      const trustMatch = line.match(/^trust_level\s*=\s*"([^"]+)"$/);
      if (currentProject && trustMatch) {
        trustByProject.set(path.resolve(currentProject), trustMatch[1]);
      }
    }

    return trustByProject;
  }

  private isSameOrDescendantPath(
    childPath: string,
    parentPath: string,
  ): boolean {
    const normalizedParent = path.resolve(parentPath);
    return (
      childPath === normalizedParent ||
      childPath.startsWith(`${normalizedParent}${path.sep}`)
    );
  }

  /**
   * Remove configuration files created during buildCommand().
   * Best-effort: errors are logged but never thrown.
   */
  async cleanup(workingDirectory: string): Promise<void> {
    // 1. Delete .codex/mcp-config.json (created by setupMcpConfig)
    try {
      await fs.promises.unlink(
        path.join(workingDirectory, ".codex", "mcp-config.json"),
      );
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err ? err.code : null;
      if (code !== "ENOENT") {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          `[codex-cli] cleanup: failed to delete .codex/mcp-config.json: ${message}`,
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
