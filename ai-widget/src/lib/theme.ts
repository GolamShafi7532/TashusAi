/**
 * Design tokens for the Tashus AI chat widget.
 * Injected into the Shadow DOM root so they are scoped and don't
 * leak into the host page or get overridden by host CSS.
 */
export const WIDGET_CSS = `
  :host {
    /* ── Color palette ─────────────────────────── */
    --w-teal:        #20B9BE;
    --w-teal-dark:   #17878b;
    --w-teal-light:  #e6f9fa;
    --w-orange:      #F2994A;
    --w-orange-dark: #d97f2e;

    --w-bg-1:   #090D11;
    --w-bg-2:   #0F161E;
    --w-bg-3:   #1E293B;
    --w-border: #1E293B;

    --w-text:   #E4E6EB;
    --w-muted:  #94A3B8;
    --w-white:  #FFFFFF;

    /* ── Typography ────────────────────────────── */
    --w-font: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
    --w-font-size: 14px;
    --w-line-height: 1.5;

    /* ── Spacing / radius ──────────────────────── */
    --w-radius: 16px;
    --w-radius-sm: 8px;
    --w-radius-bubble: 18px;

    /* ── Shadows ───────────────────────────────── */
    --w-shadow: 0 25px 50px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
    --w-shadow-btn: 0 4px 14px rgba(32,185,190,0.35);
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :host {
    font-family: var(--w-font);
    font-size: var(--w-font-size);
    line-height: var(--w-line-height);
    color: var(--w-text);
    -webkit-font-smoothing: antialiased;
  }

  /* ── Scrollbar ─────────────────────────────── */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--w-bg-3); border-radius: 3px; }

  /* ── Keyframes ─────────────────────────────── */
  @keyframes w-slide-up {
    from { opacity: 0; transform: translateY(16px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes w-fade-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes w-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  @keyframes w-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }

  @keyframes w-dot-bounce {
    0%, 80%, 100% { transform: translateY(0); }
    40%            { transform: translateY(-5px); }
  }

  @keyframes w-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes w-notification-pop {
    0%   { transform: scale(0); }
    70%  { transform: scale(1.2); }
    100% { transform: scale(1); }
  }

  @keyframes w-ring-pulse {
    0%   { opacity: 0.6; transform: scale(1); }
    70%  { opacity: 0; transform: scale(1.18); }
    100% { opacity: 0; transform: scale(1.18); }
  }
`;
