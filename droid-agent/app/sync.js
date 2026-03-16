import { fileURLToPath } from 'url';
import { runSyncAgent } from './agent.js';

export async function runSync(emitter) {
  return await runSyncAgent(emitter);
}

// Standalone mode
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Droid Agent Sync                           ║');
  console.log('║  Discovering your infrastructure...      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  runSync(null).then(({ filesWritten }) => {
    console.log('');
    console.log('────────────────────────────────────');
    console.log(`Sync complete. ${filesWritten.length} files written:`);
    for (const f of filesWritten) {
      console.log(`  → memory/${f}`);
    }
    console.log('────────────────────────────────────');
  }).catch(err => {
    console.error('Sync failed:', err.message);
    process.exit(1);
  });
}
