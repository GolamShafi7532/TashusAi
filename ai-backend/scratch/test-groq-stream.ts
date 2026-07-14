import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const keys = process.env.GROK_API_KEYS?.split(',') ?? [];
  const largeSystemPrompt = "a".repeat(15000); // around 3000 tokens
  
  for (const key of keys) {
    console.log(`\nTesting key: ...${key.slice(-6)}`);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: largeSystemPrompt },
            { role: 'user', content: 'Say hello' }
          ],
          max_tokens: 10,
          stream: true
        })
      });
      
      console.log('Status:', res.status);
      if (!res.body) {
        console.log('No body');
        continue;
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let count = 0;
      
      while (!done && count < 5) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const text = decoder.decode(value);
          console.log(`Chunk ${count}:`, text.slice(0, 200));
          count++;
        }
      }
    } catch (err: any) {
      console.error('Error:', err.message);
    }
  }
  process.exit(0);
}

check();
