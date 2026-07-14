/**
 * This is an API-only Next.js app.
 * No user-facing pages. Redirect to health endpoint for sanity checks.
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/api/ai/health');
}
