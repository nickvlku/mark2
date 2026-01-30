import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { TaskService } from '@/lib/services/task-service';

const taskService = new TaskService();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Get task to find the current phase and artifacts
    const task = taskService.getById(id);
    if (!task) {
      return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
    }

    const projectRoot = process.cwd();

    // 1. Check for saved diff artifacts (prioritize coding-diff)
    const diffArtifacts = task.artifacts?.filter(
      (a) => a.path.endsWith('-diff.patch') || a.name.endsWith('-diff'),
    ) ?? [];

    // Sort by phase order to get the most recent coding diff
    const phaseOrder = ['coding', 'testing', 'code_review', 'design'];
    diffArtifacts.sort((a, b) => {
      const aIdx = phaseOrder.indexOf(a.phase);
      const bIdx = phaseOrder.indexOf(b.phase);
      return aIdx - bIdx;
    });

    for (const artifact of diffArtifacts) {
      // Try to find the artifact file in the worktree
      const worktreePath = path.join(projectRoot, '.worktrees', id, artifact.phase);
      const artifactPath = path.join(worktreePath, artifact.path);

      if (fs.existsSync(artifactPath)) {
        const diff = fs.readFileSync(artifactPath, 'utf-8');
        return NextResponse.json({
          diff,
          source: 'artifact',
          artifact: artifact.name,
          phase: artifact.phase,
        });
      }
    }

    // 2. Try to get live diff from worktrees
    // Check coding phase first, then design
    const phasesToCheck = ['coding', 'design', task.phase];
    const uniquePhases = [...new Set(phasesToCheck)];

    for (const phase of uniquePhases) {
      const worktreePath = path.join(projectRoot, '.worktrees', id, phase);
      if (!fs.existsSync(worktreePath)) continue;

      try {
        let diff = '';

        // Get diff of tracked files
        try {
          const trackedDiff = execSync('git diff HEAD 2>/dev/null || git diff', {
            cwd: worktreePath,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          });
          if (trackedDiff.trim()) {
            diff += trackedDiff;
          }
        } catch {
          // No changes or not a git repo
        }

        // Get untracked files
        try {
          const untrackedFiles = execSync(
            'git ls-files --others --exclude-standard 2>/dev/null',
            {
              cwd: worktreePath,
              encoding: 'utf-8',
            },
          ).trim();

          if (untrackedFiles) {
            const files = untrackedFiles.split('\n').filter(Boolean);
            for (const file of files.slice(0, 50)) { // Limit to 50 files
              const filePath = path.join(worktreePath, file);
              try {
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                  const stat = fs.statSync(filePath);
                  if (stat.size > 100000) continue; // Skip files > 100KB

                  const content = fs.readFileSync(filePath, 'utf-8');
                  diff += `\ndiff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n`;
                  const lines = content.split('\n');
                  diff += `@@ -0,0 +1,${lines.length} @@\n`;
                  for (const line of lines) {
                    diff += `+${line}\n`;
                  }
                }
              } catch {
                // Skip files we can't read
              }
            }
          }
        } catch {
          // Failed to list untracked files
        }

        if (diff.trim()) {
          return NextResponse.json({
            diff,
            source: 'live',
            phase,
            worktree: worktreePath,
          });
        }
      } catch {
        // Continue to next phase
      }
    }

    // No diff found
    return NextResponse.json({
      diff: '',
      source: 'none',
      message: 'No code changes found',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to get diff' },
      { status: 500 },
    );
  }
}
