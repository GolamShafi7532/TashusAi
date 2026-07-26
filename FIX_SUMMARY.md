# Widget Message Persistence Fix - Summary

## Issue
After reloading the widget page, new messages were disappearing. Messages were being saved to the database successfully, but the history endpoint was returning stale/cached data.

## Root Cause
**Next.js Route Caching** - The history API route (`/api/ai/chat/[sessionId]/history`) was being cached by Next.js's static optimization, causing the widget to receive the same stale response on every reload.

## Investigation Process
1. ✅ Verified messages ARE being inserted into Supabase successfully
2. ✅ Confirmed session IDs match between widget and backend
3. ✅ Checked database returns - fresh data was in the DB
4. ❌ History endpoint was returning cached response (116 messages) even after new messages (118+) were inserted
5. 🎯 **Discovered the route was missing `export const dynamic = 'force-dynamic'`**

## Fix Applied

### File: `ai-backend/src/app/api/ai/chat/[sessionId]/history/route.ts`

**Changes:**
1. Added `export const dynamic = 'force-dynamic'` to disable Next.js static optimization
2. Added explicit cache-control headers to the response:
   ```typescript
   {
     headers: {
       'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
       'Pragma': 'no-cache',
     }
   }
   ```
3. Restored admin name resolution logic (was lost in stash)

## Testing Instructions

1. **Clear browser cache** and do a hard refresh (Cmd+Shift+R)
2. **Send a test message** in the widget
3. **Reload the page** - message should persist
4. **Send from admin panel** - should appear in widget after reload
5. **Verify in admin panel** - all messages should be visible there too

## Related Files Modified
- `ai-backend/src/app/api/ai/chat/[sessionId]/history/route.ts` - **PRIMARY FIX**
- `ai-backend/src/agent/orchestrator.ts` - Added debug logging (can be removed)

## Next Steps
1. Test thoroughly with fresh browser session
2. Verify admin messages also persist correctly
3. Remove debug console.log statements once confirmed working
4. Consider adding similar `export const dynamic = 'force-dynamic'` to other dynamic API routes

## Prevention
Always add `export const dynamic = 'force-dynamic'` to Next.js API routes that:
- Return user-specific data
- Query databases with frequently changing data
- Should never be cached

## Status
✅ Fix applied
⏳ Awaiting user testing confirmation
