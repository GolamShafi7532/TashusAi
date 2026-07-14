import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const { getEmbeddingProvider } = await import('../src/rag/embedding-provider');
  const { db } = await import('../src/db/client');
  
  const provider = getEmbeddingProvider();
  
  const query = "Do you have service at Melbourne?";
  const storedText = `Question: Do you have service at Melbourne?\nAnswer: No, we do not have any service in Melbourne right now. We only have service in Sydney.`;
  
  const [vecQuery] = await provider.embed([query]);
  const [vecStored] = await provider.embed([storedText]);
  
  console.log('Querying with the query text...');
  const { data: res1 } = await db.rpc('search_knowledge_base', {
    query_embedding: vecQuery,
    similarity_threshold: 0.1,
    match_count: 5
  } as any) as any;
  console.log('Results with query text:', res1);
  
  console.log('\nQuerying with the exact stored text...');
  const { data: res2 } = await db.rpc('search_knowledge_base', {
    query_embedding: vecStored,
    similarity_threshold: 0.1,
    match_count: 5
  } as any) as any;
  console.log('Results with stored text:', res2);
  
  process.exit(0);
}

check();
