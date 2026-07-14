import { env } from '@/lib/env';
import { callAnthropicCompletion, streamAnthropicMessages } from './anthropic';

/**
 * LLM helper: prefer GROK (user-provided keys) with failover between keys,
 * then fall back to Anthropic. Includes mock mode for development.
 * Supports both legacy synchronous completion and modern unified streaming.
 */

function getGrokHeaders(key: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
}

function isMockKey(key: string): boolean {
  if (!key) return true;
  return (
    /dummy|placeholder|example|test/i.test(key) ||
    key.startsWith('sk-ant-dummy-') ||
    key.includes('your-key-here')
  );
}

function shouldUseMockGrokKey(key: string) {
  return isMockKey(key);
}

async function tryGrok(prompt: string): Promise<string | null> {
  if (!env.GROK_API_KEYS) return null;

  const keys = env.GROK_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return null;

  // Development: only use mock responses for placeholder/dummy keys.
  if (env.NODE_ENV !== 'production' && shouldUseMockGrokKey(keys[0])) {
    console.log('[Grok] Using mock response (development mode)');
    return generateMockCompletion(prompt);
  }

  const base = env.GROK_API_BASE_URL ?? 'https://api.groq.com/openai';
  const url = `${base.replace(/\/$/, '')}/v1/chat/completions`;

  for (const key of keys) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: getGrokHeaders(key),
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 512,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '<no body>');
        console.warn(`[Grok] key failed status=${res.status} body=${txt}`);
        continue;
      }

      const data = await res.json().catch(() => null);
      if (!data) return null;

      const choice = data.choices?.[0];
      if (choice?.message?.content) return choice.message.content;
      return null;
    } catch (err) {
      console.warn('[Grok] request error', (err as Error).message);
      continue;
    }
  }

  return null;
}

function generateMockCompletion(prompt: string): string {
  // Mock responses based on keywords in the prompt
  const lower = prompt.toLowerCase();

  if (lower.includes('who are you') || lower.includes('name')) {
    return 'I\'m Tashus AI, your intelligent assistant for vehicle and voucher inquiries. I can help you search for available vehicles, check availability, validate vouchers, and answer questions about our services.';
  }

  if (lower.includes('tool')) {
    return 'I have access to several tools:\n- search_vehicles: Find cars by location and date\n- check_availability: Check booking availability\n- validate_voucher: Verify voucher details\n- search_knowledge_base: Search our knowledge base for answers';
  }

  if (lower.includes('sydney') || lower.includes('vehicle') || lower.includes('car')) {
    return 'I can help you find vehicles in Sydney! Based on our current inventory, we have several SUVs, sedans, and hatchbacks available this weekend. Would you like me to show you specific options or check availability for particular dates?';
  }

  if (lower.includes('cancel') || lower.includes('policy')) {
    return 'Our standard cancellation policy allows free cancellations up to 24 hours before the booking. Late cancellations (within 24 hours) may incur a fee of 10% of the booking total. For more details, please check our full terms and conditions.';
  }

  if (lower.includes('delivery') || lower.includes('cost') || lower.includes('price')) {
    return 'Delivery costs vary depending on your location. For metro areas, standard delivery is typically $20-50. Remote areas may have higher fees. I can provide a specific quote if you share your location.';
  }

  if (lower.includes('voucher') || lower.includes('discount')) {
    return 'We have several active vouchers available. Popular ones include SUMMER25 (25% off summer bookings), WEEKEND20 (20% off weekend rentals), and LOYALTY10 (10% for returning customers). Would you like details on any specific voucher?';
  }

  // Default helpful response
  return `I understand you're asking about: "${prompt.substring(0, 50)}..."\n\nAs the Tashus AI assistant, I'm here to help with:\n- Finding and booking vehicles\n- Checking availability\n- Validating promotions and vouchers\n- Answering questions about our services\n\nHow can I assist you today?`;
}


