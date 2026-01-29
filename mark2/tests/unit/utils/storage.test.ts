import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getTaskStoragePaths,
  getTaskStoragePathsFromMark2Dir,
  ensureTaskStorageExists,
  ensureTaskStorageExistsSync,
  resolveArtifactPath,
  resolveArtifactPathFromMark2Dir,
  fileExists,
  fileExistsSync,
  migrateArtifact,
  getWorktreePath,
  getStorageStats,
} from '@/lib/utils/storage';

describe('storage utilities', () => {
  let tempDir: string;
  let projectRoot: string;
  let mark2Dir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark2-storage-test-'));
    projectRoot = tempDir;
    mark2Dir = path.join(projectRoot, '.mark2');
    fs.mkdirSync(mark2Dir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getTaskStoragePaths', () => {
    it('returns correct paths for a task', () => {
      const paths = getTaskStoragePaths(projectRoot, 'TASK-1');

      expect(paths.root).toBe(path.join(projectRoot, '.mark2', 'storage', 'TASK-1'));
      expect(paths.prompts).toBe(path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'prompts'));
      expect(paths.artifacts).toBe(path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'artifacts'));
      expect(paths.sessions).toBe(path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'sessions'));
      expect(paths.testRuns).toBe(path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'test-runs'));
      expect(paths.playwrightReports).toBe(path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'playwright-reports'));
    });

    it('handles different task IDs', () => {
      const paths1 = getTaskStoragePaths(projectRoot, 'TASK-123');
      const paths2 = getTaskStoragePaths(projectRoot, 'MY-TASK-456');

      expect(paths1.root).toContain('TASK-123');
      expect(paths2.root).toContain('MY-TASK-456');
    });
  });

  describe('getTaskStoragePathsFromMark2Dir', () => {
    it('derives project root from mark2Dir', () => {
      const paths = getTaskStoragePathsFromMark2Dir(mark2Dir, 'TASK-1');

      expect(paths.root).toBe(path.join(projectRoot, '.mark2', 'storage', 'TASK-1'));
    });
  });

  describe('ensureTaskStorageExists', () => {
    it('creates all storage directories', async () => {
      await ensureTaskStorageExists(projectRoot, 'TASK-1');

      const paths = getTaskStoragePaths(projectRoot, 'TASK-1');
      expect(fs.existsSync(paths.root)).toBe(true);
      expect(fs.existsSync(paths.prompts)).toBe(true);
      expect(fs.existsSync(paths.artifacts)).toBe(true);
      expect(fs.existsSync(paths.sessions)).toBe(true);
      expect(fs.existsSync(paths.testRuns)).toBe(true);
      expect(fs.existsSync(paths.playwrightReports)).toBe(true);
    });

    it('is idempotent', async () => {
      await ensureTaskStorageExists(projectRoot, 'TASK-1');
      await ensureTaskStorageExists(projectRoot, 'TASK-1');

      const paths = getTaskStoragePaths(projectRoot, 'TASK-1');
      expect(fs.existsSync(paths.root)).toBe(true);
    });
  });

  describe('ensureTaskStorageExistsSync', () => {
    it('creates all storage directories synchronously', () => {
      ensureTaskStorageExistsSync(projectRoot, 'TASK-2');

      const paths = getTaskStoragePaths(projectRoot, 'TASK-2');
      expect(fs.existsSync(paths.root)).toBe(true);
      expect(fs.existsSync(paths.prompts)).toBe(true);
      expect(fs.existsSync(paths.artifacts)).toBe(true);
    });
  });

  describe('resolveArtifactPath', () => {
    it('prefixes bare filenames with artifacts/', () => {
      const resolved = resolveArtifactPath(projectRoot, 'TASK-1', 'design.md');

      expect(resolved).toBe(
        path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'artifacts', 'design.md')
      );
    });

    it('preserves artifacts/ prefix', () => {
      const resolved = resolveArtifactPath(projectRoot, 'TASK-1', 'artifacts/design.md');

      expect(resolved).toBe(
        path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'artifacts', 'design.md')
      );
    });

    it('preserves prompts/ prefix', () => {
      const resolved = resolveArtifactPath(projectRoot, 'TASK-1', 'prompts/coding.md');

      expect(resolved).toBe(
        path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'prompts', 'coding.md')
      );
    });

    it('preserves sessions/ prefix', () => {
      const resolved = resolveArtifactPath(projectRoot, 'TASK-1', 'sessions/design-final.log.gz');

      expect(resolved).toBe(
        path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'sessions', 'design-final.log.gz')
      );
    });

    it('handles backslashes on Windows', () => {
      const resolved = resolveArtifactPath(projectRoot, 'TASK-1', 'artifacts\\design.md');

      // Should normalize to forward slashes and resolve correctly
      expect(resolved).toBe(
        path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'artifacts', 'design.md')
      );
    });
  });

  describe('resolveArtifactPathFromMark2Dir', () => {
    it('resolves using mark2Dir', () => {
      const resolved = resolveArtifactPathFromMark2Dir(mark2Dir, 'TASK-1', 'design.md');

      expect(resolved).toBe(
        path.join(projectRoot, '.mark2', 'storage', 'TASK-1', 'artifacts', 'design.md')
      );
    });
  });

  describe('fileExists', () => {
    it('returns true for existing file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'content');

      expect(await fileExists(filePath)).toBe(true);
    });

    it('returns false for non-existing file', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');

      expect(await fileExists(filePath)).toBe(false);
    });
  });

  describe('fileExistsSync', () => {
    it('returns true for existing file', () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'content');

      expect(fileExistsSync(filePath)).toBe(true);
    });

    it('returns false for non-existing file', () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');

      expect(fileExistsSync(filePath)).toBe(false);
    });
  });

  describe('migrateArtifact', () => {
    it('copies artifact from worktree to storage', async () => {
      // Create a worktree with an artifact
      const worktreePath = path.join(tempDir, '.worktrees', 'TASK-1', 'design');
      fs.mkdirSync(worktreePath, { recursive: true });
      const sourceFile = path.join(worktreePath, 'design.md');
      fs.writeFileSync(sourceFile, '# Design Document');

      // Migrate the artifact
      const newPath = await migrateArtifact(
        projectRoot,
        'TASK-1',
        worktreePath,
        'design.md'
      );

      expect(newPath).not.toBeNull();
      expect(fs.existsSync(newPath!)).toBe(true);
      expect(fs.readFileSync(newPath!, 'utf-8')).toBe('# Design Document');
    });

    it('returns null if source does not exist', async () => {
      const worktreePath = path.join(tempDir, '.worktrees', 'TASK-1', 'design');
      fs.mkdirSync(worktreePath, { recursive: true });

      const result = await migrateArtifact(
        projectRoot,
        'TASK-1',
        worktreePath,
        'nonexistent.md'
      );

      expect(result).toBeNull();
    });
  });

  describe('getWorktreePath', () => {
    it('returns correct worktree path', () => {
      const worktreePath = getWorktreePath(projectRoot, 'TASK-1', 'design');

      expect(worktreePath).toBe(
        path.join(projectRoot, '.worktrees', 'TASK-1', 'design')
      );
    });
  });

  describe('getStorageStats', () => {
    it('returns zero stats for empty storage', async () => {
      await ensureTaskStorageExists(projectRoot, 'TASK-1');

      const stats = await getStorageStats(projectRoot, 'TASK-1');

      expect(stats.totalSize).toBe(0);
      expect(stats.fileCount).toBe(0);
    });

    it('calculates correct stats with files', async () => {
      await ensureTaskStorageExists(projectRoot, 'TASK-1');
      const paths = getTaskStoragePaths(projectRoot, 'TASK-1');

      // Write some files
      fs.writeFileSync(path.join(paths.artifacts, 'design.md'), '# Design');
      fs.writeFileSync(path.join(paths.prompts, 'coding.md'), '# Coding Prompt');

      const stats = await getStorageStats(projectRoot, 'TASK-1');

      expect(stats.fileCount).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.artifactsSize).toBeGreaterThan(0);
      expect(stats.promptsSize).toBeGreaterThan(0);
    });
  });
});
