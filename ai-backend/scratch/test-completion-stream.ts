import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const { generateCompletionStream } = await import('../src/agent/llm');
  
  const system = "You are a helpful assistant.\n\nRetrieved knowledge base content:\n" + "a".repeat(10000);
  const messages = [{ role: 'user', content: 'Do you have service at Melbourne?' }];
  
  console.log('Testing generateCompletionStream with real parameters...');
  try {
    const stream = generateCompletionStream({
      system,
      messages,
      tools: [], // no tools for simplicity
      model: 'claude-2.1', // gets mapped to grokModel
      temperature: 0.25,
      maxTokens: 1024
    });
    
    let text = '';
    for await (const chunk of stream as any) {
      if (chunk.type === 'text') {
        text += chunk.text;
      }
      console.log('Chunk received:', chunk);
    }
    
    console.log('Total text generated:', text.length, 'chars');
    console.log('Generated text:', text);
  } catch (err: any) {
    console.error('Error during streaming:', err.message);
  }
  process.exit(0);
}

check();
