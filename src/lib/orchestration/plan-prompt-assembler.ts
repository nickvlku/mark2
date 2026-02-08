import fs from 'fs';
import path from 'path';
import type { Plan, PlanPhase } from '../yaml/schemas';
import { PLAN_END_TOKENS } from './plan-pipeline';

export interface PlanPromptParts {
  orchestrationPrompt: string;
  agentPrompt: string;
  taskPrompt: string;
  agentName: string;
}

/**
 * Build prompts for plan agents. Similar to PromptAssembler but simplified
 * for plan phases (no clones, worktrees, git operations).
 */
export class PlanPromptAssembler {
  private mark2Dir: string;

  constructor(mark2Dir: string) {
    this.mark2Dir = mark2Dir;
  }

  buildPrompts(
    plan: Plan,
    rolePrompt: string,
    roleName: string,
    phase: PlanPhase,
    feedback?: string,
    priorArtifacts?: { name: string; content: string }[],
  ): PlanPromptParts {
    const orchestrationPrompt = this.buildOrchestrationPrompt(plan, phase, feedback);
    const agentPrompt = rolePrompt;
    const taskPrompt = this.buildTaskPrompt(plan, phase, priorArtifacts);
    const agentName = roleName;

    return { orchestrationPrompt, agentPrompt, taskPrompt, agentName };
  }

  private buildOrchestrationPrompt(plan: Plan, phase: PlanPhase, feedback?: string): string {
    const parts: string[] = [];

    parts.push(`# Plan Orchestration Instructions`);
    parts.push('');
    parts.push(`You are working on plan ${plan.id}: "${plan.title}"`);
    parts.push(`Current phase: ${phase}`);
    parts.push('');

    // Phase-specific instructions
    switch (phase) {
      case 'prd':
        parts.push(`## Your Task: Generate a Product Requirements Document (PRD)`);
        parts.push('');
        parts.push('Based on the user\'s prompt, produce a structured PRD covering:');
        parts.push('- **Goals**: What this feature aims to achieve');
        parts.push('- **Non-Goals**: What is explicitly out of scope');
        parts.push('- **Requirements**: Detailed functional requirements');
        parts.push('- **Use Cases**: Key user scenarios');
        parts.push('- **Risks & Mitigations**: Potential issues and how to handle them');
        parts.push('');
        parts.push('You may ask the user clarifying questions if needed — they can interact with you in this terminal.');
        break;

      case 'tech_spec':
        parts.push(`## Your Task: Generate a Technical Specification`);
        parts.push('');
        parts.push('Based on the PRD, produce a technical specification covering:');
        parts.push('- **Architecture**: High-level system design');
        parts.push('- **Data Models**: Schema definitions and relationships');
        parts.push('- **API Design**: Endpoints, request/response formats');
        parts.push('- **File Changes**: List of files to create/modify with descriptions');
        parts.push('- **Dependencies**: New libraries or services needed');
        parts.push('- **Testing Strategy**: How to verify the implementation');
        parts.push('');
        parts.push('Analyze the existing codebase to understand patterns and conventions.');
        parts.push('The tech spec should be detailed enough that a developer can implement from it.');
        break;

      case 'task_generation':
        parts.push(`## Your Task: Break Down into Stories and Tasks`);
        parts.push('');
        parts.push('Based on the PRD and tech spec, break the work into stories and tasks.');
        parts.push('');
        parts.push('Output a JSON structure with this format:');
        parts.push('```json');
        parts.push('{');
        parts.push('  "project_prefix": "Short Project Name",');
        parts.push('  "stories": [');
        parts.push('    {');
        parts.push('      "title": "Story title",');
        parts.push('      "description": "What this story delivers",');
        parts.push('      "tasks": [');
        parts.push('        {');
        parts.push('          "title": "Task title",');
        parts.push('          "description": "Detailed task description",');
        parts.push('          "priority": "P2",');
        parts.push('          "blockers": []');
        parts.push('        }');
        parts.push('      ]');
        parts.push('    }');
        parts.push('  ]');
        parts.push('}');
        parts.push('```');
        parts.push('');
        parts.push('Guidelines:');
        parts.push('- project_prefix: A concise 2-4 word project name (e.g., "Codex Integration" for a plan titled "Add Codex integration alongside Claude Code"). This will prefix all story titles.');
        parts.push('- Each task should be ~1-2 hours of work');
        parts.push('- Use blockers array with integer indices within the story (e.g., [0] means blocked by task at index 0)');
        parts.push('- For cross-story blockers, use "storyIndex:taskIndex" format (e.g., "0:2")');
        parts.push('- Group related tasks into stories');
        parts.push('- Order tasks by dependency (blockers should come first)');
        break;
    }

    // Artifact instructions
    parts.push('');
    parts.push('## Saving Artifacts');
    parts.push('');
    parts.push('Use the `mark2_save_plan_artifact` MCP tool to save your output:');

    if (phase === 'prd') {
      parts.push('- Save the PRD as `prd.md`');
    } else if (phase === 'tech_spec') {
      parts.push('- Save the tech spec as `tech-spec.md`');
    } else if (phase === 'task_generation') {
      parts.push('- Save the task proposal as `task-proposal.json`');
    }

    // End token instructions
    const endTokens = PLAN_END_TOKENS[phase];
    if (endTokens && endTokens.length > 0) {
      parts.push('');
      parts.push('## Signaling Completion');
      parts.push('');
      parts.push(`When you are done, use the \`mark2_signal_plan_complete\` MCP tool with token: \`${endTokens[0]}\``);
    }

    // Feedback from revision
    if (feedback) {
      parts.push('');
      parts.push('## Revision Feedback');
      parts.push('');
      parts.push('The user has requested revisions with the following feedback:');
      parts.push('');
      parts.push(feedback);
    }

    return parts.join('\n');
  }

  private buildTaskPrompt(
    plan: Plan,
    phase: PlanPhase,
    priorArtifacts?: { name: string; content: string }[],
  ): string {
    const parts: string[] = [];

    parts.push(`# ${plan.title}`);
    parts.push('');
    parts.push('## Original Prompt');
    parts.push('');
    parts.push(plan.prompt);

    // Include prior artifacts as context
    if (priorArtifacts && priorArtifacts.length > 0) {
      parts.push('');
      parts.push('## Prior Artifacts');
      for (const artifact of priorArtifacts) {
        parts.push('');
        parts.push(`### ${artifact.name}`);
        parts.push('');
        parts.push(artifact.content);
      }
    }

    return parts.join('\n');
  }
}