export async function generateCompletion(prompt: string): Promise<string> {
  const grokKeys = (env.GROK_API_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  const isGrokMock = grokKeys.length === 0 || grokKeys.every(isMockKey);
  const isAnthropicMock = isMockKey(env.ANTHROPIC_API_KEY ?? '');

  if (isGrokMock && isAnthropicMock) {
    return generateMockCompletion(prompt);
  }

  const grok = await tryGrok(prompt);
  if (grok) return grok;

  const anth = await callAnthropicCompletion(prompt);
  return anth ?? '';
}

function convertAnthropicToOpenAi(messages: any[]): any[] {
  const result: any[] = [];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      result.push({
        role: m.role === 'admin' ? 'assistant' : m.role,
        content: m.content
      });
    } else if (Array.isArray(m.content)) {
      let textContent = '';
      const toolCalls: any[] = [];
      let isToolResult = false;
      let toolResultId = '';
      let toolResultContent = '';

      for (const block of m.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input),
            }
          });
        } else if (block.type === 'tool_result') {
          isToolResult = true;
          toolResultId = block.tool_use_id;
          toolResultContent = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
        }
      }

      if (isToolResult) {
        result.push({
          role: 'tool',
          tool_call_id: toolResultId,
          content: toolResultContent
        });
      } else {
        const msg: any = {
          role: m.role === 'admin' ? 'assistant' : m.role,
          content: textContent || null
        };
        if (toolCalls.length > 0) {
          msg.tool_calls = toolCalls;
        }
        result.push(msg);
      }
    } else {
      result.push({
        role: m.role === 'admin' ? 'assistant' : m.role,
        content: String(m.content || '')
      });
    }
  }
  return result;
}

