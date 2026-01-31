import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { initializeDatabase } from '../../src/lib/db';

// Check if a command exists
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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

// Gitignore entries for Mark2 (derived/recreatable data)
const GITIGNORE_ENTRIES = [
  '.mark2/mark2.db',
  '.mark2/mark2.db-shm',
  '.mark2/mark2.db-wal',
  '.mark2/clones/',
  '.worktrees/',
];

const GITIGNORE_BLOCK = `
# Mark2 - Derived/recreatable data
# Database files (rebuilt from YAML on startup)
.mark2/mark2.db
.mark2/mark2.db-shm
.mark2/mark2.db-wal

# Git clones for task isolation (recreated when phases run)
.mark2/clones/

# Deprecated worktrees folder (replaced by clones)
.worktrees/
`;

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

  console.log(`Project: ${projectName}`);
  console.log(`Location: ${projectDir}`);
  console.log('');

  // Step 1: Create directory structure
  console.log('📁 Creating directory structure...');
  const dirs = ['tasks', 'stories', 'artifacts', 'storage'];
  for (const dir of dirs) {
    const dirPath = path.join(mark2Dir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`   ✓ Created .mark2/${dir}/`);
    } else {
      console.log(`   · .mark2/${dir}/ already exists`);
    }
  }
  console.log('');

  // Step 2: Copy template files
  console.log('📄 Setting up configuration files...');
  const templatesDir = path.join(__dirname, '..', 'templates');

  // Config
  const configPath = path.join(mark2Dir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    let config = fs.readFileSync(path.join(templatesDir, 'config.yaml'), 'utf-8');
    config = config.replace('project_name: ""', `project_name: "${projectName}"`);
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

  // Step 3: Initialize database
  console.log('🗄️  Initializing SQLite database...');
  initializeDatabase(mark2Dir);
  console.log('   ✓ Database ready at .mark2/mark2.db');
  console.log('   ℹ Database is rebuilt from YAML files on each startup');
  console.log('');

  // Step 4: Update .gitignore
  console.log('📝 Updating .gitignore...');
  const gitignorePath = path.join(projectDir, '.gitignore');
  updateGitignore(gitignorePath);
  console.log('');

  // Done!
  console.log('┌─────────────────────────────────────────┐');
  console.log('│         ✓ Mark2 initialized!            │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Edit .mark2/context.json to describe your project');
  console.log('  2. Run `mark2 start` to launch the dashboard');
  console.log('  3. Create your first task in the UI');
  console.log('');
}

function updateGitignore(gitignorePath: string): void {
  let content = '';
  let existingEntries: string[] = [];

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8');
    existingEntries = GITIGNORE_ENTRIES.filter(entry => content.includes(entry));
  }

  const missingEntries = GITIGNORE_ENTRIES.filter(entry => !content.includes(entry));

  if (missingEntries.length === 0) {
    console.log('   · .gitignore already has all Mark2 entries');
    return;
  }

  if (existingEntries.length > 0) {
    // Some entries exist, add only missing ones
    const entriesToAdd = missingEntries.join('\n');
    fs.appendFileSync(gitignorePath, `\n${entriesToAdd}\n`);
    console.log(`   ✓ Added ${missingEntries.length} missing entries to .gitignore:`);
    for (const entry of missingEntries) {
      console.log(`      + ${entry}`);
    }
  } else {
    // No entries exist, add the full block
    if (content.length > 0 && !content.endsWith('\n')) {
      fs.appendFileSync(gitignorePath, '\n');
    }
    fs.appendFileSync(gitignorePath, GITIGNORE_BLOCK);
    console.log('   ✓ Added Mark2 entries to .gitignore:');
    for (const entry of GITIGNORE_ENTRIES) {
      console.log(`      + ${entry}`);
    }
  }
}
