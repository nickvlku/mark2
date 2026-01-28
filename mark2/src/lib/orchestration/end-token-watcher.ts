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
  lastCaptureLength: number;
  baselineContent: string;
}

// ── End Token Watcher ───────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const CAPTURE_LINES = 100;

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
    // everything currently in the pane as baseline content to exclude from scanning.
    // We poll repeatedly until the pane content stabilizes (stops growing).
    let baselineContent = '';
    let stableCount = 0;
    for (let i = 0; i < 15; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const current = await capturePane(sessionName, CAPTURE_LINES) ?? '';
        if (current.length === baselineContent.length && current.length > 0) {
          stableCount++;
          if (stableCount >= 2) break; // Content has stabilized
        } else {
          stableCount = 0;
          baselineContent = current;
        }
      } catch {
        // Session may not be ready yet
      }
    }

    const entry: WatcherEntry = {
      phase,
      callback: onToken,
      lastCaptureLength: baselineContent.length,
      baselineContent,
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

      // Only scan content that appeared after the baseline (command text).
      // This prevents false positives from end tokens in the prompt itself.
      let newContent: string;
      if (output.length > entry.lastCaptureLength) {
        newContent = output.slice(entry.lastCaptureLength);
      } else {
        // Content hasn't grown — nothing new to scan
        return;
      }
      entry.lastCaptureLength = output.length;

      // Double-check: skip if the new content is still part of the baseline
      // (can happen if pane reflowed/resized)
      if (entry.baselineContent && entry.baselineContent.includes(newContent.trim())) {
        return;
      }

      const tokens = END_TOKENS[entry.phase];
      for (const token of tokens) {
        if (newContent.includes(token)) {
          // Found an end token -- stop watching and fire callback
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