async function* tryGrokStream(
  system: string,
  messages: any[],
  tools: any[],
  model: string,
  temperature: number,
  maxTokens: number
) {
  if (!env.GROK_API_KEYS) return;

  const keys = env.GROK_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return;

  const base = env.GROK_API_BASE_URL ?? 'https://api.groq.com/openai';
  const url = `${base.replace(/\/$/, '')}/v1/chat/completions`;

  // Map Anthropic tools to OpenAI format for Grok
  const openAiTools = tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  const openAiMessages = [
    { role: 'system', content: system },
    ...convertAnthropicToOpenAi(messages),
  ];

  // Use Groq's best available model (llama-3.3-70b-versatile)
  const grokModel = 'llama-3.3-70b-versatile';

  console.log(`[Grok] Starting stream: model=${grokModel}, tools=${tools.map(t => t.name).join(', ')||'none'}, messages=${messages.length}`);
  for (const key of keys) {
    try {
      console.log(`[Grok] Trying key ...${key.slice(-6)} at ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: getGrokHeaders(key),
        body: JSON.stringify({
          model: grokModel,
          messages: openAiMessages,
          tools: openAiTools.length > 0 ? openAiTools : undefined,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '<no body>');
        console.warn(`[Grok] key failed status=${res.status} body=${txt}`);
        continue;
      }

      if (!res.body) continue;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentToolCall: { id: string; name: string; arguments: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned || cleaned === 'data: [DONE]') continue;
          if (cleaned.startsWith('data: ')) {
            try {
              const data = JSON.parse(cleaned.slice(6));
              if (data.error) {
                console.error('[Grok Stream Error]:', data.error);
                continue;
              }
              const choice = data.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta;
              if (delta.content) {
                yield { type: 'text' as const, text: delta.content };
              }

              if (delta.tool_calls && delta.tool_calls.length > 0) {
                const tc = delta.tool_calls[0];
                if (tc.function?.name) {
                  if (currentToolCall) {
                    try {
                      const args = JSON.parse(currentToolCall.arguments);
                      yield { type: 'tool_call' as const, name: currentToolCall.name, id: currentToolCall.id, args };
                    } catch {}
                  }
                  currentToolCall = {
                    id: tc.id || `grok-tc-${Date.now()}`,
                    name: tc.function.name,
                    arguments: tc.function.arguments || '',
                  };
                } else if (tc.function?.arguments && currentToolCall) {
                  currentToolCall.arguments += tc.function.arguments;
                }
              }

              if (choice.finish_reason === 'tool_calls' || (choice.finish_reason && currentToolCall)) {
                if (currentToolCall) {
                  try {
                    const args = JSON.parse(currentToolCall.arguments);
                    yield { type: 'tool_call' as const, name: currentToolCall.name, id: currentToolCall.id, args };
                  } catch (e) {
                    console.error('[Grok] Failed to parse tool call args:', currentToolCall.arguments);
                  }
                  currentToolCall = null;
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      if (currentToolCall) {
        try {
          const args = JSON.parse(currentToolCall.arguments);
          yield { type: 'tool_call' as const, name: currentToolCall.name, id: currentToolCall.id, args };
        } catch {}
      }

      return; // success, stop trying keys
    } catch (err) {
      console.warn('[Grok] request error', (err as Error).message);
      continue;
    }
  }

  throw new Error('All Grok keys failed in streaming mode');
}

async function* streamAnthropic(
  system: string,
  messages: any[],
  tools: any[],
  model: string,
  temperature: number,
  maxTokens: number
) {
  const stream = streamAnthropicMessages({
    model: model || 'claude-3-5-sonnet-20240620',
    system,
    messages,
    tools,
    temperature,
    max_tokens: maxTokens,
  });

  let currentToolCall: { id: string; name: string; arguments: string } | null = null;

  for await (const event of stream) {
    if (event.type === 'message_start') {
      const usage = (event.message as any).usage;
      if (usage) {
        yield {
          type: 'usage' as const,
          input_tokens: usage.input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
        };
      }
    } else if (event.type === 'message_delta') {
      const usage = (event as any).usage;
      if (usage) {
        yield {
          type: 'usage' as const,
          input_tokens: 0,
          output_tokens: usage.output_tokens || 0,
        };
      }
    } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
      currentToolCall = {
        id: event.content_block.id,
        name: event.content_block.name,
        arguments: '',
      };
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        yield { type: 'text' as const, text: event.delta.text };
      } else if (event.delta.type === 'input_json_delta' && currentToolCall) {
        currentToolCall.arguments += event.delta.partial_json;
      }
    } else if (event.type === 'content_block_stop') {
      if (currentToolCall) {
        try {
          const args = JSON.parse(currentToolCall.arguments);
          yield { type: 'tool_call' as const, name: currentToolCall.name, id: currentToolCall.id, args };
        } catch (e) {
          console.error('[Anthropic] Failed to parse tool call args:', currentToolCall.arguments);
        }
        currentToolCall = null;
      }
    }
  }
}


function formatFilterSummary(input: any): string {
  if (!input) return "available vehicles";
  
  const parts: string[] = [];
  
  // 1. Transmission / Fuel / Seats / Type
  const typeParts: string[] = [];
  if (input.tType) typeParts.push(input.tType.toLowerCase());
  if (input.fType) typeParts.push(input.fType.toLowerCase());
  if (input.seats) typeParts.push(`${input.seats}-seater`);
  if (input.cType) {
    typeParts.push(input.cType.toUpperCase() + 's');
  } else {
    typeParts.push("vehicles");
  }
  parts.push(typeParts.join(' '));

  // 2. City
  if (input.city) {
    parts.push(`in ${input.city}`);
  }

  // 3. Dates
  if (input.from) {
    try {
      const fromDate = new Date(input.from);
      const toDate = input.to ? new Date(input.to) : null;
      
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      const fromStr = fromDate.toLocaleDateString('en-US', options);
      
      if (toDate) {
        const toStr = toDate.toLocaleDateString('en-US', options);
        if (fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear()) {
          const toDay = toDate.getDate();
          parts.push(`for ${fromStr}-${toDay}`);
        } else {
          parts.push(`from ${fromStr} to ${toStr}`);
        }
      } else {
        parts.push(`on ${fromStr}`);
      }
    } catch {
      // ignore date format errors
    }
  }

  // 4. Max Price
  if (input.maxPrice) {
    parts.push(`under $${input.maxPrice}/day`);
  }

  return parts.join(' ');
}

/**
 * Smart mock that emits tool_call events so the full pipeline runs even
 * without valid LLM API keys. Used as final fallback.
 * On subsequent rounds (when tool results are already in messages), it
 * produces a formatted text response from those results.
 */
async function* generateToolAwareMock(
  messages: any[],
  tools: any[]
): AsyncGenerator<any> {

  // ── Check if any tool results already exist in the message history ──────────
  // If so, we're on round 2+ and should produce a text response from the data
  const toolResultMessages = messages.filter(
    (m) => m.role === 'user' && Array.isArray(m.content) &&
    m.content.some((c: any) => c.type === 'tool_result')
  );

  if (toolResultMessages.length > 0) {
    // Find the most recent tool result
    for (const msg of [...toolResultMessages].reverse()) {
      const toolResults = (msg.content as any[]).filter((c: any) => c.type === 'tool_result');
      for (const tr of toolResults) {
        const content = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
        
        // ── CASE A: Parse as vehicle search results ──────────────────────────
        try {
          const parsed = JSON.parse(content);
          const vehicles = Array.isArray(parsed) ? parsed : parsed?.results;
          if (Array.isArray(vehicles)) {
            if (vehicles.length === 0) {
              const noResultsMsg = "I couldn't find any vehicles matching your criteria. Try adjusting your dates, location, or filtering rules.";
              const chunks = noResultsMsg.match(/.{1,16}/gs) || [noResultsMsg];
              for (const chunk of chunks) {
                yield { type: 'text' as const, text: chunk };
                await new Promise((resolve) => setTimeout(resolve, 8));
              }
              return;
            }

            const tags: string[] = [];
            const shownVehicles = vehicles.slice(0, 10);
            
            for (const v of shownVehicles) {
              const id = v.listingId;
              const make = v.car?.make ?? 'Unknown';
              const model = v.car?.model ?? '';
              const year = v.car?.year ?? 2022;
              const dailyRate = v.rates?.dailyRates?.amount ?? 50;
              const seats = v.car?.seats ?? 5;
              const transmission = v.car?.transmissionType ?? 'Automatic';
              const imageUrl = v.photos?.coverPhoto?.imageInfo?.secure_url ?? '';
              
              const vehicleJson = JSON.stringify({
                id,
                make,
                model,
                year,
                dailyRate,
                seats,
                transmission,
                imageUrl
              });
              tags.push(`[VEHICLE: ${vehicleJson}]`);
            }
            
            let inputArgs: any = null;
            const lastToolCall = messages.find(m => 
              m.role === 'assistant' && Array.isArray(m.content) && 
              m.content.some((c: any) => c.type === 'tool_use' && c.name === 'search_vehicles')
            );
            
            if (lastToolCall) {
              const toolUse = lastToolCall.content.find((c: any) => c.type === 'tool_use' && c.name === 'search_vehicles');
              if (toolUse && toolUse.input) {
                inputArgs = toolUse.input;
              }
            }

            if (vehicles.length > 10) {
              const remaining = vehicles.length - 10;
              let searchUrl = '/search';
              
              if (inputArgs) {
                const queryParams = new URLSearchParams();
                if (inputArgs.city) queryParams.set('city', inputArgs.city);
                if (inputArgs.from) queryParams.set('from', inputArgs.from);
                if (inputArgs.to) queryParams.set('to', inputArgs.to);
                if (inputArgs.cType) queryParams.set('cType', inputArgs.cType);
                if (inputArgs.tType) queryParams.set('tType', inputArgs.tType);
                if (inputArgs.fType) queryParams.set('fType', inputArgs.fType);
                if (inputArgs.seats) queryParams.set('seats', String(inputArgs.seats));
                if (inputArgs.maxPrice) queryParams.set('maxPrice', String(inputArgs.maxPrice));
                searchUrl = `/search?${queryParams.toString()}`;
              }
              
              const viewMoreJson = JSON.stringify({
                type: 'view_more',
                remaining,
                searchUrl
              });
              tags.push(`[VEHICLE: ${viewMoreJson}]`);
            }
            
            const filterSummary = formatFilterSummary(inputArgs);
            const responseText = `Here are the available ${filterSummary} I found:\n\n` + tags.join(' ');
            console.log(`[LLM Mock] Generating rich card response with ${shownVehicles.length} cards + ${vehicles.length > 10 ? 'View More' : 'none'}`);
            
            const chunks = responseText.match(/.{1,16}/gs) || [responseText];
            for (const chunk of chunks) {
              yield { type: 'text' as const, text: chunk };
              await new Promise((resolve) => setTimeout(resolve, 8));
            }
            return;
          }
        } catch (e) {
          // Not vehicle search JSON — try details
        }
        
        // ── CASE B: Parse as individual vehicle details ──────────────────────
        try {
          const parsed = JSON.parse(content);
          if (parsed && parsed.listingId && parsed.car) {
            const make = parsed.car.make ?? 'Unknown';
            const model = parsed.car.model ?? '';
            const year = parsed.car.year ?? 2022;
            const type = parsed.car.carType ?? 'Vehicle';
            const seats = parsed.car.seats ?? 5;
            const transmission = parsed.car.transmissionType ?? 'Automatic';
            const fuel = parsed.car.fuelType ?? 'Petrol';
            const daily = parsed.rates?.dailyRates?.amount ?? 50;
            const mileage = parsed.car.mileage?.distance ? `${parsed.car.mileage.distance.toLocaleString()} ${parsed.car.mileage.units}` : 'Odometer not verified';
            const features = Array.isArray(parsed.features) ? parsed.features.slice(0, 5).join(', ') : 'None';
            const description = parsed.additionalInfos?.carDescription ?? '';
            const guidelines = parsed.additionalInfos?.guidelines ?? '';
            const instructions = parsed.location?.parkingInstructions ?? '';
            const host = parsed.hostInfo?.firstName ?? 'Host';
            const rating = parsed.hostInfo?.hostRatingCount > 0 
              ? (parsed.hostInfo.hostRatingTotal / parsed.hostInfo.hostRatingCount).toFixed(1)
              : 'No ratings yet';
            
            let details = `### **${make} ${model} (${year})**\n\n`;
            details += `🚗 **Specifications:**\n`;
            details += `• Type: ${type} | Seats: ${seats} | Transmission: ${transmission} | Fuel: ${fuel}\n`;
            details += `• Odometer: ${mileage}\n`;
            details += `• Highlight Features: ${features}\n\n`;
            details += `💰 **Rates & Excess:**\n`;
            details += `• Daily rental: $${daily} AUD/day\n\n`;
            
            if (description) {
              const cleanDesc = description.replace(/<[^>]*>/g, '').trim();
              details += `📝 **About the Vehicle:**\n"${cleanDesc.slice(0, 200)}..."\n\n`;
            }
            if (guidelines) {
              details += `📋 **Rules & Guidelines:**\n"${guidelines.slice(0, 200)}..."\n\n`;
            }
            if (instructions) {
              details += `📍 **Parking Instructions:**\n"${instructions.slice(0, 200)}"\n\n`;
            }
            
            details += `👤 **Host Info:** Managed by **${host}** (${rating} ⭐)\n\n`;
            details += `🔗 [Click here to book this vehicle](https://tashus.com/search?listingId=${parsed.listingId})`;

            const chunks = details.match(/.{1,16}/gs) || [details];
            for (const chunk of chunks) {
              yield { type: 'text' as const, text: chunk };
              await new Promise((resolve) => setTimeout(resolve, 8));
            }
            return;
          }
        } catch (e) {
          // Not details JSON
        }
        
        // ── CASE C: Summarise other tool results (e.g. vouchers, KB) ──────────
        if (content && content !== 'null' && !content.includes('"error"')) {
          const summary = `Here's the details:\n\n${content.slice(0, 800)}`;
          const chunks = summary.match(/.{1,16}/gs) || [summary];
          for (const chunk of chunks) {
            yield { type: 'text' as const, text: chunk };
            await new Promise((resolve) => setTimeout(resolve, 8));
          }
          return;
        }
      }
    }

    // Default error boundary
    const errorResponse = "I checked the live data but didn't find any results matching your request.";
    const chunks = errorResponse.match(/.{1,16}/gs) || [errorResponse];
    for (const chunk of chunks) {
      yield { type: 'text' as const, text: chunk };
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    return;
  }

  // ── First round: no tool results yet — decide which tool to call ────────────
  const originalUserMsg = messages.find((m) => m.role === 'user')?.content ?? '';
  const text = (typeof originalUserMsg === 'string' ? originalUserMsg : JSON.stringify(originalUserMsg)).toLowerCase();

  const hasTools = tools.length > 0;

  if (hasTools) {
    // ── CASE 1: Individual Vehicle Details ───────────────────────────────────
    const idMatch = text.match(/\b(10\d{2})\b/);
    if (idMatch && (text.includes('detail') || text.includes('about') || text.includes('info') || text.includes('show') || text.includes('tell me') || text.includes('guidelines') || text.includes('rules'))) {
      const listingId = parseInt(idMatch[1], 10);
      console.log(`[LLM Mock] Emitting tool_call: get_vehicle_details { listingId: ${listingId} }`);
      yield {
        type: 'tool_call' as const,
        id: `mock-tc-${Date.now()}`,
        name: 'get_vehicle_details',
        args: { listingId },
      };
      return;
    }

    // ── CASE 2: Vehicle Search ───────────────────────────────────────────────
    if (
      text.includes('suv') || text.includes('car') || text.includes('vehicle') ||
      text.includes('available') || text.includes('show me') || text.includes('find') ||
      text.includes('book') || text.includes('sydney') || text.includes('melbourne') ||
      text.includes('brisbane') || text.includes('perth') || text.includes('adelaide') ||
      text.includes('ute') || text.includes('hatchback') || text.includes('sedan')
    ) {
      const cityMatch = text.match(/\b(sydney|melbourne|brisbane|perth|adelaide|canberra|darwin|hobart)\b/i);
      const city = cityMatch ? cityMatch[1].charAt(0).toUpperCase() + cityMatch[1].slice(1) : 'Sydney';

      // Advanced filters extraction
      let cType: string | undefined;
      if (text.includes('suv')) cType = 'SUV';
      else if (text.includes('sedan')) cType = 'Sedan';
      else if (text.includes('hatchback')) cType = 'Hatchback';
      else if (text.includes('ute')) cType = 'Ute';
      else if (text.includes('van')) cType = 'Van';
      else if (text.includes('wagon')) cType = 'Wagon';

      let tType: string | undefined;
      if (text.includes('automatic') || text.includes('auto')) tType = 'Automatic';
      else if (text.includes('manual')) tType = 'Manual';

      let fType: string | undefined;
      if (text.includes('petrol')) fType = 'Petrol';
      else if (text.includes('diesel')) fType = 'Diesel';
      else if (text.includes('electric') || text.includes('ev')) fType = 'Electric';
      else if (text.includes('hybrid')) fType = 'Hybrid';

      let seats: number | undefined;
      const seatsMatch = text.match(/\b(\d)\s*(?:seats?|seater)\b/);
      if (seatsMatch) {
        seats = parseInt(seatsMatch[1], 10);
      }

      let maxPrice: number | undefined;
      const priceMatch = text.match(/\b(?:under|below|less than|max)\s*(\d{2,3})\b/);
      if (priceMatch) {
        maxPrice = parseInt(priceMatch[1], 10);
      }

      const now = new Date();
      let fromDate = new Date(now);
      let toDate = new Date(now);

      const monthDayMatch = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i);

      if (monthDayMatch) {
        const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const monthIdx = monthNames.findIndex((m) => monthDayMatch[1].toLowerCase().startsWith(m));
        const day = parseInt(monthDayMatch[2], 10);
        fromDate = new Date(now.getFullYear(), monthIdx, day, 10, 0, 0);
        toDate = new Date(now.getFullYear(), monthIdx, day + 1, 10, 0, 0);
      } else if (text.includes('weekend')) {
        const dayOfWeek = now.getDay();
        const daysToSat = (6 - dayOfWeek + 7) % 7 || 7;
        fromDate = new Date(now); fromDate.setDate(now.getDate() + daysToSat); fromDate.setHours(10,0,0,0);
        toDate = new Date(fromDate); toDate.setDate(fromDate.getDate() + 2);
      } else {
        fromDate.setDate(now.getDate() + 1); fromDate.setHours(10,0,0,0);
        toDate.setDate(now.getDate() + 2); toDate.setHours(10,0,0,0);
      }

      console.log(`[LLM Mock] Emitting tool_call: search_vehicles { city: ${city}, cType: ${cType}, tType: ${tType}, seats: ${seats}, maxPrice: ${maxPrice} }`);

      yield {
        type: 'tool_call' as const,
        id: `mock-tc-${Date.now()}`,
        name: 'search_vehicles',
        args: {
          city,
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          currentDateTime: now.toISOString(),
          ...(cType && { cType }),
          ...(tType && { tType }),
          ...(fType && { fType }),
          ...(seats && { seats }),
          ...(maxPrice && { maxPrice }),
        },
      };
      return;
    }

    // ── CASE 3: Voucher Validation ───────────────────────────────────────────
    if (text.includes('voucher') || text.includes('promo') || text.includes('discount') || text.includes('code')) {
      const slugMatch = text.match(/\b([A-Z0-9]{4,20})\b/);
      if (slugMatch) {
        yield { type: 'tool_call' as const, id: `mock-tc-${Date.now()}`, name: 'validate_voucher', args: { voucherSlug: slugMatch[1].toLowerCase() } };
        return;
      }
    }

    // ── CASE 4: Default Knowledge Base ───────────────────────────────────────
    yield { type: 'tool_call' as const, id: `mock-tc-${Date.now()}`, name: 'search_knowledge_base', args: { query: originalUserMsg } };
    return;
  }

  // No tools — plain text response
  const response = generateMockCompletion(typeof originalUserMsg === 'string' ? originalUserMsg : '');
  const chunks = response.match(/.{1,8}/g) || [response];
  for (const chunk of chunks) {
    yield { type: 'text' as const, text: chunk };
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}




