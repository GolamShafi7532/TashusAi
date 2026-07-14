import { startIngestWorker } from './ingest-document.worker';
import { startSummarizeWorker } from './summarize-session.worker';

console.log('[Workers] Starting background workers...');

const ingestWorker = startIngestWorker();
const summarizeWorker = startSummarizeWorker();

console.log('[Workers] Ingestion and Summarization workers are active and listening.');

// Graceful shutdown
const shutdown = async () => {
  console.log('[Workers] Shutting down gracefully...');
  await Promise.all([
    ingestWorker.close(),
    summarizeWorker.close()
  ]);
  console.log('[Workers] Off.');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
