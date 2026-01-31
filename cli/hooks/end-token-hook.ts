#!/usr/bin/env npx tsx
/**
 * Claude Code Stop Hook for Mark2 End Token Detection
 *
 * This hook is called when Claude finishes responding. It reads the transcript
 * to check if the last assistant message contains any end tokens, and if so,
 * signals the mark2 API to advance the phase.
 *
 * Hook input (stdin JSON):
 * {
 *   "session_id": "...",
 *   "transcript_path": "/path/to/transcript.jsonl",
 *   "cwd": "...",
 *   ...
 * }
 */

import fs from 'fs';
import path from 'path';

// End tokens that signal phase completion
const END_TOKENS: Record<string, string[]> = {
  design: ['[DESIGN_COMPLETED]'],
  coding: ['[CODING_COMPLETED]'],
  testing: ['[TESTING_PASSED]', '[TESTING_FAILED]'],
  code_review: ['[REVIEW_COMPLETED]'],
  manual_testing: ['[MANUAL_TESTING_READY]'],
  done: ['[TASK_COMPLETED]'],
};

// All end tokens flattened for quick lookup
const ALL_END_TOKENS = Object.values(END_TOKENS).flat();

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
}

interface TranscriptMessage {
  type: 'user' | 'assistant' | 'system';
  message?: {
    content?: Array<{ type: string; text?: string }> | string;
  };
  // JSONL format varies - handle different structures
  content?: Array<{ type: string; text?: string }> | string;
  role?: string;
}

async function main() {
  // Read hook input from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    // No input - nothing to do
    process.exit(0);
  }

  let hookInput: HookInput;
  try {
    hookInput = JSON.parse(input);
  } catch {
    console.error('[mark2-hook] Failed to parse hook input');
    process.exit(0);
  }

  // Only process Stop events
  if (hookInput.hook_event_name !== 'Stop') {
    process.exit(0);
  }

  const transcriptPath = hookInput.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    console.error('[mark2-hook] Transcript not found:', transcriptPath);
    process.exit(0);
  }

  // Read environment variables set by mark2
  const taskId = process.env.MARK2_TASK_ID;
  const apiUrl = process.env.MARK2_API_URL;
  const agentToken = process.env.MARK2_AGENT_TOKEN;

  if (!taskId || !apiUrl) {
    // Not running under mark2 orchestration
    process.exit(0);
  }

  // Read and parse the transcript
  const transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = transcriptContent.trim().split('\n').filter(Boolean);

  // Find the last assistant message
  let lastAssistantText = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]) as TranscriptMessage;

      // Handle various transcript formats
      const isAssistant =
        entry.type === 'assistant' ||
        entry.role === 'assistant';

      if (isAssistant) {
        // Extract text content
        const content = entry.message?.content ?? entry.content;
        if (typeof content === 'string') {
          lastAssistantText = content;
        } else if (Array.isArray(content)) {
          lastAssistantText = content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text)
            .join('\n');
        }
        break;
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (!lastAssistantText) {
    process.exit(0);
  }

  // Check for end tokens
  const foundToken = ALL_END_TOKENS.find((token) =>
    lastAssistantText.includes(token)
  );

  if (!foundToken) {
    process.exit(0);
  }

  // Found an end token - signal the mark2 API
  console.log(`[mark2-hook] End token detected: ${foundToken}`);

  try {
    const response = await fetch(`${apiUrl}/api/tasks/${taskId}/phase/hook-complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agentToken ? { Authorization: `Bearer ${agentToken}` } : {}),
      },
      body: JSON.stringify({
        token: foundToken,
        session_id: hookInput.session_id,
        transcript_path: transcriptPath,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[mark2-hook] API error: ${response.status} ${text}`);
    } else {
      console.log(`[mark2-hook] Phase completion signaled for ${taskId}`);
    }
  } catch (error) {
    console.error('[mark2-hook] Failed to signal API:', error);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[mark2-hook] Unexpected error:', err);
  process.exit(0);
});
