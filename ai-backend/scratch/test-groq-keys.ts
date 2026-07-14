import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const keys = process.env.GROK_API_KEYS?.split(',') ?? [];
  console.log('Found keys:', keys.length);
  
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
          messages: [{ role: 'user', content: 'Say hello' }],
          max_tokens: 10
        })
      });
      
      console.log('Status:', res.status);
      const text = await res.text();
      console.log('Body:', text);
    } catch (err: any) {
      console.error('Error:', err.message);
    }
  }
  process.exit(0);
}

check();
