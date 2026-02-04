import { getMark2Dir, getProjectRoot } from '../utils/mark2-dir';
import { TaskService } from './task-service';
import { StoryService } from './story-service';
import { ActivityService } from './activity-service';
import { ArtifactService } from './artifact-service';
import { CloneService } from './clone-service';
import { ConfigService } from './config-service';
import { PortService } from './port-service';
import { WorktreeService } from './worktree-service';
import { PRService } from './pr-service';
import { MergeService } from './merge-service';
import { StateBranchService } from './state-branch-service';
import { EnhanceService } from './enhance-service';
import path from 'path';

/**
 * Service factory that creates service instances with the correct mark2Dir.
 * Uses getMark2Dir() to resolve the directory following priority:
 * 1. MARK2_DIR environment variable
 * 2. Find .mark2 by traversing up from cwd
 * 3. Default to cwd/.mark2
 */
export function createServices(mark2DirOverride?: string) {
  const mark2Dir = mark2DirOverride ?? getMark2Dir();
  const projectRoot = path.dirname(mark2Dir);

  const stateBranch = new StateBranchService(mark2Dir);

  return {
    task: new TaskService(mark2Dir, stateBranch),
    story: new StoryService(mark2Dir, stateBranch),
    activity: new ActivityService(mark2Dir, stateBranch),
    artifact: new ArtifactService(mark2Dir),
    clone: new CloneService(mark2Dir),
    config: new ConfigService(mark2Dir),
    port: new PortService(mark2Dir),
    worktree: new WorktreeService(mark2Dir),
    pr: new PRService(mark2Dir),
    merge: new MergeService(projectRoot, mark2Dir),
    stateBranch,
    mark2Dir,
    projectRoot,
  };
}

export type Services = ReturnType<typeof createServices>;

// Convenience functions for creating individual services
export function createTaskService(mark2Dir?: string) {
  return new TaskService(mark2Dir ?? getMark2Dir());
}

export function createStoryService(mark2Dir?: string) {
  return new StoryService(mark2Dir ?? getMark2Dir());
}

export function createActivityService(mark2Dir?: string) {
  return new ActivityService(mark2Dir ?? getMark2Dir());
}

export function createArtifactService(mark2Dir?: string) {
  return new ArtifactService(mark2Dir ?? getMark2Dir());
}

export function createCloneService(mark2Dir?: string) {
  return new CloneService(mark2Dir ?? getMark2Dir());
}

export function createConfigService(mark2Dir?: string) {
  return new ConfigService(mark2Dir ?? getMark2Dir());
}

export function createPortService(mark2Dir?: string) {
  return new PortService(mark2Dir ?? getMark2Dir());
}

export function createWorktreeService(mark2Dir?: string) {
  return new WorktreeService(mark2Dir ?? getMark2Dir());
}

export function createPRService(mark2Dir?: string) {
  return new PRService(mark2Dir ?? getMark2Dir());
}

export function createMergeService(projectRoot?: string, mark2Dir?: string) {
  const resolvedMark2Dir = mark2Dir ?? getMark2Dir();
  const resolvedProjectRoot = projectRoot ?? path.dirname(resolvedMark2Dir);
  return new MergeService(resolvedProjectRoot, resolvedMark2Dir);
}

export function createStateBranchService(mark2Dir?: string) {
  return new StateBranchService(mark2Dir ?? getMark2Dir());
}

export function createEnhanceService(mark2Dir?: string) {
  const configService = createConfigService(mark2Dir);
  return new EnhanceService(configService);
}
