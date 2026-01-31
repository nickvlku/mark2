import { capturePane, isSessionAlive } from '../utils/tmux';
import { END_TOKENS } from './pipeline';
import type { Phase } from '../yaml/schemas';

// ── Types ───────────────────────────────────────────────────────────────────

export interface EndTokenMatch {
  token: string;
  phase: Phase;
  sessionName: string;
}

export type EndTokenCallback = (match: EndTokenMatch) => void | Promise<void>;

interface WatcherEntry {
  interval: ReturnType<typeof setInterval>;
  phase: Phase;
  callback: EndTokenCallback;
  lastContentHash: string;
  baselineTokenCounts: Map<string, number>; // count of each token in baseline
}

/** Escape special regex characters */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── End Token Watcher ───────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const CAPTURE_LINES = 100;
// Minimum time to wait before detecting end tokens (allows prompt to be fully displayed)
const MIN_BASELINE_WAIT_MS = 20000;

/** Simple string hash for change detection */
function hashContent(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

export class EndTokenWatcher {
  private watchers: Map<string, WatcherEntry> = new Map();

  /**
   * Start polling a TMUX session's output for end tokens relevant to the given phase.
   * When an end token is detected, `onToken` is called and the watcher is automatically stopped.
   */
  async watch(sessionName: string, phase: Phase, onToken: EndTokenCallback): Promise<void> {
    // Don't double-watch the same session
    if (this.watchers.has(sessionName)) {
      this.stop(sessionName);
    }

    const tokens = END_TOKENS[phase];
    if (!tokens || tokens.length === 0) {
      return;
    }

    // Wait for the command text to be fully rendered in the TMUX pane.
    // The prompt contains end token strings literally, so we must capture
    // which tokens are already present to exclude from detection.
    //
    // IMPORTANT: We must wait long enough for the prompt to be fully delivered.
    // The prompt is sent via sendPromptFile which waits 5s + 1s before sending Enter.
    // Then Claude Code needs time to process and display it.
    // We wait a minimum of MIN_BASELINE_WAIT_MS to ensure the prompt is fully shown.
    console.log(`[watcher] Starting baseline capture for ${sessionName}, waiting ${MIN_BASELINE_WAIT_MS}ms minimum`);

    const startTime = Date.now();
    let baselineContent = '';
    let stableCount = 0;

    // Wait at least MIN_BASELINE_WAIT_MS, then continue until content stabilizes
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const elapsed = Date.now() - startTime;

      try {
        const current = await capturePane(sessionName, CAPTURE_LINES) ?? '';
        const currentHash = hashContent(current);
        const baselineHash = hashContent(baselineContent);

        if (currentHash === baselineHash && current.length > 0) {
          stableCount++;
          // Only exit if we've waited the minimum time AND content is stable
          if (elapsed >= MIN_BASELINE_WAIT_MS && stableCount >= 3) {
            console.log(`[watcher] Baseline stabilized for ${sessionName} after ${elapsed}ms`);
            break;
          }
        } else {
          stableCount = 0;
          baselineContent = current;
        }
      } catch {
        // Session may not be ready yet
      }

      // Safety: don't wait forever (max 60 seconds)
      if (elapsed > 60000) {
        console.log(`[watcher] Baseline timeout for ${sessionName} after ${elapsed}ms`);
        break;
      }
    }

    // Count how many times each token appears in the baseline.
    // We only trigger on NEW occurrences (count increased).
    const baselineTokenCounts = new Map<string, number>();
    for (const token of tokens) {
      const count = (baselineContent.match(new RegExp(escapeRegExp(token), 'g')) || []).length;
      baselineTokenCounts.set(token, count);
      if (count > 0) {
        console.log(`[watcher] Baseline contains ${count} occurrence(s) of "${token}" for ${sessionName}`);
      }
    }

    const entry: WatcherEntry = {
      phase,
      callback: onToken,
      lastContentHash: hashContent(baselineContent),
      baselineTokenCounts,
      interval: setInterval(() => {
        void this.poll(sessionName);
      }, POLL_INTERVAL_MS),
    };

    this.watchers.set(sessionName, entry);
  }

  /**
   * Stop watching a specific session.
   */
  stop(sessionName: string): void {
    const entry = this.watchers.get(sessionName);
    if (entry) {
      clearInterval(entry.interval);
      this.watchers.delete(sessionName);
    }
  }

  /**
   * Stop all active watchers.
   */
  stopAll(): void {
    for (const [sessionName] of this.watchers) {
      this.stop(sessionName);
    }
  }

  /**
   * Returns the number of active watchers.
   */
  get activeCount(): number {
    return this.watchers.size;
  }

  /**
   * Check if a specific session is being watched.
   */
  isWatching(sessionName: string): boolean {
    return this.watchers.has(sessionName);
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async poll(sessionName: string): Promise<void> {
    const entry = this.watchers.get(sessionName);
    if (!entry) return;

    // Check if session is still alive
    const alive = await isSessionAlive(sessionName);
    if (!alive) {
      // Session died without emitting an end token -- notify with a crash signal
      this.stop(sessionName);
      // We don't call the token callback here; the TmuxManager / Engine
      // should detect the dead session separately via its own monitoring.
      return;
    }

    try {
      const output = await capturePane(sessionName, CAPTURE_LINES);
      if (!output) return;

      // Check if content has changed using hash comparison
      const currentHash = hashContent(output);
      if (currentHash === entry.lastContentHash) {
        // Content unchanged — nothing new to scan
        return;
      }
      entry.lastContentHash = currentHash;

      // Scan the entire captured output for end tokens.
      // Only trigger if the token count INCREASED from baseline (new occurrence).
      const tokens = END_TOKENS[entry.phase];
      for (const token of tokens) {
        const currentCount = (output.match(new RegExp(escapeRegExp(token), 'g')) || []).length;
        const baselineCount = entry.baselineTokenCounts.get(token) ?? 0;

        if (currentCount > baselineCount) {
          // Found a NEW occurrence of the end token
          console.log(`[watcher] End token "${token}" detected for ${sessionName} (baseline: ${baselineCount}, current: ${currentCount})`);
          this.stop(sessionName);
          await entry.callback({
            token,
            phase: entry.phase,
            sessionName,
          });
          return;
        }
      }
    } catch {
      // Capture failed -- session may be in a transient state, retry next poll
    }
  }
}
