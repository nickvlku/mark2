import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db';
import { activityEntries } from '../db/schema';
import { TaskService } from './task-service';
import { ArtifactService } from './artifact-service';
import { CloneService } from './clone-service';
import { StoryService } from './story-service';
import { getMark2Dir } from '../utils/mark2-dir';
import type { Task, TaskArtifact } from '../yaml/schemas';

const exec = promisify(execCb);

export interface PRResult {
  success: boolean;
  url?: string;
  number?: number;
  error?: string;
}

export class PRService {
  private mark2Dir: string;
  private projectRoot: string;
  private taskService: TaskService;
  private artifactService: ArtifactService;
  private cloneService: CloneService;
  private storyService: StoryService;

  constructor(mark2Dir?: string) {
    this.mark2Dir = mark2Dir ?? getMark2Dir();
    this.projectRoot = path.dirname(this.mark2Dir);
    this.taskService = new TaskService(this.mark2Dir);
    this.artifactService = new ArtifactService(this.mark2Dir);
    this.cloneService = new CloneService(this.mark2Dir);
    this.storyService = new StoryService(this.mark2Dir);
  }

  /**
   * Create a GitHub PR for a completed task.
   */
  async createPR(taskId: string, targetBranch: string = 'main'): Promise<PRResult> {
    const task = this.taskService.getById(taskId);
    if (!task) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    const clonePath = this.cloneService.getClonePath(taskId);

    // Check if clone exists
    if (!this.cloneService.cloneExists(taskId)) {
      return { success: false, error: `Clone does not exist for ${taskId}` };
    }

    try {
      const branchName = await this.cloneService.getPublishBranchName(taskId);

      // Step 1: Get the GitHub remote URL from the main project
      // The clone's origin is file:// pointing to the local repo, so we need
      // to get the actual GitHub URL from the main project's origin
      const { stdout: githubUrl } = await exec(
        'git remote get-url origin',
        { cwd: this.projectRoot }
      );
      const remoteUrl = githubUrl.trim();

      if (!remoteUrl || remoteUrl.startsWith('file://')) {
        return { success: false, error: 'No GitHub remote configured in main project' };
      }

      // Step 2: Add/update a 'github' remote in the clone pointing to the actual GitHub repo
      try {
        await exec(`git -C "${clonePath}" remote add github "${remoteUrl}"`);
      } catch {
        // Remote might already exist, update it
        await exec(`git -C "${clonePath}" remote set-url github "${remoteUrl}"`);
      }

      // Step 3: Push the branch to GitHub
      await exec(`git -C "${clonePath}" push -u github "${branchName}" --force`);
      this.logActivity(taskId, `Pushed branch ${branchName} to GitHub`);

      // Step 4: Build the PR body and write to temp file
      // Using a file avoids shell escaping issues with newlines
      const prBody = await this.buildPRBody(task);
      const bodyFile = path.join(this.mark2Dir, `pr-body-${taskId}.md`);
      fs.writeFileSync(bodyFile, prBody, 'utf-8');

      // Step 5: Create the PR using gh CLI
      // Run from the project root so gh uses the correct repo context
      const prTitle = `${task.id}: ${task.title}`;

      try {
        const ghCommand = `gh pr create --base "${targetBranch}" --head "${branchName}" --title ${JSON.stringify(prTitle)} --body-file "${bodyFile}"`;
        const { stdout } = await exec(ghCommand, { cwd: this.projectRoot });
        const prUrl = stdout.trim();

        // Extract PR number from URL
        const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
        const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

        // Log the PR creation
        this.logActivity(taskId, `Created PR: ${prUrl}`);

        return {
          success: true,
          url: prUrl,
          number: prNumber,
        };
      } catch (prError: any) {
        // Check if PR already exists
        if (prError.message?.includes('already exists')) {
          // Try to get the existing PR URL
          try {
            const { stdout } = await exec(
              `gh pr view "${branchName}" --json url --jq .url`,
              { cwd: this.projectRoot }
            );
            const prUrl = stdout.trim();
            const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
            const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

            return {
              success: true,
              url: prUrl,
              number: prNumber,
            };
          } catch {
            return { success: false, error: 'PR already exists but could not retrieve URL' };
          }
        }
        throw prError;
      } finally {
        // Clean up temp file
        try {
          fs.unlinkSync(bodyFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Build the PR body with task info, activity summary, and artifacts.
   */
  async buildPRBody(task: Task): Promise<string> {
    const sections: string[] = [];

    // Task header
    sections.push(`## Task: ${task.id} - ${task.title}`);
    sections.push('');
    sections.push(task.description);
    sections.push('');

    // Story link if exists
    if (task.story_id) {
      const story = this.storyService.getById(task.story_id);
      if (story) {
        sections.push('### Story');
        sections.push(`**${story.id}**: ${story.title}`);
        sections.push('');
      }
    }

    // Artifacts
    const artifactsSection = await this.buildArtifactsSection(task.id);
    if (artifactsSection) {
      sections.push('### Artifacts');
      sections.push(artifactsSection);
      sections.push('');
    }

    // Footer
    sections.push('---');
    sections.push('Generated by mark2');

    return sections.join('\n');
  }

  /**
   * Build artifacts section with all artifacts listed chronologically.
   */
  private async buildArtifactsSection(taskId: string): Promise<string> {
    const artifacts = this.artifactService.getForTask(taskId);

    if (artifacts.length === 0) {
      return '';
    }

    // Sort chronologically (oldest first)
    const sorted = [...artifacts].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const sections: string[] = [];

    for (const artifact of sorted) {
      const content = this.getArtifactContent(taskId, artifact);
      if (content) {
        // Format title with phase and name
        const title = `[${artifact.phase}] ${artifact.name}`;
        sections.push(this.buildCollapsible(title, content));
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Get the content of an artifact file.
   */
  private getArtifactContent(taskId: string, artifact: TaskArtifact): string | null {
    const storagePath = path.join(this.mark2Dir, 'storage', taskId, 'artifacts', artifact.path);

    if (!fs.existsSync(storagePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(storagePath, 'utf-8');
      // Truncate very large content
      if (content.length > 10000) {
        return content.substring(0, 10000) + '\n\n... (truncated)';
      }
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Build a collapsible section for GitHub markdown.
   */
  private buildCollapsible(title: string, content: string): string {
    return `<details>
<summary>${title}</summary>

${content}

</details>`;
  }

  /**
   * Log activity for a task.
   */
  private logActivity(taskId: string, message: string): void {
    try {
      const db = getDb(this.mark2Dir);
      db.insert(activityEntries)
        .values({
          task_id: taskId,
          timestamp: new Date().toISOString(),
          source: 'pr-service',
          type: 'note',
          message,
        })
        .run();
    } catch {
      // Ignore logging errors
    }
  }
}
