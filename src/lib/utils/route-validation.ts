/**
 * Route parameter validation for task and story IDs.
 * Used by API routes that use [id] in paths or shell commands to prevent
 * path traversal and command injection.
 */

export const TASK_ID_REGEX = /^TASK-\d+$/;
export const STORY_ID_REGEX = /^STORY-\d+$/;

export function isValidTaskId(id: string): boolean {
  return typeof id === 'string' && TASK_ID_REGEX.test(id);
}

export function isValidStoryId(id: string): boolean {
  return typeof id === 'string' && STORY_ID_REGEX.test(id);
}
