import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { initializeDatabase } from '../../src/lib/db';
import { StateBranchService } from '../../src/lib/services/state-branch-service';

// Check if a command exists
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check if this is a git repository
function isGitRepo(dir: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--git-dir'], {
    cwd: dir,
    encoding: 'utf-8',
  });
  return result.status === 0;
}

// Check for required system dependencies
function checkDependencies(): { missing: string[]; installHints: Record<string, string> } {
  const dependencies = [
    { name: 'tmux', hint: 'brew install tmux (macOS) or sudo pacman -S tmux (Arch) or sudo apt install tmux (Debian/Ubuntu)' },
    { name: 'sqlite3', hint: 'brew install sqlite (macOS) or sudo pacman -S sqlite (Arch) or sudo apt install sqlite3 (Debian/Ubuntu)' },
  ];

  const missing: string[] = [];
  const installHints: Record<string, string> = {};

  for (const dep of dependencies) {
    if (!commandExists(dep.name)) {
      missing.push(dep.name);
      installHints[dep.name] = dep.hint;
    }
  }

  return { missing, installHints };
}

// New gitignore entries - everything in .mark2/ is now local
const GITIGNORE_ENTRIES = [
  '.mark2/',
];

const GITIGNORE_BLOCK = `
# Mark2 - All local data (state is stored on orphan branch 'mark2-state')
.mark2/
`;

// Check if existing .mark2/ has state that needs migration
function hasExistingState(mark2Dir: string): boolean {
  const tasksDir = path.join(mark2Dir, 'tasks');
  const storiesDir = path.join(mark2Dir, 'stories');

  if (fs.existsSync(tasksDir)) {
    const files = fs.readdirSync(tasksDir);
    if (files.some(f => /^TASK-\d+\.yaml$/.test(f))) {
      return true;
    }
  }

  if (fs.existsSync(storiesDir)) {
    const files = fs.readdirSync(storiesDir);
    if (files.some(f => /^STORY-\d+\.yaml$/.test(f))) {
      return true;
    }
  }

  return false;
}

