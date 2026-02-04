'use client';

import { useState } from 'react';
import type { TaskArtifact } from '@/types';
import { formatFileSize } from '@/lib/utils/upload';

interface ImagePreviewProps {
  artifact: TaskArtifact;
  taskId: string;
  maxHeight?: number;
}

export function ImagePreview({ artifact, taskId, maxHeight = 400 }: ImagePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const imageUrl = `/api/tasks/${taskId}/artifacts?path=${encodeURIComponent(artifact.path)}`;

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
    setImageError(true);
  };

  if (imageError) {
    return (
      <div className="flex items-center justify-center py-8 px-4 bg-bg-secondary rounded-lg border border-border">
        <div className="text-center">
          <svg
            className="h-12 w-12 mx-auto mb-2 text-text-secondary opacity-30"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
            />
          </svg>
          <p className="text-sm text-text-secondary">Failed to load image</p>
          <p className="text-xs text-text-secondary mt-1">{artifact.original_filename || artifact.name}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary rounded-lg">
            <svg
              className="h-8 w-8 text-accent-blue animate-spin"
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
          </div>
        )}

        <img
          src={imageUrl}
          alt={artifact.original_filename || artifact.name}
          onLoad={handleImageLoad}
          onError={handleImageError}
          onClick={() => setIsExpanded(true)}
          style={{ maxHeight: `${maxHeight}px` }}
          className="w-auto h-auto max-w-full rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
        />

        {artifact.file_size && (
          <div className="mt-2 text-xs text-text-secondary">
            {artifact.original_filename || artifact.name} • {formatFileSize(artifact.file_size)}
          </div>
        )}
      </div>

      {/* Lightbox modal */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsExpanded(false)}
        >
          <button
            onClick={() => setIsExpanded(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-bg-primary/80 hover:bg-bg-primary transition-colors"
          >
            <svg
              className="h-6 w-6 text-text-primary"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          <img
            src={imageUrl}
            alt={artifact.original_filename || artifact.name}
            className="max-h-[90vh] max-w-[90vw] rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
