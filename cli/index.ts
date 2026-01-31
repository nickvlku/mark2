#!/usr/bin/env node

const command = process.argv[2];
const projectDir = process.cwd();

async function main() {
  switch (command) {
    case 'init': {
      const { initCommand } = await import('./commands/init');
      await initCommand(projectDir);
      break;
    }
    case 'start': {
      const { startCommand } = await import('./commands/start');
      await startCommand(projectDir);
      break;
    }
    case 'stop': {
      const { stopCommand } = await import('./commands/stop');
      await stopCommand();
      break;
    }
    case 'reindex': {
      const { reindexCommand } = await import('./commands/reindex');
      await reindexCommand(projectDir);
      break;
    }
    case 'status': {
      const { statusCommand } = await import('./commands/status');
      await statusCommand();
      break;
    }
    case 'kill-sessions': {
      const { killSessionsCommand } = await import('./commands/kill-sessions');
      await killSessionsCommand();
      break;
    }
    case 'restart': {
      const { restartCommand } = await import('./commands/restart');
      const taskId = process.argv[3];
      const phase = process.argv[4];
      await restartCommand(taskId, phase);
      break;
    }
    case 'tmuxes': {
      const { tmuxesCommand } = await import('./commands/tmuxes');
      await tmuxesCommand();
      break;
    }
    default:
      console.log('Usage: mark2 <command>');
      console.log('');
      console.log('Commands:');
      console.log('  init                      Initialize Mark2 in the current directory');
      console.log('  start                     Start the Mark2 server');
      console.log('  stop                      Stop the Mark2 server');
      console.log('  reindex                   Rebuild the SQLite index from YAML files');
      console.log('  status                    Show active agent sessions');
      console.log('  kill-sessions             Kill all mark2 tmux sessions');
      console.log('  tmuxes                    Show all tmux sessions and interactively select one');
      console.log('  restart <taskId> [phase]  Restart current phase or transition to specified phase');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
