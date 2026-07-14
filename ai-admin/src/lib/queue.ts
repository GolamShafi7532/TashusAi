import { Queue } from 'bullmq';
import { getRedisClient } from './redis';

const connection = getRedisClient();

let _ingestQueue: Queue | null = null;

export function getIngestQueue(): Queue {
  if (_ingestQueue) return _ingestQueue;
  _ingestQueue = new Queue('ingest-document', {
    connection: connection as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
  return _ingestQueue;
}

export async function enqueueIngestDocument(documentId: string): Promise<any> {
  const queue = getIngestQueue();
  return queue.add(
    'ingest-document',
    { documentId },
    { jobId: `ingest-${documentId}` }
  );
}
