/**
 * Re-embed all knowledge base entries and document chunks using the
 * configured embedding provider (v3.1.0 — Phase D.1.2).
 *
 * Run this script whenever you:
 *  - Switch embedding providers (e.g. mock → OpenAI)
 *  - Change the embedding model or dimension
 *  - Add new KB entries that were ingested with a different provider
 *
 * Usage:
 *   cd ai-backend
 *   npx tsx scripts/re-embed-kb.ts
 *
 * Prerequisites:
 *   - EMBEDDING_PROVIDER and EMBEDDING_PROVIDER_API_KEY set in .env.local
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in .env.local
 */

// Load env before anything else
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getEmbeddingProvider } from '../src/rag/embedding-provider';

const SUPABASE_URL              = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function reEmbedKnowledgeBase() {
  console.log('\n📚  Re-embedding knowledge base entries…');

  const embedder = getEmbeddingProvider();
  console.log(`   Provider: ${embedder.constructor.name}, dimension: ${embedder.dimension}`);

  // Fetch all active KB entries
  const { data: entries, error } = await supabase
    .from('ai_knowledge_base')
    .select('id, question, answer')
    .eq('is_active', true);

  if (error) {
    console.error('❌  Failed to fetch KB entries:', error.message);
    process.exit(1);
  }

  if (!entries || entries.length === 0) {
    console.log('   No active KB entries found — skipping.');
    return;
  }

  console.log(`   Found ${entries.length} active entries`);

  const BATCH_SIZE = 50;
  let updated = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    // Combine question + answer for a richer embedding signal
    const texts = batch.map((e: any) =>
      [e.question, e.answer].filter(Boolean).join('\n')
    );

    const embeddings = await embedder.embed(texts);

    for (let j = 0; j < batch.length; j++) {
      const { error: updateErr } = await supabase
        .from('ai_knowledge_base')
        .update({ embedding: embeddings[j] })
        .eq('id', batch[j].id);

      if (updateErr) {
        console.error(`   ⚠️  Failed to update KB entry ${batch[j].id}:`, updateErr.message);
      } else {
        updated++;
      }
    }

    console.log(`   Progress: ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length}`);
  }

  console.log(`   ✅  KB re-embedding complete — ${updated} entries updated`);
}

async function resetDocumentsForReIngestion() {
  console.log('\n📄  Resetting document statuses for re-ingestion…');

  const { data, error } = await supabase
    .from('ai_documents')
    .update({ status: 'pending' })
    .eq('status', 'ready')
    .select('id');

  if (error) {
    console.error('❌  Failed to reset document statuses:', error.message);
    return;
  }

  const count = data?.length ?? 0;
  if (count === 0) {
    console.log('   No ready documents found — skipping.');
  } else {
    console.log(`   ✅  ${count} documents reset to "pending" — they will be re-ingested on next worker run`);
    console.log('   ℹ️   Start the ingestion worker or use the admin panel "Re-Ingest All" button');
  }
}

async function main() {
  console.log('🔄  Tashus AI v3.1.0 — Re-Embedding Script');
  console.log('='.repeat(50));

  try {
    await reEmbedKnowledgeBase();
    await resetDocumentsForReIngestion();
    console.log('\n✅  Done. Run the ingestion worker to process pending documents.');
  } catch (err: any) {
    console.error('\n❌  Re-embedding failed:', err.message ?? err);
    process.exit(1);
  }
}

main();
