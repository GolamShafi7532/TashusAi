/**
 * AGENT_TOOLS registry and dispatcher.
 * Maps tool names to typed schemas and dispatch functions that call the
 * tashus-adapter endpoints. This file implements the minimal dispatch
 * required by the orchestrator to call allow-listed Tashus endpoints.
 *
 * v3.1.0 Changes:
 *  - Removed all ['string', 'null'] union types (causes Groq to inject literal "null" strings)
 *  - Added `additionalProperties: false` on every tool schema (rejects unknown params)
 *  - Added explicit semantic descriptions for minSeats (floor limit) and maxPrice (ceiling)
 *  - Renamed `seats` → `minSeats` to clarify floor-limit semantics
 *  - Added CRITICAL instructions in search_vehicles description to prevent guessing
 */
import * as adapter from '@/integrations/tashus-adapter';
import { searchKnowledgeBaseTool } from '@/rag/retriever';

export type ToolSchema = {
  name: string;
  description: string;
  input_schema: unknown;
};

export const AGENT_TOOLS: ToolSchema[] = [
  {
    name: 'search_vehicles',
    description: `Search live Tashus vehicle inventory by location, date range, and optional filters.

RULES:
- DEFAULT city is always "Sydney" — NEVER ask the user for location unless they explicitly mention a different city
- If the user has NOT specified dates, use tomorrow's date as the default pickup (from = tomorrow 9am local time, to = day after tomorrow 9am local time)
- All filtering (price, seats, type) happens server-side — pass the raw criteria directly
- minSeats is a FLOOR LIMIT (e.g. minSeats=5 returns 5, 7, and 8-seater vehicles)
- maxPrice is a CEILING (e.g. maxPrice=120 returns vehicles at $120/day or cheaper)
- Always call this tool when the user asks for any vehicle, car, SUV, etc — do NOT ask clarifying questions first`,

    input_schema: {
      type: 'object',
      properties: {
        // Location — at least city OR lat+long is expected
        city: {
          type: 'string',
          description: 'City name for pickup location (e.g. "Sydney", "Melbourne"). Defaults to "Sydney" if not specified by user.',
        },
        country: {
          type: 'string',
          description: 'Country code (e.g. "au" for Australia). Defaults to "au".',
        },
        region: {
          type: 'string',
          description: 'State/region code (e.g. "nsw", "vic", "qld"). Optional but narrows results.',
        },
        postcode: {
          type: 'string',
          description: 'Postal/ZIP code for pickup location.',
        },
        lat: {
          type: 'number',
          description: 'Latitude for geolocation search. Use with long.',
        },
        long: {
          type: 'number',
          description: 'Longitude for geolocation search. Use with lat.',
        },

        // Dates — both are required by the API
        from: {
          type: 'string',
          format: 'date-time',
          description: 'Pickup datetime in ISO 8601 format (UTC). REQUIRED. Calculate from the user timezone context injected at the top of the system prompt.',
        },
        to: {
          type: 'string',
          format: 'date-time',
          description: 'Return datetime in ISO 8601 format (UTC). REQUIRED. Must be after "from".',
        },

        // Optional filters — server applies these, never ask LLM to do math
        cType: {
          type: 'string',
          enum: ['SUV', 'Sedan', 'Hatchback', 'Ute', 'Van', 'Convertible', 'Coupe', 'Wagon'],
          description: 'Vehicle category filter. Pass as-is from user query.',
        },
        tType: {
          type: 'string',
          enum: ['Automatic', 'Manual'],
          description: 'Transmission type filter.',
        },
        fType: {
          type: 'string',
          enum: ['Petrol', 'Diesel', 'Electric', 'Hybrid'],
          description: 'Fuel type filter.',
        },
        minSeats: {
          type: 'number',
          description: 'MINIMUM passenger seats required (floor limit, not exact match). E.g. minSeats=5 returns 5, 7, 8-seater vehicles. If user says "5-seater", pass minSeats=5.',
        },
        maxPrice: {
          type: 'number',
          description: 'Maximum daily rate in AUD (ceiling). Server filters out vehicles exceeding this. If user says "under $120", pass maxPrice=120.',
        },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },

  {
    name: 'get_vehicle_details',
    description: 'Fetch complete specifications, description, guidelines, features, host info, and usage restrictions for a specific vehicle listing ID.',
    input_schema: {
      type: 'object',
      properties: {
        listingId: {
          type: 'number',
          description: 'The unique listing ID of the vehicle returned in search results (e.g. 1022).',
        },
      },
      required: ['listingId'],
      additionalProperties: false,
    },
  },

  {
    name: 'check_availability',
    description: 'Fetch block-dates for a specific vehicle listing to confirm live availability. Call this after finding a vehicle the user is interested in.',
    input_schema: {
      type: 'object',
      properties: {
        carListingId: {
          type: 'number',
          description: 'The vehicle listing ID to check availability for.',
        },
      },
      required: ['carListingId'],
      additionalProperties: false,
    },
  },

  {
    name: 'validate_voucher',
    description: 'Look up a voucher by its public slug to confirm terms and eligibility. NEVER applies or redeems it — read-only lookup only.',
    input_schema: {
      type: 'object',
      properties: {
        voucherSlug: {
          type: 'string',
          description: 'The voucher code slug (e.g. "SUMMER25"). Case-insensitive.',
        },
      },
      required: ['voucherSlug'],
      additionalProperties: false,
    },
  },

  {
    name: 'search_knowledge_base',
    description: 'Semantic search across rental policies, FAQs, and uploaded guidelines. Only call this if the information is NOT already present in your context from the system prompt.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The policy or FAQ question to search for (e.g. "What is the cancellation policy?").',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },

  {
    name: 'escalate_to_human',
    description: `Escalate the conversation to a human support agent. Call this tool IMMEDIATELY whenever the user:
- asks for a human, agent, person, representative, or staff member
- says "human support", "human assistance", "speak to someone", "talk to a human", "connect me to an agent"
- expresses frustration or says they want to stop talking to the AI
- uses any variation of wanting real/live/human help
Do NOT try to answer the question yourself — call this tool right away.`,
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for escalation (e.g. "User requested human support").',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

export async function executeTool(name: string, args: Record<string, any>, opts?: { sessionId?: string }) {
  switch (name) {
    case 'search_vehicles':
      // Map minSeats → seats for backwards-compat with adapter (adapter handles minSeats already)
      return adapter.searchVehicles({ ...args, seats: args.minSeats ?? args.seats } as any);
    case 'get_vehicle_details':
      return adapter.getVehicleDetails(Number(args.listingId));
    case 'check_availability':
      return adapter.getBlockDatesByCar(Number(args.carListingId));
    case 'validate_voucher':
      return adapter.getVoucherBySlug(String(args.voucherSlug));
    case 'search_knowledge_base':
      if (!args?.query) {
        throw new Error('search_knowledge_base requires query');
      }
      return searchKnowledgeBaseTool(String(args.query));
    case 'escalate_to_human':
      // Handled directly in the orchestrator via circuit breaker — return signal
      return { escalate: true, reason: args?.reason ?? 'User requested human support' };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default AGENT_TOOLS;
