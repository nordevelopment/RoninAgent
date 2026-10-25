import { DatabaseClient } from '../backend/database/DatabaseClient.js';
import { MemoryManager } from '../backend/ai/MemoryManager.js';

const db = new DatabaseClient();
try {
  await db.initialize();
  const result = await new MemoryManager(db).reindexMissingVectors();
  console.log(`Indexed ${result.indexed} memories; skipped ${result.skipped}.`);
} finally {
  db.close();
}
