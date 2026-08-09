'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Read JWT payload from cookie or fetch session
    try {
      const match = document.cookie.split(';').find(c => c.trim().startsWith('admin_access_token='));
      if (match) {
        const token = match.split('=').slice(1).join('=').trim();
        const base64Url = token.split('.')[1];
        if (base64Url) {
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(window.atob(base64));
          setDisplayName(payload.displayName || payload.name || '');
          setEmail(payload.email || '');
        }
      }
    } catch (e) {
      console.warn('Failed to parse admin JWT cookie:', e);
    }
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await apiFetch('/api/admin/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to save display name');
        return;
      }

      setSuccessMsg('Profile display name updated successfully! Please reload to update JWT token badges.');
      // Notify parent layout or refresh page state
      window.dispatchEvent(new Event('admin_profile_updated'));
    } catch (err) {
      setErrorMsg('Network error while saving profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Settings</h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Manage your account profile and display preferences
        </p>
      </div>

      {/* Profile Form */}
      <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-[#1E293B]">
          <div className="w-10 h-10 rounded-full bg-[#20B9BE]/10 border border-[#20B9BE]/20 flex items-center justify-center text-[#20B9BE] font-bold">
            👤
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Admin Profile</h3>
            <p className="text-xs text-[#94A3B8]">Your profile name is shown in session chat messages when taking over conversations.</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs">
              {successMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8] mb-1">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. John Doe (Support Admin)"
              className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#20B9BE]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8] mb-1">Email Address</label>
            <input
              type="email"
              disabled
              value={email}
              className="w-full bg-[#090D11]/50 border border-[#1E293B] rounded-xl px-4 py-2.5 text-sm text-[#64748B] cursor-not-allowed"
            />
            <p className="text-[10px] text-[#64748B] mt-1">Email address cannot be changed from UI.</p>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving || !displayName.trim()}
              className="px-6 py-2.5 bg-[#20B9BE] hover:bg-[#17878b] disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all shadow-lg shadow-[#20B9BE]/10"
            >
              {saving ? 'Saving...' : 'Save Profile Name'}
            </button>
          </div>
        </form>
      </div>

      {/* Security Section (Placeholder for consistency) */}
      <div className="bg-[#0F161E] border border-[#1E293B] rounded-2xl p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xl">🔒</span>
          <div>
            <h3 className="text-base font-bold text-white">Password & Security</h3>
            <p className="text-xs text-[#94A3B8]">Managed via system environment variables.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
