import path from 'path';
import fs from 'fs';
import { StateBranchService } from '../../src/lib/services/state-branch-service';
import { ReindexService } from '../../src/lib/services/reindex-service';
import { initializeDatabase } from '../../src/lib/db';

export async function syncCommand(
  projectDir: string = process.cwd(),
  options: { push?: boolean } = {}
): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');

  if (!fs.existsSync(mark2Dir)) {
    console.error('Error: .mark2 not found. Run `mark2 init` first.');
    process.exit(1);
  }

  const stateBranch = new StateBranchService(mark2Dir);

  if (options.push) {
    console.log('Pushing local changes to remote...');
    try {
      await stateBranch.ensureWorktree();
      await stateBranch.push('Manual sync push');
      console.log('  Push complete.');
    } catch (e: any) {
      console.error(`  Error: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log('Syncing state from remote...');
    try {
      // Initialize database first
      initializeDatabase(mark2Dir);

      // Pull and reindex
      const reindexService = new ReindexService(mark2Dir, stateBranch);
      const result = await reindexService.fullReindex();

      if (result.sync_result) {
        if (result.sync_result.updated) {
          console.log(`  ${result.sync_result.message}`);
        } else {
          console.log(`  ${result.sync_result.message}`);
        }
      }

      console.log(`  Tasks: ${result.tasks_indexed}`);
      console.log(`  Stories: ${result.stories_indexed}`);
      console.log(`  Activities: ${result.activities_indexed}`);

      if (result.errors.length > 0) {
        console.log(`\n  Warnings (${result.errors.length}):`);
        for (const err of result.errors.slice(0, 5)) {
          console.log(`    ${path.basename(err.file_path)}: ${err.error}`);
        }
        if (result.errors.length > 5) {
          console.log(`    ... and ${result.errors.length - 5} more`);
        }
      }

      console.log('\nSync complete.');
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  }
}
