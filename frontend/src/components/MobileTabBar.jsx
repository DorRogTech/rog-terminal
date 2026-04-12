import React from 'react';

/**
 * Fixed bottom tab bar (48px + safe-area) with Chat and Terminal tabs.
 * Icons + labels. Active tab indicator. Hides when keyboard is open.
 */
export default function MobileTabBar({ activeTab, onTabChange }) {
  return (
    <div className="mobile-tab-bar">
      <button
        className={`mobile-tab ${activeTab === 'chat' ? 'active' : ''}`}
        onTouchEnd={(e) => { e.preventDefault(); onTabChange('chat'); }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="mobile-tab-label">{'\u05E6\u05F3\u05D0\u05D8'}</span>
      </button>
      <button
        className={`mobile-tab ${activeTab === 'terminal' ? 'active' : ''}`}
        onTouchEnd={(e) => { e.preventDefault(); onTabChange('terminal'); }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <span className="mobile-tab-label">{'\u05D8\u05E8\u05DE\u05D9\u05E0\u05DC'}</span>
      </button>
    </div>
  );
}
