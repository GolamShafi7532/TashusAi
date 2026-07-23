import { NextResponse } from 'next/server';
import { db, isLocalDevMode } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function resolveAdmin(req: Request) {
  if (isLocalDevMode()) {
    return { userId: 'local-dev-admin', email: 'dev@local', role: 'super_admin', displayName: 'Dev Admin' };
  }
  return getAdminFromRequest(req);
}

/**
 * GET /api/admin/analytics
 * Comprehensive analytics data for the dashboard
 */
export async function GET(req: Request) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const period = url.searchParams.get('period') || '7d'; // 7d, 30d, 90d

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    switch (period) {
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '7d':
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // ── 1. Overview Stats ──────────────────────────────────────────────────
    const { data: allSessions } = await (db.from('ai_chat_sessions') as any)
      .select('id, status, is_ai_paused, started_at, closed_at, assigned_admin_id')
      .gte('started_at', startDate.toISOString());

    const sessions = allSessions || [];
    const totalSessions = sessions.length;
    const handoffSessions = sessions.filter((s: any) => s.assigned_admin_id).length;
    const closedSessions = sessions.filter((s: any) => s.status === 'closed').length;
    const handoffRate = totalSessions > 0 ? ((handoffSessions / totalSessions) * 100).toFixed(1) : '0';

    // ── 2. Average Resolution Time ─────────────────────────────────────────
    const resolvedSessions = sessions.filter((s: any) => s.started_at && s.closed_at);
    let avgResolutionMinutes = 0;
    if (resolvedSessions.length > 0) {
      const totalMinutes = resolvedSessions.reduce((sum: number, s: any) => {
        const start = new Date(s.started_at).getTime();
        const end = new Date(s.closed_at).getTime();
        return sum + (end - start) / 60000; // Convert to minutes
      }, 0);
      avgResolutionMinutes = Math.round(totalMinutes / resolvedSessions.length);
    }

    // ── 3. Admin Response Time (first admin message after handoff) ────────
    const handoffSessionIds = sessions
      .filter((s: any) => s.assigned_admin_id)
      .map((s: any) => s.id);

    let avgResponseMinutes = 0;
    if (handoffSessionIds.length > 0) {
      const { data: messages } = await (db.from('ai_chat_messages') as any)
        .select('session_id, role, created_at')
        .in('session_id', handoffSessionIds)
        .order('created_at', { ascending: true });

      const responseTimes: number[] = [];
      const sessionMessages = new Map<string, any[]>();

      // Group messages by session
      (messages || []).forEach((m: any) => {
        if (!sessionMessages.has(m.session_id)) {
          sessionMessages.set(m.session_id, []);
        }
        sessionMessages.get(m.session_id)!.push(m);
      });

      // Calculate time from last user message to first admin message
      sessionMessages.forEach((msgs) => {
        const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user');
        const firstAdminMsg = msgs.find((m) => m.role === 'admin');
        
        if (lastUserMsg && firstAdminMsg) {
          const userTime = new Date(lastUserMsg.created_at).getTime();
          const adminTime = new Date(firstAdminMsg.created_at).getTime();
          if (adminTime > userTime) {
            responseTimes.push((adminTime - userTime) / 60000); // minutes
          }
        }
      });

      if (responseTimes.length > 0) {
        avgResponseMinutes = Math.round(
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        );
      }
    }

    // ── 4. Daily Session Counts (for chart) ───────────────────────────────
    const dailyData: Record<string, { total: number; handoff: number }> = {};
    const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(now.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyData[dateStr] = { total: 0, handoff: 0 };
    }

    sessions.forEach((s: any) => {
      const dateStr = s.started_at.split('T')[0];
      if (dailyData[dateStr]) {
        dailyData[dateStr].total++;
        if (s.assigned_admin_id) dailyData[dateStr].handoff++;
      }
    });

    const chartData = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        total: counts.total,
        handoff: counts.handoff,
      }));

    // ── 5. Top Tags ────────────────────────────────────────────────────────
    const tagCounts: Record<string, number> = {};
    sessions.forEach((s: any) => {
      if (s.tags && Array.isArray(s.tags)) {
        s.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // ── 6. Admin Performance ───────────────────────────────────────────────
    const adminIds = Array.from(new Set(sessions.map((s: any) => s.assigned_admin_id).filter(Boolean)));
    const adminStats: any[] = [];

    if (adminIds.length > 0) {
      const { data: admins } = await (db.from('ai_admin_users') as any)
        .select('id, display_name')
        .in('id', adminIds);

      const adminMap = new Map((admins || []).map((a: any) => [a.id, a.display_name]));

      for (const adminId of adminIds) {
        const adminSessions = sessions.filter((s: any) => s.assigned_admin_id === adminId);
        const { data: adminMessages } = await (db.from('ai_chat_messages') as any)
          .select('id')
          .eq('sent_by_admin_id', adminId)
          .gte('created_at', startDate.toISOString());

        adminStats.push({
          name: adminMap.get(adminId) || 'Unknown',
          sessions: adminSessions.length,
          messages: (adminMessages || []).length,
        });
      }

      adminStats.sort((a, b) => b.sessions - a.sessions);
    }

    // ── 7. Message Volume ──────────────────────────────────────────────────
    const { data: allMessages } = await (db.from('ai_chat_messages') as any)
      .select('role')
      .gte('created_at', startDate.toISOString());

    const messagesByRole = (allMessages || []).reduce((acc: any, m: any) => {
      acc[m.role] = (acc[m.role] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      period,
      overview: {
        totalSessions,
        handoffSessions,
        closedSessions,
        handoffRate: parseFloat(handoffRate),
        avgResolutionMinutes,
        avgResponseMinutes,
      },
      chartData,
      topTags,
      adminPerformance: adminStats,
      messageVolume: {
        user: messagesByRole.user || 0,
        assistant: messagesByRole.assistant || 0,
        admin: messagesByRole.admin || 0,
        system: messagesByRole.system || 0,
      },
    });
  } catch (err: any) {
    console.error('[AnalyticsRoute] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
