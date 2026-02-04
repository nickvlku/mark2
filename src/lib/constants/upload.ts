/**
 * Upload configuration constants for file upload functionality
 */

export const UPLOAD_CONFIG = {
  // Size limits
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB per file
  MAX_TOTAL_SIZE: 50 * 1024 * 1024, // 50MB total per upload operation
  MAX_FILES_PER_UPLOAD: 10,

  // Allowed MIME types
  ALLOWED_IMAGE_TYPES: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
    'image/webp',
  ],
  ALLOWED_DOCUMENT_TYPES: [
    'text/plain',
    'text/markdown',
    'application/json',
    'application/pdf',
    'text/csv',
    'text/html',
    'text/css',
    'text/javascript',
    'application/xml',
    'text/xml',
  ],
  ALLOWED_CODE_TYPES: [
    'text/x-python',
    'text/x-java',
    'text/x-c',
    'text/x-typescript',
    'application/x-yaml',
    'application/x-sh',
  ],

  // File extensions (fallback when MIME detection fails)
  ALLOWED_EXTENSIONS: [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
    '.txt', '.md', '.json', '.pdf', '.csv', '.html', '.css', '.js', '.ts',
    '.py', '.java', '.c', '.cpp', '.h', '.yaml', '.yml', '.sh', '.rb', '.go',
    '.rs', '.swift', '.kt', '.sql', '.xml', '.toml', '.tsx', '.jsx',
  ],
} as const;
