import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { getMark2Dir } from '../utils/mark2-dir';
import { isValidPlanId, isValidTaskId } from '../utils/route-validation';
import { isSessionAlive } from '../utils/tmux';
import type {
  TerminalMetadata,
  TerminalSessionInfo,
  TerminalSessionResponse,
  TerminalTarget,
  TerminalTargetKind,
} from './types';

export const TERMINAL_WS_PATH = '/ws/terminal';
export const DEFAULT_TERMINAL_MODE = 'observe' as const;

export function getTerminalMetadata(target: TerminalTarget): TerminalMetadata {
  return {
    ws_path: TERMINAL_WS_PATH,
    default_mode: target.kind === 'task' ? 'control' : DEFAULT_TERMINAL_MODE,
    control_supported: true,
  };
}

export function isTerminalTargetKind(
  value: string | null | undefined,
): value is TerminalTargetKind {
  return value === 'task' || value === 'plan';
}

export function isValidTerminalTarget(target: TerminalTarget): boolean {
  if (target.kind === 'task') {
    return isValidTaskId(target.id);
  }

  return isValidPlanId(target.id);
}

export function terminalTargetKey(target: TerminalTarget): string {
  return `${target.kind}:${target.id}`;
}

export async function resolveLatestTerminalSession(
  target: TerminalTarget,
): Promise<TerminalSessionInfo | null> {
  if (!isValidTerminalTarget(target)) {
    return null;
  }

  const db = getDb(getMark2Dir());
  const latestSession = db
    .select()
    .from(schema.agentSessions)
    .where(eq(schema.agentSessions.task_id, target.id))
    .orderBy(desc(schema.agentSessions.started_at))
    .limit(1)
    .get();

  if (!latestSession) {
    return null;
  }

  const alive = await isSessionAlive(latestSession.tmux_session);

  return {
    tmux_session: latestSession.tmux_session,
    agent_name: latestSession.agent_name,
    phase: latestSession.phase,
    status: alive ? 'running' : latestSession.status,
  };
}

export async function resolveActiveTerminalSession(
  target: TerminalTarget,
): Promise<TerminalSessionInfo | null> {
  const session = await resolveLatestTerminalSession(target);

  if (!session || session.status !== 'running') {
    return null;
  }

  return session;
}

export async function getTerminalSessionResponse(
  target: TerminalTarget,
): Promise<TerminalSessionResponse> {
  return {
    session: await resolveLatestTerminalSession(target),
    terminal: getTerminalMetadata(target),
  };
}
