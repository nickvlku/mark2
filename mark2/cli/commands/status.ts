import { listMark2Sessions } from '../../src/lib/utils/tmux';

export async function statusCommand(): Promise<void> {
  console.log('Mark2 Status\n');

  const sessions = await listMark2Sessions();

  if (sessions.length === 0) {
    console.log('No active agent sessions.');
    return;
  }

  console.log(`Active agent sessions (${sessions.length}):`);
  for (const session of sessions) {
    // Parse session name: mark2_{taskId}_{agentName}_{phase}
    const parts = session.replace('mark2_', '').split('_');
    console.log(`  ${session}`);
  }
}
