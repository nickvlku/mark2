import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { Task, Story } from '@/types';
import { ConfigService } from './config-service';

export interface EnhanceConfig {
  role: string;
  cli_tool: string;
  model: string;
  timeout_minutes: number;
}

export class EnhanceService {
  private configService: ConfigService;

  constructor(configService: ConfigService) {
    this.configService = configService;
  }

  async enhanceTask(task: Task, overrides?: Partial<EnhanceConfig>): Promise<{
    enhanced_title: string;
    enhanced_description: string;
  }> {
    return this.enhance(
      task.title,
      task.description,
      'task',
      overrides
    );
  }

  async enhanceStory(story: Story, overrides?: Partial<EnhanceConfig>): Promise<{
    enhanced_title: string;
    enhanced_description: string;
  }> {
    return this.enhance(
      story.title,
      story.description,
      'story',
      overrides
    );
  }

  private async enhance(
    title: string,
    description: string,
    entityType: 'task' | 'story',
    overrides?: Partial<EnhanceConfig>
  ): Promise<{
    enhanced_title: string;
    enhanced_description: string;
  }> {
    const config = this.configService.get();
    const enhanceConfig = {
      role: overrides?.role ?? config.enhance_config?.role ?? 'task-enhancer',
      cli_tool: overrides?.cli_tool ?? config.enhance_config?.cli_tool ?? 'claude-code',
      model: overrides?.model ?? config.enhance_config?.model ?? 'claude-sonnet-4-5',
      timeout_minutes: overrides?.timeout_minutes ?? config.enhance_config?.timeout_minutes ?? 30,
    };

    const role = this.configService.getRoleByName(enhanceConfig.role);
    if (!role) {
      throw new Error(`Role "${enhanceConfig.role}" not found. Please configure the enhancement role.`);
    }

    const prompt = this.buildPrompt(title, description, entityType, role.role_prompt);
    const result = await this.invokeAgent(prompt, enhanceConfig);

    return this.parseResult(result);
  }

  private buildPrompt(
    title: string,
    description: string,
    entityType: 'task' | 'story',
    rolePrompt: string
  ): string {
    return `${rolePrompt}

---

Current ${entityType}:

Title: ${title}

Description:
${description || '(no description provided)'}

---

Please enhance this ${entityType}. Remember to output ONLY valid JSON with enhanced_title and enhanced_description fields.`;
  }

  private async invokeAgent(
    prompt: string,
    config: { cli_tool: string; model: string; timeout_minutes: number }
  ): Promise<string> {
    // Only claude-code is supported for now
    if (config.cli_tool !== 'claude-code') {
      throw new Error(`CLI tool "${config.cli_tool}" is not supported for enhancement. Please use "claude-code".`);
    }

    // Create a temporary directory for the agent to work in
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark2-enhance-'));

    try {
      // Write prompt to a file to avoid shell escaping issues
      const promptFile = path.join(tempDir, 'prompt.txt');
      fs.writeFileSync(promptFile, prompt, 'utf-8');

      // Build Claude Code command - use --print for non-interactive output
      const timeoutMs = config.timeout_minutes * 60 * 1000;
      const command = `claude --print --model ${config.model} --dangerously-skip-permissions < "${promptFile}"`;

      // Execute the command using system default shell for cross-platform compatibility
      const result = execSync(command, {
        cwd: tempDir,
        timeout: timeoutMs,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        shell: process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh',
      });

      if (!result || result.trim() === '') {
        throw new Error('AI_ERROR: Empty response from Claude');
      }

      return result;
    } catch (error: any) {
      if (error.killed) {
        throw new Error('TIMEOUT: Enhancement request timed out');
      }
      throw new Error(`AI_ERROR: ${error.message}`);
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private parseResult(result: string): {
    enhanced_title: string;
    enhanced_description: string;
  } {
    // Try multiple extraction strategies

    // Strategy 1: JSON in markdown code block
    const codeBlockMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        if (parsed.enhanced_title && parsed.enhanced_description) {
          return {
            enhanced_title: String(parsed.enhanced_title).slice(0, 200),
            enhanced_description: String(parsed.enhanced_description),
          };
        }
      } catch {
        // Continue to next strategy
      }
    }

    // Strategy 2: Find JSON object with balanced braces
    const jsonObjects = this.extractJsonObjects(result);
    for (const jsonStr of jsonObjects) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.enhanced_title && parsed.enhanced_description) {
          return {
            enhanced_title: String(parsed.enhanced_title).slice(0, 200),
            enhanced_description: String(parsed.enhanced_description),
          };
        }
      } catch {
        // Try next object
      }
    }

    // Strategy 3: Look for the fields individually as a last resort
    const titleMatch = result.match(/"enhanced_title"\s*:\s*"([^"]+)"/);
    const descMatch = result.match(/"enhanced_description"\s*:\s*"([\s\S]*?)(?:"\s*[,}])/);
    if (titleMatch && descMatch) {
      return {
        enhanced_title: titleMatch[1].slice(0, 200),
        enhanced_description: descMatch[1],
      };
    }

    throw new Error('PARSE_ERROR: Could not find JSON in AI response');
  }

  /**
   * Extracts potential JSON objects from text using brace counting.
   *
   * Note: This is a simple extraction method that doesn't handle braces inside
   * JSON string values (e.g., `{"text": "use {templates} here"}`). However, this
   * is mitigated because:
   * 1. Strategy 1 (code block extraction) handles well-formatted responses correctly
   * 2. All extracted candidates are validated with JSON.parse() which rejects invalid JSON
   * 3. This serves as a fallback for responses that aren't in code blocks
   */
  private extractJsonObjects(text: string): string[] {
    const objects: string[] = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          objects.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }

    return objects;
  }
}