/**
 * Unified stream helper for both Grok and Anthropic.
 * Yields either text segments or structured tool calls.
 * Falls back to tool-aware mock if all real providers fail.
 */
export async function* generateCompletionStream(params: {
  system: string;
  messages: any[];
  tools: any[];
  model: string;
  temperature: number;
  maxTokens: number;
}) {
  const grokKeys = (env.GROK_API_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  const isGrokMock = grokKeys.length === 0 || grokKeys.every(isMockKey);
  const isAnthropicMock = !env.ANTHROPIC_API_KEY || isMockKey(env.ANTHROPIC_API_KEY ?? '');

  if (isGrokMock && isAnthropicMock) {
    console.log('[LLM] ⚠️  No real LLM keys configured — using tool-aware mock (tools WILL be called)');
    yield* generateToolAwareMock(params.messages, params.tools);
    return;
  }

  console.log(`[LLM] Using REAL LLM: grokMock=${isGrokMock}, anthropicMock=${isAnthropicMock}`);

  if (env.GROK_API_KEYS && !isGrokMock) {
    try {
      console.log('[LLM] → Sending to Grok (real API call)');
      for await (const chunk of tryGrokStream(
        params.system,
        params.messages,
        params.tools,
        params.model,
        params.temperature,
        params.maxTokens
      )) {
        yield chunk;
      }
      console.log('[LLM] ← Grok stream complete');
      return;
    } catch (e) {
      console.warn('[LLM] Grok stream failed:', (e as Error).message);
    }
  }

  if (!isAnthropicMock) {
    try {
      console.log('[LLM] → Sending to Anthropic (real API call)');
      for await (const chunk of streamAnthropic(
        params.system,
        params.messages,
        params.tools,
        params.model,
        params.temperature,
        params.maxTokens
      )) {
        yield chunk;
      }
      console.log('[LLM] ← Anthropic stream complete');
      return;
    } catch (e) {
      console.warn('[LLM] Anthropic stream failed:', (e as Error).message);
    }
  }

  // All real providers failed — fall back to tool-aware mock
  console.warn('[LLM] ⚠️  All LLM providers failed — falling back to tool-aware mock');
  yield* generateToolAwareMock(params.messages, params.tools);
}

export default { generateCompletion, generateCompletionStream };

