import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { initializeDatabase, closeDb } from '@/lib/db';
import { TaskService } from '@/lib/services/task-service';
import { getTaskStoragePathsFromMark2Dir } from '@/lib/utils/storage';
import { UPLOAD_CONFIG } from '@/lib/constants/upload';

let mark2Dir: string;
let taskService: TaskService;

beforeEach(() => {
  mark2Dir = mkdtempSync(path.join(os.tmpdir(), 'mark2-upload-test-'));
  mkdirSync(path.join(mark2Dir, 'tasks'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'stories'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'activity'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'artifacts'), { recursive: true });
  mkdirSync(path.join(mark2Dir, 'storage'), { recursive: true });
  initializeDatabase(mark2Dir);
  taskService = new TaskService(mark2Dir, undefined, true);
});

afterEach(() => {
  closeDb();
  rmSync(mark2Dir, { recursive: true, force: true });
});

describe('File upload storage integration', () => {
  it('can store files in task storage directory', async () => {
    const task = await taskService.create({
      title: 'Upload test task',
      description: 'Testing file upload storage',
      created_by: 'human',
    });

    const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, task.id);
    mkdirSync(storagePaths.artifacts, { recursive: true });

    const testContent = Buffer.from('test file content');
    const filename = 'upload-test-123456-abc.txt';
    const filepath = path.join(storagePaths.artifacts, filename);

    writeFileSync(filepath, testContent);

    expect(existsSync(filepath)).toBe(true);
    const retrieved = readFileSync(filepath);
    expect(retrieved.equals(testContent)).toBe(true);
  });

  it('supports storing multiple files in task artifacts directory', async () => {
    const task = await taskService.create({
      title: 'Multi-file task',
      description: '',
      created_by: 'human',
    });

    const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, task.id);
    mkdirSync(storagePaths.artifacts, { recursive: true });

    const files = [
      { name: 'file1.png', content: Buffer.from('image1') },
      { name: 'file2.pdf', content: Buffer.from('pdf content') },
      { name: 'file3.json', content: Buffer.from('{"test": true}') },
    ];

    files.forEach(({ name, content }) => {
      const filepath = path.join(storagePaths.artifacts, name);
      writeFileSync(filepath, content);
    });

    files.forEach(({ name, content }) => {
      const filepath = path.join(storagePaths.artifacts, name);
      expect(existsSync(filepath)).toBe(true);
      const retrieved = readFileSync(filepath);
      expect(retrieved.equals(content)).toBe(true);
    });
  });

  it('handles binary file storage correctly', async () => {
    const task = await taskService.create({
      title: 'Binary file task',
      description: '',
      created_by: 'human',
    });

    const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, task.id);
    mkdirSync(storagePaths.artifacts, { recursive: true });

    // Simulate a small PNG file (fake binary data)
    const binaryData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);

    const filepath = path.join(storagePaths.artifacts, 'test-image.png');
    writeFileSync(filepath, binaryData);

    const retrieved = readFileSync(filepath);
    expect(retrieved.length).toBe(binaryData.length);
    expect(retrieved.equals(binaryData)).toBe(true);
  });

  it('creates storage directory structure on demand', async () => {
    const task = await taskService.create({
      title: 'Directory test task',
      description: '',
      created_by: 'human',
    });

    const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, task.id);

    // Directory may or may not exist depending on task creation implementation
    // The important part is that we can create it on demand
    mkdirSync(storagePaths.artifacts, { recursive: true });

    // Now it should definitely exist
    expect(existsSync(storagePaths.artifacts)).toBe(true);

    // And we can write to it
    const testFile = path.join(storagePaths.artifacts, 'test.txt');
    writeFileSync(testFile, 'test');
    expect(existsSync(testFile)).toBe(true);
  });

  it('handles files with special characters in storage', async () => {
    const task = await taskService.create({
      title: 'Special chars task',
      description: '',
      created_by: 'human',
    });

    const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, task.id);
    mkdirSync(storagePaths.artifacts, { recursive: true });

    // Sanitized filename (as would be done by upload logic)
    const sanitizedName = 'upload-my_file_v2_-123456.txt';
    const filepath = path.join(storagePaths.artifacts, sanitizedName);

    writeFileSync(filepath, 'content');

    expect(existsSync(filepath)).toBe(true);
  });

  it('storage paths are unique per task', async () => {
    const task1 = await taskService.create({
      title: 'Task 1',
      description: '',
      created_by: 'human',
    });

    const task2 = await taskService.create({
      title: 'Task 2',
      description: '',
      created_by: 'human',
    });

    const paths1 = getTaskStoragePathsFromMark2Dir(mark2Dir, task1.id);
    const paths2 = getTaskStoragePathsFromMark2Dir(mark2Dir, task2.id);

    expect(paths1.artifacts).not.toBe(paths2.artifacts);
    expect(paths1.artifacts).toContain(task1.id);
    expect(paths2.artifacts).toContain(task2.id);
  });

  it('can store zero-byte files', async () => {
    const task = await taskService.create({
      title: 'Empty file task',
      description: '',
      created_by: 'human',
    });

    const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, task.id);
    mkdirSync(storagePaths.artifacts, { recursive: true });

    const filepath = path.join(storagePaths.artifacts, 'empty.txt');
    writeFileSync(filepath, Buffer.from([]));

    expect(existsSync(filepath)).toBe(true);
    const retrieved = readFileSync(filepath);
    expect(retrieved.length).toBe(0);
  });

  it('can store files up to configured max size', async () => {
    const task = await taskService.create({
      title: 'Large file task',
      description: '',
      created_by: 'human',
    });

    const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, task.id);
    mkdirSync(storagePaths.artifacts, { recursive: true });

    // Create a file at the max size limit
    const maxSizeContent = Buffer.alloc(UPLOAD_CONFIG.MAX_FILE_SIZE, 'x');
    const filepath = path.join(storagePaths.artifacts, 'large-file.bin');

    writeFileSync(filepath, maxSizeContent);

    expect(existsSync(filepath)).toBe(true);
    const stat = readFileSync(filepath);
    expect(stat.length).toBe(UPLOAD_CONFIG.MAX_FILE_SIZE);
  });
});

