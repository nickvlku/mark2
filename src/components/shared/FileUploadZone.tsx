'use client';

import { useState, useRef, useCallback } from 'react';
import type { TaskArtifact } from '@/types';
import { formatFileSize } from '@/lib/utils/upload';

interface FileUploadZoneProps {
  taskId: string;
  onUploadComplete?: (artifacts: TaskArtifact[]) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

interface UploadingFile {
  file: File;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

export function FileUploadZone({
  taskId,
  onUploadComplete,
  onError,
  disabled = false,
  className = '',
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setUploadingFiles(
      fileArray.map((file) => ({
        file,
        status: 'uploading',
      }))
    );

    const formData = new FormData();
    fileArray.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const res = await fetch(`/api/tasks/${taskId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      // Update status for each file
      setUploadingFiles((prev) =>
        prev.map((uf) => {
          const error = data.errors?.find((e: any) => e.filename === uf.file.name);
          if (error) {
            return { ...uf, status: 'error', error: error.error };
          }
          return { ...uf, status: 'success' };
        })
      );

      // Notify success
      if (data.artifacts && data.artifacts.length > 0) {
        onUploadComplete?.(data.artifacts);
      }

      // Show errors if any
      if (data.errors && data.errors.length > 0) {
        const errorMessages = data.errors.map((e: any) => `${e.filename}: ${e.error}`).join(', ');
        onError?.(errorMessages);
      }

      // Clear after a delay
      setTimeout(() => {
        setUploadingFiles([]);
      }, 2000);
    } catch (error: any) {
      setUploadingFiles((prev) =>
        prev.map((uf) => ({ ...uf, status: 'error', error: error.message }))
      );
      onError?.(error.message || 'Failed to upload files');

      setTimeout(() => {
        setUploadingFiles([]);
      }, 3000);
    }
  }, [taskId, onUploadComplete, onError]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const { files } = e.dataTransfer;
    handleFiles(files);
  }, [disabled, handleFiles]);

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFiles]);

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
        accept=".png,.jpg,.jpeg,.gif,.svg,.webp,.txt,.md,.json,.pdf,.csv,.html,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.yaml,.yml,.sh,.rb,.go,.rs,.swift,.kt,.sql,.xml,.toml"
      />

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative rounded-lg border-2 border-dashed transition-all cursor-pointer
          ${isDragging
            ? 'border-accent-blue bg-accent-blue/10 scale-[1.02]'
            : 'border-border hover:border-accent-blue/50 hover:bg-bg-hover'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <div className="px-6 py-8 text-center">
          <svg
            className={`mx-auto h-12 w-12 mb-3 transition-colors ${
              isDragging ? 'text-accent-blue' : 'text-text-secondary'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>

          <p className="text-sm font-medium text-text-primary mb-1">
            {isDragging ? 'Drop files here' : 'Drag and drop files here'}
          </p>
          <p className="text-xs text-text-secondary mb-2">
            or click to browse
          </p>

          <div className="text-xs text-text-secondary space-y-1">
            <p>Supports: Images, documents, code files</p>
            <p>Max: 10MB per file, 10 files per upload</p>
          </div>
        </div>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploadingFiles.map((uf, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-secondary border border-border"
            >
              {uf.status === 'uploading' && (
                <svg
                  className="h-4 w-4 text-accent-blue animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {uf.status === 'success' && (
                <svg
                  className="h-4 w-4 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              )}
              {uf.status === 'error' && (
                <svg
                  className="h-4 w-4 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{uf.file.name}</p>
                <p className="text-xs text-text-secondary">
                  {formatFileSize(uf.file.size)}
                </p>
              </div>

              {uf.error && (
                <p className="text-xs text-red-500">{uf.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
