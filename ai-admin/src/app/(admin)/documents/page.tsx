'use strict';
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [passcode, setPasscode] = useState('');
  const [passcodeUnlocked, setPasscodeUnlocked] = useState(false);
  const [passcodErr, setPasscodeErr] = useState('');
  const isFetchingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const fetchDocuments = useCallback(async () => {
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setLoading(true);

    try {
      const res = await apiFetch('/api/admin/documents', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void fetchDocuments();
  }, [fetchDocuments]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type !== 'application/pdf') {
        setError('Only PDF documents are supported.');
        setFile(null);
        return;
      }
      if (selected.size > 20 * 1024 * 1024) {
        setError('Maximum file size is 20MB.');
        setFile(null);
        return;
      }
      setError('');
      setFile(selected);
      // Auto fill title if empty
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !category || uploading) return;

    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('category', category);

    try {
      const res = await apiFetch('/api/admin/documents', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to upload document');
        setUploading(false);
        return;
      }

      setFile(null);
      setTitle('');
      setCategory('general');
      // Reset input element
      const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      fetchDocuments();
    } catch (err) {
      setError('Connection failure during upload.');
    } finally {
      setUploading(false);
    }
  };

  const handlePasscode = () => {
    if (passcode === '1111') {
      setPasscodeUnlocked(true);
      setPasscodeErr('');
    } else {
      setPasscodeErr('Incorrect passcode.');
      setPasscode('');
    }
  };

  const handleReingest = async (docId: string) => {
    try {
      const res = await apiFetch(`/api/admin/documents/${docId}/reingest`, { method: 'POST' });
      if (res.ok) fetchDocuments();
    } catch (err) {
      console.error('Re-ingest failed:', err);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document? All associated semantic search chunks will be permanently removed.')) return;
    try {
      const res = await apiFetch(`/api/admin/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) fetchDocuments();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handlePreview = async (docId: string) => {
    try {
      const res = await apiFetch(`/api/admin/documents/${docId}/preview`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Preview failed:', err);
        alert(err.error || 'Preview unavailable');
        return;
      }

      // If the response is a PDF (proxy mode), create a blob URL
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/pdf')) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        // Revoke after 60s to free memory
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        return;
      }

      // Otherwise expect JSON with a url field
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Preview failed:', err);
    }
  };

  const getStatusBadge = (status: string, errorMsg?: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2.5 py-0.5 rounded text-[10px] font-bold border bg-gray-500/10 text-gray-400 border-gray-500/20">Pending</span>;
      case 'parsing':
        return <span className="px-2.5 py-0.5 rounded text-[10px] font-bold border bg-sky-500/10 text-sky-400 border-sky-500/20 animate-pulse">Parsing PDF</span>;
      case 'embedding':
        return <span className="px-2.5 py-0.5 rounded text-[10px] font-bold border bg-purple-500/10 text-purple-400 border-purple-500/20 animate-pulse">Embedding</span>;
      case 'ready':
        return <span className="px-2.5 py-0.5 rounded text-[10px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Ready</span>;
      case 'failed':
        return (
          <span
            className="px-2.5 py-0.5 rounded text-[10px] font-bold border bg-red-500/10 text-red-400 border-red-500/20 cursor-pointer"
            title={errorMsg || 'Failed'}
          >
            Failed ⚠
          </span>
        );
      default:
        return <span className="px-2.5 py-0.5 rounded text-[10px] font-bold border bg-gray-500/10 text-gray-400 border-gray-500/20">{status}</span>;
    }
  };

  const activeDocs = documents.filter((doc) => doc.is_active);

  return (
    <div className="space-y-8">
      {/* Upload Zone & Form */}
      <div className="bg-[#0F161E] p-6 rounded-2xl border border-[#1E293B] shadow-lg">
        <h3 className="font-bold text-white text-base mb-4">Ingest Policy Document (PDF)</h3>
        
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
              Document Title
            </label>
            <input
              type="text"
              required
              className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
              placeholder="e.g. Terms and Conditions"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
            >
              <option value="general">General Help</option>
              <option value="rental_policy">Rental Policy</option>
              <option value="insurance">Insurance Coverage</option>
              <option value="faq_source">FAQ Source</option>
              <option value="terms">Terms of Service</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
              Select PDF File (Max 20MB)
            </label>

            {/* Passcode gate */}
            {!passcodeUnlocked && (
              <div className="flex gap-2 mb-2 items-center">
                <span className="text-[#94A3B8] text-xs flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-[#20B9BE]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Admin passcode required
                </span>
                <input
                  type="password"
                  maxLength={8}
                  value={passcode}
                  onChange={(e) => { setPasscode(e.target.value); setPasscodeErr(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasscode()}
                  placeholder="Enter passcode"
                  className="w-36 bg-[#090D11] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#20B9BE] placeholder:text-[#475569] tracking-widest"
                />
                <button
                  type="button"
                  onClick={handlePasscode}
                  className="bg-[#1E293B] hover:bg-[#20B9BE]/20 border border-[#1E293B] hover:border-[#20B9BE] text-xs text-[#94A3B8] hover:text-white rounded-lg px-3 py-1.5 transition-all"
                >
                  Unlock
                </button>
                {passcodErr && <span className="text-red-400 text-xs">{passcodErr}</span>}
              </div>
            )}
            {passcodeUnlocked && (
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs mb-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 018 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                <span>Upload unlocked</span>
                <button type="button" onClick={() => { setPasscodeUnlocked(false); setPasscode(''); setFile(null); }} className="ml-2 text-[#94A3B8] hover:text-white text-[10px] underline">
                  Lock
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <input
                id="file-upload-input"
                type="file"
                accept="application/pdf"
                required
                disabled={!passcodeUnlocked}
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor={passcodeUnlocked ? 'file-upload-input' : undefined}
                className={`flex-1 border rounded-xl px-4 py-2.5 text-sm text-center truncate font-medium transition-all ${
                  passcodeUnlocked
                    ? 'bg-[#090D11] hover:bg-[#1E293B]/30 border-[#1E293B] hover:border-[#20B9BE] cursor-pointer text-[#94A3B8] hover:text-white'
                    : 'bg-[#090D11]/50 border-[#1E293B]/40 cursor-not-allowed text-[#475569]'
                }`}
              >
                {file ? file.name : 'Choose file...'}
              </label>
              <button
                type="submit"
                disabled={uploading || !file || !passcodeUnlocked}
                className="bg-[#20B9BE] hover:bg-[#17878b] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-2.5 text-sm font-semibold transition-all shadow-md shadow-[#20B9BE]/10"
              >
                {uploading ? 'Uploading...' : 'Ingest'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Uploaded Documents List */}
      <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-[#1E293B] bg-[#090D11]/30">
          <h3 className="font-bold text-white text-sm">Active Ingested Documents</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <svg className="animate-spin h-6 w-6 text-[#20B9BE]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : activeDocs.length === 0 ? (
          <div className="text-center text-sm text-[#94A3B8] py-12">No active policy documents uploaded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider bg-[#090D11]/30">
                  <th className="px-6 py-4">Title</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Size</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Uploaded</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {activeDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[#1E293B]/20 transition-all text-sm">
                    <td className="px-6 py-4 font-semibold text-white">
                      {doc.title}
                      <span className="block text-[10px] font-mono text-[#94A3B8] mt-0.5">{doc.original_filename}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-[#1E293B] border border-[#334155] px-2 py-0.5 rounded text-[10px] font-semibold text-white capitalize">
                        {doc.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[#94A3B8]">
                      {doc.file_size_bytes ? `${(doc.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(doc.status, doc.error_message)}</td>
                    <td className="px-6 py-4 text-xs text-[#94A3B8]">
                      {new Date(doc.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handlePreview(doc.id)}
                        className="bg-[#1E293B] hover:bg-[#20B9BE] hover:text-white border border-[#334155] text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => handleReingest(doc.id)}
                        className="bg-[#1E293B] hover:bg-sky-500 hover:text-white border border-[#334155] text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        Re-Ingest
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="bg-[#1E293B] hover:bg-red-500 hover:text-white border border-[#334155] text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
