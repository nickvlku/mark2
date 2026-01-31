'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface DiffModalProps {
  diff: string;
  taskId: string;
  onClose: () => void;
}

type ViewMode = 'unified' | 'split';

interface ParsedHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: Array<{
    type: 'context' | 'add' | 'remove';
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
  }>;
}

interface ParsedFile {
  oldPath: string;
  newPath: string;
  hunks: ParsedHunk[];
}

function parseDiff(diff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const lines = diff.split('\n');
  let currentFile: ParsedFile | null = null;
  let currentHunk: ParsedHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        files.push(currentFile);
      }
      currentFile = { oldPath: '', newPath: '', hunks: [] };
      currentHunk = null;
    } else if (line.startsWith('--- ')) {
      if (currentFile) {
        currentFile.oldPath = line.slice(4).replace(/^a\//, '');
      }
    } else if (line.startsWith('+++ ')) {
      if (currentFile) {
        currentFile.newPath = line.slice(4).replace(/^b\//, '');
      }
    } else if (line.startsWith('@@')) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLineNum = match ? parseInt(match[1], 10) : 1;
      newLineNum = match ? parseInt(match[2], 10) : 1;
      currentHunk = {
        header: line,
        oldStart: oldLineNum,
        newStart: newLineNum,
        lines: [],
      };
    } else if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'add',
          content: line.slice(1),
          newLineNum: newLineNum++,
        });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'remove',
          content: line.slice(1),
          oldLineNum: oldLineNum++,
        });
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({
          type: 'context',
          content: line.startsWith(' ') ? line.slice(1) : line,
          oldLineNum: oldLineNum++,
          newLineNum: newLineNum++,
        });
      }
    }
  }

  if (currentFile) {
    if (currentHunk) currentFile.hunks.push(currentHunk);
    files.push(currentFile);
  }

  return files;
}

function SplitView({ files }: { files: ParsedFile[] }) {
  return (
    <div className="flex flex-col gap-4">
      {files.map((file, fileIdx) => (
        <div key={fileIdx} className="border border-border rounded-lg overflow-hidden">
          {/* File header */}
          <div className="bg-bg-secondary px-4 py-2 border-b border-border">
            <span className="text-sm font-mono text-text-primary">
              {file.newPath || file.oldPath}
            </span>
          </div>

          {/* Split panes */}
          <div className="flex">
            {/* Left (old) */}
            <div className="flex-1 border-r border-border bg-red-500/5">
              <div className="px-2 py-1 text-[10px] text-text-secondary border-b border-border bg-bg-secondary/50">
                Original
              </div>
              <div className="font-mono text-xs">
                {file.hunks.map((hunk, hunkIdx) => (
                  <div key={hunkIdx}>
                    <div className="px-2 py-1 bg-bg-secondary/30 text-cyan-400 text-[10px]">
                      {hunk.header}
                    </div>
                    {hunk.lines.map((line, lineIdx) => {
                      if (line.type === 'add') {
                        return (
                          <div key={lineIdx} className="px-2 py-0.5 bg-green-500/5 text-transparent select-none">
                            {'\u00A0'}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={lineIdx}
                          className={`px-2 py-0.5 flex ${
                            line.type === 'remove'
                              ? 'bg-red-500/20 text-red-300'
                              : 'text-text-secondary'
                          }`}
                        >
                          <span className="w-10 text-text-secondary/40 text-right pr-2 select-none shrink-0">
                            {line.oldLineNum}
                          </span>
                          <span className="whitespace-pre overflow-x-auto">{line.content || '\u00A0'}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Right (new) */}
            <div className="flex-1 bg-green-500/5">
              <div className="px-2 py-1 text-[10px] text-text-secondary border-b border-border bg-bg-secondary/50">
                Modified
              </div>
              <div className="font-mono text-xs">
                {file.hunks.map((hunk, hunkIdx) => (
                  <div key={hunkIdx}>
                    <div className="px-2 py-1 bg-bg-secondary/30 text-cyan-400 text-[10px]">
                      {hunk.header}
                    </div>
                    {hunk.lines.map((line, lineIdx) => {
                      if (line.type === 'remove') {
                        return (
                          <div key={lineIdx} className="px-2 py-0.5 bg-red-500/5 text-transparent select-none">
                            {'\u00A0'}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={lineIdx}
                          className={`px-2 py-0.5 flex ${
                            line.type === 'add'
                              ? 'bg-green-500/20 text-green-300'
                              : 'text-text-secondary'
                          }`}
                        >
                          <span className="w-10 text-text-secondary/40 text-right pr-2 select-none shrink-0">
                            {line.newLineNum}
                          </span>
                          <span className="whitespace-pre overflow-x-auto">{line.content || '\u00A0'}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UnifiedView({ diff }: { diff: string }) {
  return (
    <pre className="text-xs font-mono leading-relaxed">
      {diff.split('\n').map((line, i) => {
        let lineClass = 'text-text-secondary';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          lineClass = 'text-green-400 bg-green-500/10';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          lineClass = 'text-red-400 bg-red-500/10';
        } else if (line.startsWith('@@')) {
          lineClass = 'text-cyan-400 bg-cyan-500/5';
        } else if (line.startsWith('diff ') || line.startsWith('index ')) {
          lineClass = 'text-text-secondary/50 font-bold bg-bg-secondary/50';
        }
        return (
          <div key={i} className={`${lineClass} px-4 py-0.5 whitespace-pre`}>
            {line || '\u00A0'}
          </div>
        );
      })}
    </pre>
  );
}

export function DiffModal({ diff, taskId, onClose }: DiffModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [mounted, setMounted] = useState(false);

  const parsedFiles = useMemo(() => parseDiff(diff), [diff]);

  useEffect(() => {
    setMounted(true);

    // Close on escape
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative w-[95vw] h-[90vh] bg-bg-primary border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-medium text-text-primary">
              Code Changes - {taskId}
            </h2>
            <span className="text-xs text-text-secondary">
              {parsedFiles.length} file{parsedFiles.length !== 1 ? 's' : ''} changed
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center bg-bg-primary rounded-lg p-0.5 border border-border">
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewMode === 'split'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Split
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewMode === 'unified'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Unified
              </button>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* File list sidebar + content */}
        <div className="flex-1 flex overflow-hidden">
          {/* File list */}
          <div className="w-64 border-r border-border bg-bg-secondary/30 overflow-y-auto">
            <div className="p-2">
              <div className="text-[10px] uppercase text-text-secondary px-2 py-1">
                Changed Files
              </div>
              {parsedFiles.map((file, idx) => (
                <button
                  key={idx}
                  className="w-full text-left px-2 py-1.5 text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors truncate"
                  onClick={() => {
                    document.getElementById(`file-${idx}`)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {file.newPath || file.oldPath || 'unknown'}
                </button>
              ))}
            </div>
          </div>

          {/* Diff content */}
          <div className="flex-1 overflow-auto bg-bg-primary">
            {viewMode === 'split' ? (
              <div className="p-4">
                {parsedFiles.map((file, idx) => (
                  <div key={idx} id={`file-${idx}`} className="mb-6">
                    <SplitView files={[file]} />
                  </div>
                ))}
              </div>
            ) : (
              <UnifiedView diff={diff} />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
