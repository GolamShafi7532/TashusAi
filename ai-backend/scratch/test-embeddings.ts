import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const { getEmbeddingProvider } = await import('../src/rag/embedding-provider');
  const { db } = await import('../src/db/client');
  
  try {
    const provider = getEmbeddingProvider();
    console.log('Embedding Provider:', provider.constructor.name, 'Dimension:', provider.dimension);
    
    const vec = await provider.embed(['test query']);
    console.log('Successfully generated embedding vector of length:', vec[0].length);
    
    console.log('Calling search_document_chunks RPC...');
    const { data, error } = await db.rpc('search_document_chunks', {
      query_embedding: vec[0],
      match_count: 1
    } as any) as any;
    
    if (error) {
      console.error('RPC Error:', error);
    } else {
      console.log('RPC Success. Returned chunks:', data);
    }
  } catch (err: any) {
    console.error('Error during check:', err.message || err);
  }
  process.exit(0);
}

check();
