import { getUnanalyzedConversations, saveLearnerRun, getLastLearnerRun } from './db.js';
import { readMemory, writeMemory } from './memory.js';
import { createCompletion } from './provider.js';

const LEARNER_ENABLED = (process.env.LEARNER_ENABLED || 'true').toLowerCase() === 'true';
const LEARNER_INTERVAL_MS = parseInt(process.env.LEARNER_INTERVAL_MS) || 3600000; // 1 hour
const LEARNER_MIN_MESSAGES = parseInt(process.env.LEARNER_MIN_MESSAGES) || 4;

let intervalHandle = null;

const LEARNER_SYSTEM_PROMPT = `You are a learning agent that analyzes past debugging/investigation conversations. Your job is to extract reusable knowledge.

For each conversation, extract:
1. Issue type (OOM, deployment failure, network issue, latency spike, etc.)
2. Investigation pattern (what was checked, in what order)
3. Root cause found (if any)
4. Resolution applied (if any)
5. Key commands that were useful

Output a concise markdown entry. Each entry should be a few lines, not a full page. Focus on what would be useful for debugging a similar issue in the future.`;

export async function runLearnerCycle() {
  console.log('[learner] Starting learning cycle...');

  const conversations = await getUnanalyzedConversations(LEARNER_MIN_MESSAGES, 20);

  if (conversations.length === 0) {
    console.log('[learner] No new conversations to analyze');
    return { conversationsAnalyzed: 0, filesWritten: [] };
  }

  console.log(`[learner] Found ${conversations.length} conversations to analyze`);

  const analyses = [];
  let maxMessageId = 0;

  for (const conv of conversations) {
    const messages = conv.messages || [];
    const messageIds = conv.message_ids || [];
    maxMessageId = Math.max(maxMessageId, ...messageIds);

    // Build transcript
    const transcript = messages
      .map(m => `[${m.role}]: ${(m.content || '').substring(0, 500)}`)
      .join('\n');

    try {
      const analysis = await createCompletion({
        system: LEARNER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Analyze this investigation conversation:\n\n${transcript}` }],
        maxTokens: 1024
      });
      analyses.push(analysis);
    } catch (err) {
      console.error(`[learner] Failed to analyze conversation ${conv.conversation_id}: ${err.message}`);
    }
  }

  if (analyses.length === 0) {
    console.log('[learner] No analyses produced');
    return { conversationsAnalyzed: 0, filesWritten: [] };
  }

  // Read existing learned files
  const existingPatterns = await readMemory('learned/patterns.md') || '';
  const existingSummaries = await readMemory('learned/investigation-summaries.md') || '';

  // Ask model to merge new analyses with existing knowledge
  try {
    const merged = await createCompletion({
      system: `You merge investigation analyses into a knowledge base. Output clean markdown. Keep the most recent and useful 50 entries. Deduplicate similar issues. Use headers and bullet points.`,
      messages: [{
        role: 'user',
        content: `EXISTING PATTERNS:\n${existingPatterns || '(empty)'}\n\nEXISTING SUMMARIES:\n${existingSummaries || '(empty)'}\n\nNEW ANALYSES:\n${analyses.join('\n---\n')}\n\nMerge the new analyses into the existing files. Output TWO sections separated by ===SPLIT===:\n\nSection 1: Updated patterns.md (investigation patterns, useful commands, common root causes)\nSection 2: Updated investigation-summaries.md (brief summaries of each past investigation)`
      }],
      maxTokens: 4096
    });

    const parts = merged.split('===SPLIT===');
    const filesWritten = [];

    if (parts[0]?.trim()) {
      await writeMemory('learned/patterns.md', parts[0].trim());
      filesWritten.push('learned/patterns.md');
    }
    if (parts[1]?.trim()) {
      await writeMemory('learned/investigation-summaries.md', parts[1].trim());
      filesWritten.push('learned/investigation-summaries.md');
    }

    // Save learner run
    await saveLearnerRun({
      lastMessageId: maxMessageId,
      conversationsAnalyzed: conversations.length,
      filesWritten
    });

    console.log(`[learner] Cycle complete: analyzed ${conversations.length} conversations, wrote ${filesWritten.length} files`);
    return { conversationsAnalyzed: conversations.length, filesWritten };
  } catch (err) {
    console.error(`[learner] Merge failed: ${err.message}`);
    return { conversationsAnalyzed: 0, filesWritten: [], error: err.message };
  }
}

export function startLearner() {
  if (!LEARNER_ENABLED) {
    console.log('[learner] Disabled via LEARNER_ENABLED=false');
    return;
  }

  console.log(`[learner] Started — runs every ${LEARNER_INTERVAL_MS / 1000}s`);

  // Run first cycle after a delay (let the system settle)
  setTimeout(() => {
    runLearnerCycle().catch(err => console.error('[learner] Cycle error:', err.message));
  }, 30000);

  // Then run periodically
  intervalHandle = setInterval(() => {
    runLearnerCycle().catch(err => console.error('[learner] Cycle error:', err.message));
  }, LEARNER_INTERVAL_MS);
}

export function stopLearner() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
