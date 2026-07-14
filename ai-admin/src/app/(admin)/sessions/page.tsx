'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (statusFilter) query.set('status', statusFilter);
      if (channelFilter) query.set('channel', channelFilter);

      const res = await fetch(`/api/admin/sessions?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [statusFilter, channelFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#20B9BE]/10 border border-[#20B9BE]/20 text-[#20B9BE]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#20B9BE]" />
            Active
          </span>
        );
      case 'handed_off':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F2994A]/10 border border-[#F2994A]/20 text-[#F2994A] animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F2994A]" />
            Handoff
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-500/10 border border-gray-500/20 text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-500/10 border border-gray-500/20 text-gray-400">
            {status}
          </span>
        );
    }
  };

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case 'widget':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'email':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'voice':
        return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between bg-[#0F161E] p-4 rounded-xl border border-[#1E293B]">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#090D11] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#20B9BE]"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="handed_off">Handoff</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">
              Channel Filter
            </label>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="bg-[#090D11] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#20B9BE]"
            >
              <option value="">All Channels</option>
              <option value="widget">Chat Widget</option>
              <option value="email">Email Inbox</option>
              <option value="voice">Voice Call</option>
            </select>
          </div>
        </div>

        <button
          onClick={fetchSessions}
          className="bg-[#1E293B] hover:bg-[#334155] border border-[#334155] text-xs font-semibold px-4 py-2 rounded-lg transition-all self-end sm:self-auto"
        >
          Refresh List
        </button>
      </div>

      {/* Grid List of Sessions */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-8 w-8 text-[#20B9BE]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-[#0F161E] border border-[#1E293B] rounded-2xl p-12 text-center">
          <svg className="w-12 h-12 text-[#475569] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="text-white font-semibold text-lg">No sessions found</h3>
          <p className="text-sm text-[#94A3B8] mt-1">Try modifying your filter settings</p>
        </div>
      ) : (
        <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider bg-[#090D11]/30">
                  <th className="px-6 py-4">Visitor Session</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Channel</th>
                  <th className="px-6 py-4">Last Activity</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-[#1E293B]/20 transition-all">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white truncate max-w-[200px]">
                        {session.visitor_id || 'anonymous_user'}
                      </div>
                      <div className="text-[10px] text-[#94A3B8] font-mono select-all">
                        ID: {session.id}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(session.status)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${getChannelBadge(session.channel)}`}>
                        {session.channel || 'widget'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#94A3B8]">
                      {new Date(session.last_message_at || session.started_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/sessions/${session.id}`}
                        className="inline-flex items-center gap-1 bg-[#1E293B] hover:bg-[#20B9BE] hover:text-white border border-[#334155] text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                      >
                        Open Chat
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