export async function initCommand(projectDir: string = process.cwd()): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');
  const projectName = path.basename(projectDir);

  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│         Initializing Mark2              │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');

  // Check for required system dependencies
  const { missing, installHints } = checkDependencies();
  if (missing.length > 0) {
    console.log('⚠️  Missing required dependencies:');
    console.log('');
    for (const dep of missing) {
      console.log(`   ✗ ${dep} is not installed`);
      console.log(`     Install: ${installHints[dep]}`);
      console.log('');
    }
    console.log('Please install the missing dependencies and run `mark2 init` again.');
    console.log('');
    process.exit(1);
  }

  // Check if this is a git repository
  if (!isGitRepo(projectDir)) {
    console.log('⚠️  This directory is not a git repository.');
    console.log('   Mark2 requires git for state management.');
    console.log('   Run `git init` first, then run `mark2 init` again.');
    console.log('');
    process.exit(1);
  }

  console.log(`Project: ${projectName}`);
  console.log(`Location: ${projectDir}`);
  console.log('');

  // Check for existing state that needs migration
  const needsMigration = hasExistingState(mark2Dir);
  if (needsMigration) {
    console.log('📦 Detected existing Mark2 state - will migrate to orphan branch');
    console.log('');
  }

  // Step 1: Create directory structure
  console.log('📁 Creating directory structure...');
  const dirs = ['storage', 'clones'];
  for (const dir of dirs) {
    const dirPath = path.join(mark2Dir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`   ✓ Created .mark2/${dir}/`);
    } else {
      console.log(`   · .mark2/${dir}/ already exists`);
    }
  }

  // Create runtime files (gitignored)
  const runtimeFiles = ['server.pid', 'server.log'];
  for (const file of runtimeFiles) {
    const filePath = path.join(mark2Dir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '');
    }
  }
  console.log('');

  // Step 2: Copy template files (these will be migrated to orphan branch)
  console.log('📄 Setting up configuration files...');
  const templatesDir = path.join(__dirname, '..', 'templates');

  // Config
  const configPath = path.join(mark2Dir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    let config = fs.readFileSync(path.join(templatesDir, 'config.yaml'), 'utf-8');
    config = config.replace('project_name: ""', `project_name: "${projectName}"`);
    // Add state_sync config
    config += `
# State synchronization settings (orphan branch)
state_sync:
  lock_timeout_days: 5        # Days before lock can be force-taken
  auto_pull_on_start: true    # Pull state on mark2 start
`;
    fs.writeFileSync(configPath, config);
    console.log('   ✓ Created .mark2/config.yaml (project settings)');
  } else {
    console.log('   · .mark2/config.yaml already exists');
  }

  // Agents
  const agentsPath = path.join(mark2Dir, 'agents.yaml');
  if (!fs.existsSync(agentsPath)) {
    fs.copyFileSync(path.join(templatesDir, 'agents.yaml'), agentsPath);
    console.log('   ✓ Created .mark2/agents.yaml (agent definitions)');
  } else {
    console.log('   · .mark2/agents.yaml already exists');
  }

  // Context
  const contextPath = path.join(mark2Dir, 'context.json');
  if (!fs.existsSync(contextPath)) {
    fs.copyFileSync(path.join(templatesDir, 'context.json'), contextPath);
    console.log('   ✓ Created .mark2/context.json (project context for agents)');
  } else {
    console.log('   · .mark2/context.json already exists');
  }
  console.log('');

  // Step 3: Set up orphan branch and worktree
  console.log('🌿 Setting up state branch...');
  const stateBranchService = new StateBranchService(mark2Dir);

  try {
    // Initialize the orphan branch
    await stateBranchService.init();

    // Set up the worktree
    await stateBranchService.ensureWorktree();
    console.log(`   ✓ State worktree ready at .mark2/.state/`);

    // Migrate existing state if needed
    if (needsMigration) {
      console.log('');
      console.log('📦 Migrating existing state to orphan branch...');
      const { migrated, files } = await stateBranchService.migrateExisting();
      if (migrated) {
        console.log(`   ✓ Migrated ${files.length} files to orphan branch`);
        for (const file of files.slice(0, 5)) {
          console.log(`      + ${file}`);
        }
        if (files.length > 5) {
          console.log(`      ... and ${files.length - 5} more`);
        }

        // Clean up old state files
        await stateBranchService.cleanupAfterMigration();
        console.log('   ✓ Cleaned up old state files');
      }
    }
  } catch (e: any) {
    console.log(`   ⚠ State branch setup warning: ${e.message}`);
    console.log('     You may need to set up the state branch manually');
  }
  console.log('');

  // Step 4: Initialize database
  console.log('🗄️  Initializing SQLite database...');
  initializeDatabase(mark2Dir);
  console.log('   ✓ Database ready at .mark2/mark2.db');
  console.log('   ℹ Database is rebuilt from state branch on each startup');
  console.log('');

  // Step 5: Update .gitignore
  console.log('📝 Updating .gitignore...');
  const gitignorePath = path.join(projectDir, '.gitignore');
  updateGitignore(gitignorePath);
  console.log('');

  // Done!
  console.log('┌─────────────────────────────────────────┐');
  console.log('│         ✓ Mark2 initialized!            │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
  console.log('State is stored on orphan branch: mark2-state');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review .mark2/config.yaml for port settings');
  console.log('  2. Run `mark2 start` to launch the dashboard');
  console.log('  3. Create your first task in the UI');
  console.log('');
  console.log('Multi-developer notes:');
  console.log('  - Tasks are locked when picked up (pending → design)');
  console.log('  - Run `mark2 sync` to pull latest state from team');
  console.log('  - Run `mark2 locks` to see who is working on what');
  console.log('');
}

function updateGitignore(gitignorePath: string): void {
  let content = '';

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8');
  }

  // Check if .mark2/ is already ignored
  if (content.includes('.mark2/') || content.includes('.mark2')) {
    console.log('   · .gitignore already ignores .mark2/');
    return;
  }

  // Add the gitignore block
  if (content.length > 0 && !content.endsWith('\n')) {
    fs.appendFileSync(gitignorePath, '\n');
  }
  fs.appendFileSync(gitignorePath, GITIGNORE_BLOCK);
  console.log('   ✓ Added .mark2/ to .gitignore');
  console.log('   ℹ State is now stored on orphan branch, not in .mark2/');
}
