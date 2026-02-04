/**
 * Upload validation and utility functions
 */

import { UPLOAD_CONFIG } from '../constants/upload';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: 'SIZE_EXCEEDED' | 'INVALID_TYPE' | 'VALIDATION_FAILED';
}

export interface UploadError {
  filename: string;
  error: string;
  code: 'SIZE_EXCEEDED' | 'INVALID_TYPE' | 'WRITE_FAILED' | 'VALIDATION_FAILED';
}

/**
 * Validate a file for upload based on size and type
 */
export function validateFileUpload(file: File): ValidationResult {
  // Size check
  if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File exceeds maximum size of ${formatFileSize(UPLOAD_CONFIG.MAX_FILE_SIZE)}`,
      code: 'SIZE_EXCEEDED',
    };
  }

  // Type check - by MIME type
  const allAllowedTypes = [
    ...UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES,
    ...UPLOAD_CONFIG.ALLOWED_DOCUMENT_TYPES,
    ...UPLOAD_CONFIG.ALLOWED_CODE_TYPES,
  ];

  if (file.type && (allAllowedTypes as readonly string[]).includes(file.type)) {
    return { valid: true };
  }

  // Fallback: check by extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if ((UPLOAD_CONFIG.ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: 'File type not supported',
    code: 'INVALID_TYPE',
  };
}

/**
 * Sanitize a filename to remove problematic characters and prevent path traversal
 */
export function sanitizeFilename(filename: string): string {
  // Remove path components (security)
  const basename = filename.split(/[/\\]/).pop() || filename;

  // Replace problematic characters
  return basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/__+/g, '_')
    .substring(0, 200); // Limit length
}

/**
 * Get MIME type from file, with fallback based on extension
 */
export function getMimeType(file: File): string {
  if (file.type) return file.type;

  // Fallback based on extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.ts': 'text/x-typescript',
    '.tsx': 'text/x-typescript',
    '.jsx': 'text/javascript',
    '.py': 'text/x-python',
    '.java': 'text/x-java',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c',
    '.h': 'text/x-c',
    '.yaml': 'application/x-yaml',
    '.yml': 'application/x-yaml',
    '.sh': 'application/x-sh',
    '.xml': 'application/xml',
    '.toml': 'text/plain',
  };

  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check if a MIME type is an image
 */
export function isImageType(mimeType?: string): boolean {
  if (!mimeType) return false;
  return (UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}
