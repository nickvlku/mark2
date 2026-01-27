import fs from 'fs';
import path from 'path';
import { initializeDatabase } from '../../src/lib/db';

export async function initCommand(projectDir: string = process.cwd()): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');

  console.log('Initializing Mark2 project...');

  // Create directory structure
  const dirs = ['tasks', 'stories', 'artifacts'];
  for (const dir of dirs) {
    const dirPath = path.join(mark2Dir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`  Created ${path.relative(projectDir, dirPath)}/`);
    }
  }

  // Copy template files
  const templatesDir = path.join(__dirname, '..', 'templates');

  // Determine project name from directory
  const projectName = path.basename(projectDir);

  // Config
  const configPath = path.join(mark2Dir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    let config = fs.readFileSync(path.join(templatesDir, 'config.yaml'), 'utf-8');
    config = config.replace('project_name: ""', `project_name: "${projectName}"`);
    fs.writeFileSync(configPath, config);
    console.log('  Created .mark2/config.yaml');
  }

  // Agents
  const agentsPath = path.join(mark2Dir, 'agents.yaml');
  if (!fs.existsSync(agentsPath)) {
    fs.copyFileSync(path.join(templatesDir, 'agents.yaml'), agentsPath);
    console.log('  Created .mark2/agents.yaml');
  }

  // Context
  const contextPath = path.join(mark2Dir, 'context.json');
  if (!fs.existsSync(contextPath)) {
    fs.copyFileSync(path.join(templatesDir, 'context.json'), contextPath);
    console.log('  Created .mark2/context.json');
  }

  // Initialize SQLite database
  initializeDatabase(mark2Dir);
  console.log('  Initialized SQLite database (.mark2/mark2.db)');

  // Add mark2.db to .gitignore
  const gitignorePath = path.join(projectDir, '.gitignore');
  const gitignoreEntry = '.mark2/mark2.db';
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(gitignoreEntry)) {
      fs.appendFileSync(gitignorePath, `\n# Mark2 database (derived from YAML files)\n${gitignoreEntry}\n`);
      console.log('  Added mark2.db to .gitignore');
    }
  } else {
    fs.writeFileSync(gitignorePath, `# Mark2 database (derived from YAML files)\n${gitignoreEntry}\n`);
    console.log('  Created .gitignore with mark2.db entry');
  }

  console.log('\nMark2 initialized successfully!');
  console.log('Run `mark2 start` to launch the server.');
}
