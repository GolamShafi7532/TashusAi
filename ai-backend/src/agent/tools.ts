/**
 * AGENT_TOOLS registry and dispatcher.
 * Maps tool names to typed schemas and dispatch functions that call the
 * tashus-adapter endpoints. This file implements the minimal dispatch
 * required by the orchestrator to call allow-listed Tashus endpoints.
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
    description: 'Search Tashus live vehicle inventory by location, date range, and advanced filters (car type, transmission, fuel type, seats, max price).',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name (e.g. Sydney, Melbourne)' },
        from: { type: 'string', format: 'date-time', description: 'ISO 8601 start datetime (UTC)' },
        to: { type: 'string', format: 'date-time', description: 'ISO 8601 end datetime (UTC)' },
        cType: { type: 'string', enum: ['SUV', 'Sedan', 'Hatchback', 'Ute', 'Van', 'Convertible', 'Coupe', 'Wagon'], description: 'Category/car type filter' },
        tType: { type: 'string', enum: ['Automatic', 'Manual'], description: 'Transmission filter' },
        fType: { type: 'string', enum: ['Petrol', 'Diesel', 'Electric', 'Hybrid'], description: 'Fuel type filter' },
        seats: { type: 'number', description: 'Minimum number of seats required' },
        maxPrice: { type: 'number', description: 'Maximum daily rental rate in AUD' },
        postcode: { type: 'string', description: 'Postal code' },
        region: { type: 'string', description: 'State code (e.g. nsw, qld, vic)' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_vehicle_details',
    description: 'Fetch complete specifications, description, guidelines, features, host info, and usage restrictions for a specific vehicle listing ID.',
    input_schema: {
      type: 'object',
      properties: {
        listingId: { type: 'number', description: 'The unique listing ID of the vehicle (e.g. 1022)' },
      },
      required: ['listingId'],
    },
  },
  {
    name: 'check_availability',
    description: 'Fetch block-dates for a specific vehicle listing to confirm live availability.',
    input_schema: { type: 'object', properties: { carListingId: { type: 'number' } }, required: ['carListingId'] },
  },
  {
    name: 'validate_voucher',
    description: 'Look up a voucher by its public slug to confirm terms and eligibility. Never applies or redeems it.',
    input_schema: { type: 'object', properties: { voucherSlug: { type: 'string' } }, required: ['voucherSlug'] },
  },
  {
    name: 'search_knowledge_base',
    description: 'Semantic + manual search across ai_knowledge_base and ai_document_chunks.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
];

export async function executeTool(name: string, args: Record<string, any>, opts?: { sessionId?: string }) {
  switch (name) {
    case 'search_vehicles':
      return adapter.searchVehicles(args as any);
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default AGENT_TOOLS;
