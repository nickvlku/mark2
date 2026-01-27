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
  watch(sessionName: string, phase: Phase, onToken: EndTokenCallback): void {
    // Don't double-watch the same session
    if (this.watchers.has(sessionName)) {
      this.stop(sessionName);
    }

    const tokens = END_TOKENS[phase];
    if (!tokens || tokens.length === 0) {
      return;
    }

    const entry: WatcherEntry = {
      phase,
      callback: onToken,
      lastCaptureLength: 0,
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

      // Only scan new content to avoid duplicate detections
      const newContent = output.length > entry.lastCaptureLength
        ? output.slice(entry.lastCaptureLength)
        : output;
      entry.lastCaptureLength = output.length;

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
