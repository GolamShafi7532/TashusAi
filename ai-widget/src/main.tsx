'use strict';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import tailwindCss from './index.css?inline';
import { WIDGET_CSS } from './lib/theme';

function initWidget() {
  const mountPointId = 'tashus-ai-widget';
  let container = document.getElementById(mountPointId);

  if (!container) {
    container = document.createElement('div');
    container.id = mountPointId;
    document.body.appendChild(container);
  }

  // Read data-tashus-jwt-cookie attribute if configured by host page
  const jwtCookieName = container.getAttribute('data-tashus-jwt-cookie') || undefined;

  // 1. Create Shadow Root to isolate styles
  const shadowRoot = container.attachShadow({ mode: 'open' });

  // 2. Append scoped style tag with Tailwind + custom widget CSS
  const styleTag = document.createElement('style');
  styleTag.textContent = `${tailwindCss}\n${WIDGET_CSS}`;
  shadowRoot.appendChild(styleTag);

  // 3. Create inner mounting point for React application
  const reactMountNode = document.createElement('div');
  reactMountNode.id = 'tashus-widget-root';
  shadowRoot.appendChild(reactMountNode);

  // 4. Mount React Application
  const root = ReactDOM.createRoot(reactMountNode);
  root.render(
    <React.StrictMode>
      <App jwtCookieName={jwtCookieName} />
    </React.StrictMode>
  );
}

// Bootstrap widget when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWidget);
} else {
  initWidget();
}
