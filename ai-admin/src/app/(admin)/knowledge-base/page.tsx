'use strict';
'use client';

import React, { useState, useEffect } from 'react';

export default function KnowledgeBasePage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    entry_type: 'faq',
    question: '',
    answer: '',
    tags: '',
    priority: '100',
    is_active: true,
    starts_at: '',
    ends_at: '',
  });

  const fetchEntries = async () => {
    try {
      const query = new URLSearchParams();
      if (typeFilter) query.set('type', typeFilter);
      const res = await fetch(`/api/admin/kb?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (err) {
      console.error('Failed to load KB entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [typeFilter]);

  const handleEdit = (entry: any) => {
    setEditingId(entry.id);
    setFormData({
      entry_type: entry.entry_type,
      question: entry.question || '',
      answer: entry.answer,
      tags: (entry.tags || []).join(', '),
      priority: String(entry.priority || 100),
      is_active: entry.is_active,
      starts_at: entry.starts_at ? entry.starts_at.substring(0, 16) : '',
      ends_at: entry.ends_at ? entry.ends_at.substring(0, 16) : '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNewEntry = () => {
    setEditingId(null);
    setFormData({
      entry_type: 'faq',
      question: '',
      answer: '',
      tags: '',
      priority: '100',
      is_active: true,
      starts_at: '',
      ends_at: '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      entry_type: formData.entry_type,
      question: formData.question || null,
      answer: formData.answer,
      tags: formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
      priority: Number(formData.priority),
      is_active: formData.is_active,
      starts_at: formData.starts_at || null,
      ends_at: formData.ends_at || null,
    };

    try {
      const url = editingId ? `/api/admin/kb/${editingId}` : '/api/admin/kb';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to save entry');
        setSaving(false);
        return;
      }

      setShowForm(false);
      setEditingId(null);
      fetchEntries();
    } catch (err) {
      setError('Connection failure during save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this KB entry?')) return;
    try {
      const res = await fetch(`/api/admin/kb/${id}`, { method: 'DELETE' });
      if (res.ok) fetchEntries();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'faq':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'instruction':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'promotion':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'override':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 justify-between bg-[#0F161E] p-4 rounded-xl border border-[#1E293B]">
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">
              Filter by Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-[#090D11] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#20B9BE]"
            >
              <option value="">All Types</option>
              <option value="faq">FAQ</option>
              <option value="instruction">Instruction</option>
              <option value="promotion">Promotion</option>
              <option value="override">Override</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleNewEntry}
          className="bg-[#20B9BE] hover:bg-[#17878b] text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-[#20B9BE]/10 flex items-center gap-2 self-end sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add KB Entry
        </button>
      </div>

      {/* Entry Form */}
      {showForm && (
        <div className="bg-[#0F161E] p-6 rounded-2xl border border-[#1E293B] shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white text-base">
              {editingId ? 'Edit Knowledge Base Entry' : 'New Knowledge Base Entry'}
            </h3>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="text-[#94A3B8] hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  Entry Type
                </label>
                <select
                  value={formData.entry_type}
                  onChange={(e) => setFormData({ ...formData, entry_type: e.target.value })}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
                >
                  <option value="faq">FAQ — Question & Answer pair</option>
                  <option value="instruction">Instruction — Agent behavior directive</option>
                  <option value="promotion">Promotion — Active deal or offer</option>
                  <option value="override">Override — Forced response pattern</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  Priority (lower = higher priority)
                </label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
                  placeholder="e.g. vehicle, insurance, booking"
                />
              </div>
            </div>

            {formData.entry_type === 'faq' && (
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  Question
                </label>
                <input
                  type="text"
                  required
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
                  placeholder="e.g. How do I cancel my booking?"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                Answer / Content
              </label>
              <textarea
                required
                rows={5}
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#20B9BE] resize-none leading-relaxed"
                placeholder="Enter the answer or instruction content..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  Valid From (optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.starts_at}
                  onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  Valid Until (optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.ends_at}
                  onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                  className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
                />
              </div>

              <div className="flex items-center gap-3 pb-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className={`relative w-10 h-5 rounded-full transition-all ${formData.is_active ? 'bg-[#20B9BE]' : 'bg-[#1E293B]'}`}>
                    <div
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${formData.is_active ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                  </div>
                  <span className="text-sm text-white font-semibold">Active</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="bg-[#1E293B] hover:bg-[#334155] border border-[#334155] text-xs font-semibold px-5 py-2.5 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-[#20B9BE] hover:bg-[#17878b] disabled:opacity-50 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all"
              >
                {saving ? 'Saving & Indexing...' : editingId ? 'Save Changes' : 'Create & Index Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Entries Table */}
      <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-[#1E293B] bg-[#090D11]/30">
          <h3 className="font-bold text-white text-sm">Knowledge Base Entries ({entries.length})</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <svg className="animate-spin h-6 w-6 text-[#20B9BE]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-sm text-[#94A3B8] py-12">No KB entries found. Create your first entry above.</div>
        ) : (
          <div className="divide-y divide-[#1E293B]">
            {entries.map((entry) => (
              <div key={entry.id} className="px-6 py-5 hover:bg-[#1E293B]/20 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border capitalize ${getTypeBadge(entry.entry_type)}`}>
                        {entry.entry_type}
                      </span>
                      {!entry.is_active && (
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold border bg-red-500/10 text-red-400 border-red-500/20">
                          Inactive
                        </span>
                      )}
                      {entry.tags?.map((tag: string) => (
                        <span key={tag} className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#1E293B] text-[#94A3B8] border border-[#334155]">
                          {tag}
                        </span>
                      ))}
                      <span className="text-[9px] font-mono text-[#475569] ml-auto">Priority: {entry.priority}</span>
                    </div>

                    {entry.question && (
                      <p className="font-semibold text-white text-sm mb-1.5">{entry.question}</p>
                    )}
                    <p className="text-[#94A3B8] text-xs leading-relaxed line-clamp-2">{entry.answer}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleEdit(entry)}
                      className="bg-[#1E293B] hover:bg-[#20B9BE] hover:text-white border border-[#334155] text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="bg-[#1E293B] hover:bg-red-500 hover:text-white border border-[#334155] text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
