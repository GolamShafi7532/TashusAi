import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function check() {
  const keys = process.env.GROK_API_KEYS?.split(',') ?? [];
  const key = keys[0];
  
  const tools = [
    {
      type: 'function',
      function: {
        name: 'search_knowledge_base',
        description: 'Semantic search across knowledge base.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      }
    }
  ];

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
          { role: 'user', content: 'Do you have service at Melbourne?' }
        ],
        tools,
        tool_choice: 'auto',
        stream: true
      })
    });
    
    console.log('Status:', res.status);
    if (!res.body) {
      console.log('No body');
      return;
    }
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (value) {
        const text = decoder.decode(value);
        console.log(text);
      }
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

check();
