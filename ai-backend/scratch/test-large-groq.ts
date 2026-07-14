import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const keys = process.env.GROK_API_KEYS?.split(',') ?? [];
  const largeSystemPrompt = "a".repeat(15000); // around 3000 tokens
  
  for (const key of keys) {
    console.log(`Testing key: ...${key.slice(-6)}`);
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
          max_tokens: 10
        })
      });
      
      console.log('Status:', res.status);
      const text = await res.text();
      console.log('Body:', text.slice(0, 300));
    } catch (err: any) {
      console.error('Error:', err.message);
    }
  }
  process.exit(0);
}

check();
