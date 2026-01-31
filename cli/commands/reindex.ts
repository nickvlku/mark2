import path from 'path';
import { initializeDatabase, getDb } from '../../src/lib/db';

export async function reindexCommand(projectDir: string = process.cwd()): Promise<void> {
  const mark2Dir = path.join(projectDir, '.mark2');

  console.log('Reindexing Mark2 database...');

  // Re-initialize the database (creates tables if needed)
  initializeDatabase(mark2Dir);

  // Import and run the reindex service
  const { ReindexService } = await import('../../src/lib/services/reindex-service');
  const service = new ReindexService(mark2Dir);
  const result = await service.fullReindex();

  console.log(`  Tasks indexed: ${result.tasks_indexed}`);
  console.log(`  Stories indexed: ${result.stories_indexed}`);
  console.log(`  Activities indexed: ${result.activities_indexed}`);

  if (result.errors.length > 0) {
    console.log(`\n  Errors (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`    ${err.file_path}: ${err.error}`);
    }
  }

  console.log('\nReindex complete.');
}
