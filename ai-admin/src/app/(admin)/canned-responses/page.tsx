'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface CannedResponse {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string;
  usage_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { value: 'greeting', label: '👋 Greeting', color: '#20B9BE' },
  { value: 'booking', label: '📅 Booking', color: '#3b82f6' },
  { value: 'policy', label: '📋 Policy', color: '#8b5cf6' },
  { value: 'technical', label: '⚙️ Technical', color: '#ef4444' },
  { value: 'closing', label: '✅ Closing', color: '#10b981' },
  { value: 'general', label: '💬 General', color: '#6b7280' },
];

export default function CannedResponsesPage() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    shortcut: '',
    category: 'general',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchResponses = async () => {
    try {
      const res = await fetch('/api/admin/canned-responses');
      if (res.ok) {
        const data = await res.json();
        setResponses(data.responses ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResponses();
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormData({ title: '', content: '', shortcut: '', category: 'general' });
    setError('');
    setShowModal(true);
  };

  const handleEdit = (response: CannedResponse) => {
    setEditingId(response.id);
    setFormData({
      title: response.title,
      content: response.content,
      shortcut: response.shortcut || '',
      category: response.category,
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const url = editingId
        ? `/api/admin/canned-responses/${editingId}`
        : '/api/admin/canned-responses';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowModal(false);
        fetchResponses();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this canned response?')) return;
    try {
      const res = await fetch(`/api/admin/canned-responses/${id}`, { method: 'DELETE' });
      if (res.ok) fetchResponses();
    } catch {}
  };

  const handleToggleActive = async (response: CannedResponse) => {
    try {
      const res = await fetch(`/api/admin/canned-responses/${response.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !response.is_active }),
      });
      if (res.ok) fetchResponses();
    } catch {}
  };

  const getCategoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label ?? cat;
  const getCategoryColor = (cat: string) => CATEGORIES.find(c => c.value === cat)?.color ?? '#6b7280';

  return (
    <div className="min-h-screen bg-[#090D11] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/sessions" className="text-[#64748b] hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-white">Quick Replies</h1>
            </div>
            <p className="text-sm text-[#64748b] ml-8">Manage canned responses for faster customer support</p>
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Response
          </button>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          /* Responses Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {responses.map(response => (
              <div
                key={response.id}
                className={`bg-[#0F161E] border rounded-2xl p-4 transition-all ${
                  response.is_active ? 'border-[#1E293B]' : 'border-[#1E293B] opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white truncate mb-1">{response.title}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
                        style={{ backgroundColor: getCategoryColor(response.category) }}
                      >
                        {getCategoryLabel(response.category)}
                      </span>
                      {response.shortcut && (
                        <code className="text-[9px] font-mono bg-[#1E293B] text-[#64748b] border border-[#334155] px-1.5 py-0.5 rounded">
                          {response.shortcut}
                        </code>
                      )}
                      <span className="text-[9px] text-[#475569]">Used {response.usage_count}×</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleActive(response)}
                    className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      response.is_active
                        ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                        : 'bg-[#1E293B] text-[#475569] hover:bg-[#334155]'
                    }`}
                    title={response.is_active ? 'Active' : 'Inactive'}
                  >
                    {response.is_active ? '✓' : '○'}
                  </button>
                </div>

                <p className="text-xs text-[#94A3B8] leading-relaxed mb-4 line-clamp-3">{response.content}</p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(response)}
                    className="flex-1 text-xs font-semibold text-[#20B9BE] hover:text-white bg-[#20B9BE]/10 hover:bg-[#20B9BE]/20 py-2 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(response.id)}
                    className="flex-1 text-xs font-semibold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 py-2 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && responses.length === 0 && (
          <div className="text-center py-20">
            <svg className="w-16 h-16 mx-auto mb-4 text-[#334155]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-[#64748b] text-sm">No canned responses yet. Create your first one!</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F161E] border border-[#334155] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E293B]">
              <h2 className="text-lg font-bold text-white">{editingId ? 'Edit Response' : 'New Response'}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#64748b] hover:text-white transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-xs text-red-400">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-2">Title *</label>
                <input
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#475569] outline-none focus:border-orange-400/50"
                  placeholder="e.g., Welcome Message"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-2">Content *</label>
                <textarea
                  required
                  rows={4}
                  value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#475569] outline-none focus:border-orange-400/50 resize-none"
                  placeholder="The message to send…"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#94A3B8] mb-2">Category *</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-orange-400/50"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#94A3B8] mb-2">Shortcut</label>
                  <input
                    value={formData.shortcut}
                    onChange={e => setFormData({ ...formData, shortcut: e.target.value })}
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#475569] outline-none focus:border-orange-400/50"
                    placeholder="/hello"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-[#1E293B] hover:bg-[#334155] text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-colors"
                >
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
