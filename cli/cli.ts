import path from 'path';
import fs from 'fs';

const VERSION = '0.1.0';

interface ParsedArgs {
  command: string | null;
  projectDir: string;
  args: string[];
  flags: {
    help: boolean;
    version: boolean;
    project?: string;
    // Start command flags
    foreground?: boolean;
    logs?: boolean;
    logfile?: string;
    port?: number;
    // Sync command flags
    push?: boolean;
    // Lock command flags
    force?: boolean;
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = [];
  const flags: ParsedArgs['flags'] = { help: false, version: false };
  let command: string | null = null;
  let projectDir = process.cwd();

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg === '--project' || arg === '-p') {
      flags.project = argv[++i];
      if (flags.project) {
        projectDir = path.resolve(flags.project);
      }
    } else if (arg.startsWith('--project=')) {
      flags.project = arg.split('=')[1];
      projectDir = path.resolve(flags.project);
    } else if (arg === '--foreground' || arg === '-f') {
      flags.foreground = true;
    } else if (arg === '--logs' || arg === '-l') {
      flags.logs = true;
    } else if (arg === '--logfile') {
      flags.logfile = argv[++i];
    } else if (arg.startsWith('--logfile=')) {
      flags.logfile = arg.split('=')[1];
    } else if (arg === '--port') {
      const portStr = argv[++i];
      flags.port = portStr ? parseInt(portStr, 10) : undefined;
    } else if (arg.startsWith('--port=')) {
      flags.port = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--push') {
      flags.push = true;
    } else if (arg === '--force') {
      flags.force = true;
    } else if (arg.startsWith('-') && !arg.startsWith('--')) {
      // Handle combined short flags like -vh
      for (const char of arg.slice(1)) {
        if (char === 'h') flags.help = true;
        if (char === 'v') flags.version = true;
        if (char === 'f') flags.foreground = true;
        if (char === 'l') flags.logs = true;
      }
    } else if (!command) {
      command = arg;
    } else {
      args.push(arg);
    }
  }

  return { command, projectDir, args, flags };
}

function showHelp(): void {
  console.log(`
mark2 - AI Agent Orchestration System

USAGE
  mark2 [OPTIONS] <COMMAND> [ARGS]

OPTIONS
  -h, --help              Show this help message
  -v, --version           Show version number
  -p, --project <path>    Use the specified project directory

COMMANDS
  init [path]             Initialize Mark2 in a directory (default: current dir)
  start [options]         Start the Mark2 server (background by default)
    -f, --foreground      Run server in foreground
    -l, --logs            View server logs (tail -f)
    --logfile <path>      Write logs to specified file
    --port <number>       Use a specific port (default: 3100)
  stop                    Stop the Mark2 server
  status                  Show server status and project info
  reindex                 Rebuild the SQLite index from state branch
  restart <taskId> [phase]  Restart current phase or transition to specified phase
  kill-sessions           Kill all mark2 tmux sessions
  tmuxes                  Show all tmux sessions and interactively select one

STATE SYNC (Multi-developer coordination)
  sync                    Pull latest state from remote
  sync --push             Push local state changes to remote
  lock <task-id>          Acquire lock on a task
  lock <task-id> --force  Force acquire lock (for expired locks)
  unlock <task-id>        Release lock on a task
  locks                   List all current locks

EXAMPLES
  # Initialize mark2 in current directory
  mark2 init

  # Initialize mark2 in a specific directory
  mark2 init /path/to/project
  mark2 -p /path/to/project init

  # Start server for a specific project
  mark2 -p /path/to/project start

  # Check status of a specific project
  mark2 --project=/path/to/project status

ENVIRONMENT VARIABLES
  MARK2_DIR               Override the .mark2 directory path
  PORT                    Server port (default: 3100)

For more information, visit: https://github.com/anthropics/mark2
`);
}

function showVersion(): void {
  console.log(`mark2 v${VERSION}`);
}

async function main() {
  const parsed = parseArgs(process.argv);

  if (parsed.flags.version) {
    showVersion();
    return;
  }

  if (parsed.flags.help || !parsed.command) {
    showHelp();
    process.exit(parsed.flags.help ? 0 : 1);
  }

  // Set MARK2_DIR environment variable if project was specified
  if (parsed.flags.project) {
    const mark2Dir = path.join(parsed.projectDir, '.mark2');
    process.env.MARK2_DIR = mark2Dir;
    process.env.MARK2_PROJECT_DIR = parsed.projectDir;
  }

  switch (parsed.command) {
    case 'init': {
      // Init can take an optional path argument
      const targetDir = parsed.args[0]
        ? path.resolve(parsed.args[0])
        : parsed.projectDir;

      const { initCommand } = await import('./commands/init');
      await initCommand(targetDir);
      break;
    }

    case 'start': {
      const { startCommand } = await import('./commands/start');
      await startCommand(parsed.projectDir, {
        foreground: parsed.flags.foreground,
        logs: parsed.flags.logs,
        logfile: parsed.flags.logfile,
        port: parsed.flags.port,
      });
      break;
    }

    case 'stop': {
      const { stopCommand } = await import('./commands/stop');
      await stopCommand(parsed.projectDir);
      break;
    }

    case 'reindex': {
      const { reindexCommand } = await import('./commands/reindex');
      await reindexCommand(parsed.projectDir);
      break;
    }

    case 'status': {
      const { statusCommand } = await import('./commands/status');
      await statusCommand(parsed.projectDir);
      break;
    }

    case 'kill-sessions': {
      const { killSessionsCommand } = await import('./commands/kill-sessions');
      await killSessionsCommand();
      break;
    }

    case 'restart': {
      const { restartCommand } = await import('./commands/restart');
      const taskId = parsed.args[0];
      const phase = parsed.args[1];
      await restartCommand(taskId, phase);
      break;
    }

    case 'tmuxes': {
      const { tmuxesCommand } = await import('./commands/tmuxes');
      await tmuxesCommand();
      break;
    }

    case 'sync': {
      const { syncCommand } = await import('./commands/sync');
      await syncCommand(parsed.projectDir, { push: parsed.flags.push });
      break;
    }

    case 'lock': {
      const taskId = parsed.args[0];
      if (parsed.flags.force) {
        const { forceLockCommand } = await import('./commands/lock');
        await forceLockCommand(taskId, parsed.projectDir);
      } else {
        const { lockCommand } = await import('./commands/lock');
        await lockCommand(taskId, parsed.projectDir);
      }
      break;
    }

    case 'unlock': {
      const { unlockCommand } = await import('./commands/lock');
      const taskId = parsed.args[0];
      await unlockCommand(taskId, parsed.projectDir);
      break;
    }

    case 'locks': {
      const { locksCommand } = await import('./commands/lock');
      await locksCommand(parsed.projectDir);
      break;
    }

    default:
      console.error(`Unknown command: ${parsed.command}`);
      console.log('Run `mark2 --help` for usage information.');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
