import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { createArtifactService, createTaskService } from '@/lib/services/factory';
import { getMark2Dir } from '@/lib/utils/mark2-dir';
import { getTaskStoragePathsFromMark2Dir } from '@/lib/utils/storage';
import { isValidTaskId } from '@/lib/utils/route-validation';
import { UPLOAD_CONFIG } from '@/lib/constants/upload';
import { validateFileUpload, sanitizeFilename, getMimeType, formatFileSize } from '@/lib/utils/upload';
import type { TaskArtifact, Phase } from '@/lib/yaml/schemas';
import type { UploadError } from '@/lib/utils/upload';

interface UploadResponse {
  success: boolean;
  artifacts: TaskArtifact[];
  errors?: UploadError[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    if (!isValidTaskId(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const taskService = createTaskService();
    const task = taskService.getById(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const phaseParam = formData.get('phase')?.toString();
    const phase: Phase = (phaseParam as Phase) || task.phase || 'pending';

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length > UPLOAD_CONFIG.MAX_FILES_PER_UPLOAD) {
      return NextResponse.json({
        error: `Maximum ${UPLOAD_CONFIG.MAX_FILES_PER_UPLOAD} files allowed per upload`
      }, { status: 400 });
    }

    // Validate total upload size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > UPLOAD_CONFIG.MAX_TOTAL_SIZE) {
      return NextResponse.json({
        error: `Total upload size exceeds ${formatFileSize(UPLOAD_CONFIG.MAX_TOTAL_SIZE)} limit`
      }, { status: 400 });
    }

    const mark2Dir = getMark2Dir();
    const storagePaths = getTaskStoragePathsFromMark2Dir(mark2Dir, taskId);
    const artifactService = createArtifactService();

    // Ensure artifacts directory exists
    await mkdir(storagePaths.artifacts, { recursive: true });

    const artifacts: TaskArtifact[] = [];
    const errors: UploadError[] = [];

    for (const file of files) {
      const validation = validateFileUpload(file);
      if (!validation.valid) {
        errors.push({
          filename: file.name,
          error: validation.error!,
          code: validation.code!,
        });
        continue;
      }

      try {
        // Generate unique filename
        const sanitized = sanitizeFilename(file.name);
        const ext = path.extname(sanitized);
        const base = path.basename(sanitized, ext);
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const uniqueFilename = `upload-${base}-${timestamp}-${random}${ext}`;

        // Write file
        const buffer = Buffer.from(await file.arrayBuffer());
        const filepath = path.join(storagePaths.artifacts, uniqueFilename);
        await writeFile(filepath, buffer);

        // Register artifact
        const artifact = artifactService.reportUpload(taskId, {
          name: base,
          phase,
          path: uniqueFilename,
          mime_type: getMimeType(file),
          source: 'user',
          original_filename: file.name,
          file_size: file.size,
        });

        artifacts.push(artifact);
      } catch (err) {
        errors.push({
          filename: file.name,
          error: 'Failed to save file',
          code: 'WRITE_FAILED',
        });
      }
    }

    const response: UploadResponse = {
      success: errors.length === 0,
      artifacts,
      errors: errors.length > 0 ? errors : undefined,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to upload files' },
      { status: 500 },
    );
  }
}