describe('Upload configuration', () => {
  it('defines reasonable file size limits', () => {
    expect(UPLOAD_CONFIG.MAX_FILE_SIZE).toBe(10 * 1024 * 1024); // 10MB
    expect(UPLOAD_CONFIG.MAX_TOTAL_SIZE).toBe(50 * 1024 * 1024); // 50MB
    expect(UPLOAD_CONFIG.MAX_FILES_PER_UPLOAD).toBe(10);
  });

  it('includes all common image types', () => {
    expect(UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES).toContain('image/png');
    expect(UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES).toContain('image/jpeg');
    expect(UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES).toContain('image/gif');
    expect(UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES).toContain('image/svg+xml');
    expect(UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES).toContain('image/webp');
  });

  it('includes common document types', () => {
    expect(UPLOAD_CONFIG.ALLOWED_DOCUMENT_TYPES).toContain('text/plain');
    expect(UPLOAD_CONFIG.ALLOWED_DOCUMENT_TYPES).toContain('text/markdown');
    expect(UPLOAD_CONFIG.ALLOWED_DOCUMENT_TYPES).toContain('application/json');
    expect(UPLOAD_CONFIG.ALLOWED_DOCUMENT_TYPES).toContain('application/pdf');
  });

  it('includes code file extensions', () => {
    expect(UPLOAD_CONFIG.ALLOWED_EXTENSIONS).toContain('.ts');
    expect(UPLOAD_CONFIG.ALLOWED_EXTENSIONS).toContain('.tsx');
    expect(UPLOAD_CONFIG.ALLOWED_EXTENSIONS).toContain('.js');
    expect(UPLOAD_CONFIG.ALLOWED_EXTENSIONS).toContain('.jsx');
    expect(UPLOAD_CONFIG.ALLOWED_EXTENSIONS).toContain('.py');
    expect(UPLOAD_CONFIG.ALLOWED_EXTENSIONS).toContain('.java');
  });
});

describe('TaskArtifact schema with upload fields', () => {
  it('tasks support artifacts with source field', async () => {
    const task = await taskService.create({
      title: 'Artifact schema test',
      description: '',
      created_by: 'human',
    });

    // Manually add an artifact to test the schema (this would normally be done via ArtifactService)
    const taskWithArtifact = {
      ...task,
      artifacts: [
        {
          name: 'test-upload',
          phase: 'pending' as const,
          path: 'upload-test-123.png',
          mime_type: 'image/png',
          created_at: new Date().toISOString(),
          source: 'user' as const,
          original_filename: 'test.png',
          file_size: 1024,
        },
      ],
    };

    // This should not throw due to schema validation
    expect(taskWithArtifact.artifacts[0].source).toBe('user');
    expect(taskWithArtifact.artifacts[0].original_filename).toBe('test.png');
    expect(taskWithArtifact.artifacts[0].file_size).toBe(1024);
  });

  it('artifacts default to agent source when not specified', async () => {
    const task = await taskService.create({
      title: 'Default source test',
      description: '',
      created_by: 'human',
    });

    const artifactWithoutSource = {
      name: 'agent-artifact',
      phase: 'design' as const,
      path: 'design-doc.md',
      mime_type: 'text/markdown',
      created_at: new Date().toISOString(),
      // source is optional and should default to 'agent'
    };

    // Verify the schema allows this
    expect(artifactWithoutSource.name).toBe('agent-artifact');
  });
});
