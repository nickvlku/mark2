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
      // Create a prompt file
      const promptFile = path.join(tempDir, 'prompt.txt');
      fs.writeFileSync(promptFile, prompt, 'utf-8');

      // Build Claude Code command
      const timeoutMs = config.timeout_minutes * 60 * 1000;
      const command = `claude "${prompt}" --model ${config.model} --dangerously-skip-permissions`;

      // Execute the command
      const result = execSync(command, {
        cwd: tempDir,
        timeout: timeoutMs,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

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
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = result.match(/```json\n?([\s\S]*?)\n?```/)
      || result.match(/\{[\s\S]*"enhanced_title"[\s\S]*"enhanced_description"[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('PARSE_ERROR: Could not find JSON in AI response');
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];

    try {
      const parsed = JSON.parse(jsonStr);

      if (!parsed.enhanced_title || !parsed.enhanced_description) {
        throw new Error('PARSE_ERROR: Missing required fields in response');
      }

      return {
        enhanced_title: String(parsed.enhanced_title).slice(0, 200), // Enforce max length
        enhanced_description: String(parsed.enhanced_description),
      };
    } catch (error: any) {
      throw new Error(`PARSE_ERROR: Invalid JSON in response - ${error.message}`);
    }
  }
}
