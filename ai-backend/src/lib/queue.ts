/**
 * BullMQ queue and worker registration.
 * All background jobs in the AI ecosystem go through this module.
 *
 * Current jobs:
 *   - ingest-document  : PDF parse → chunk → embed → store (Phase 2)
 *   - summarize-session: Rolling conversation summary (Phase 2)
 *
 * Source of truth: AI Chatbot blueprint.md §3.3 (ingestion) & §3.4 (summarization)
 */
import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis';

// ── Queue names ────────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
  INGEST_DOCUMENT: 'ingest-document',
  SUMMARIZE_SESSION: 'summarize-session',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ── Shared BullMQ connection config ───────────────────────────────────────────
const connection = getRedisClient();

// ── Queue instances (singletons) ──────────────────────────────────────────────
let _ingestQueue: Queue | null = null;
let _summarizeQueue: Queue | null = null;

export function getIngestQueue(): Queue {
  if (_ingestQueue) return _ingestQueue;
  _ingestQueue = new Queue(QUEUE_NAMES.INGEST_DOCUMENT, {
    connection: connection as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s, 4s, 8s
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
  return _ingestQueue;
}

export function getSummarizeQueue(): Queue {
  if (_summarizeQueue) return _summarizeQueue;
  _summarizeQueue = new Queue(QUEUE_NAMES.SUMMARIZE_SESSION, {
    connection: connection as any,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 1000 },
      // Summarization is low-priority / fire-and-forget
      priority: 10,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  });
  return _summarizeQueue;
}

// ── Job payload types ──────────────────────────────────────────────────────────
export interface IngestDocumentJobData {
  documentId: string;
}

export interface SummarizeSessionJobData {
  sessionId: string;
}

// ── Enqueue helpers ───────────────────────────────────────────────────────────

/** Enqueue a document ingestion job after upload */
export async function enqueueIngestDocument(documentId: string): Promise<Job> {
  const queue = getIngestQueue();
  return queue.add(
    QUEUE_NAMES.INGEST_DOCUMENT,
    { documentId } satisfies IngestDocumentJobData,
    { jobId: `ingest-${documentId}` } // idempotent: re-enqueue is safe
  );
}

/** Fire-and-forget: enqueue background session summarization */
export async function enqueueSummarizeSession(sessionId: string): Promise<void> {
  const queue = getSummarizeQueue();
  // deduplicate: only one summarize job per session at a time
  await queue.add(
    QUEUE_NAMES.SUMMARIZE_SESSION,
    { sessionId } satisfies SummarizeSessionJobData,
    { jobId: `summarize-${sessionId}`, priority: 10 }
  );
}

// ── QueueEvents (for status monitoring in admin panel) ────────────────────────
let _ingestEvents: QueueEvents | null = null;

export function getIngestQueueEvents(): QueueEvents {
  if (_ingestEvents) return _ingestEvents;
  _ingestEvents = new QueueEvents(QUEUE_NAMES.INGEST_DOCUMENT, { connection: connection as any });
  return _ingestEvents;
}

// ── Worker factory (called from run-workers.ts, NOT from Next.js routes) ──────
/**
 * Create and start a worker for a given queue.
 * Workers run in a separate process (src/workers/run-workers.ts).
 * They are NEVER instantiated inside Next.js route handlers.
 */
export function createWorker<T>(
  queueName: QueueName,
  processor: (job: Job<T>) => Promise<void>,
  concurrency = 2
): Worker {
  const worker = new Worker<T>(queueName, processor, {
    connection: connection as any,
    concurrency,
  });

  worker.on('completed', (job) => {
    console.log(`[Worker:${queueName}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:${queueName}] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
