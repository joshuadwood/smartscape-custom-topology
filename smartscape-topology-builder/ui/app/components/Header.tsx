import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const APP_VERSION = '1.12.7';

const TABS = [
  {
    label: 'Topology Builder',
    path: '/',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/>
        <path d="M9 6h6M6 9v6a3 3 0 0 0 3 3h6"/>
      </svg>
    ),
  },
  {
    label: 'Relationships',
    path: '/relationships',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/>
        <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>
      </svg>
    ),
  },
  {
    label: 'Created Rules',
    path: '/rules',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
      </svg>
    ),
  },
  {
    label: 'Audit Trail',
    path: '/audit',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
      </svg>
    ),
  },
] as const;

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{ flexShrink: 0, background: 'var(--bg-1)' }}>
      {/* Brand nav strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '14px 36px',
        gap: 28,
        borderBottom: '1px solid var(--border-soft)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Gradient brand mark */}
          <span style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: 'linear-gradient(135deg, var(--dt-purple) 0%, var(--dt-blue) 100%)',
            display: 'inline-block',
            flexShrink: 0,
          }} />
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--fg)' }}>
            Smartscape Topology Builder
          </span>
          <span style={{
            color: 'var(--fg-mute)',
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 11,
          }}>
            v{APP_VERSION}
          </span>
        </div>

        {/* At-will topology warning */}
        <span style={{
          marginLeft: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          borderRadius: 999,
          background: 'rgba(224, 168, 0, 0.10)',
          color: 'var(--warn)',
          border: '1px solid rgba(224, 168, 0, 0.3)',
          fontSize: 11,
          letterSpacing: '0.04em',
          fontWeight: 500,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 9v4M12 17h.01"/>
            <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/>
          </svg>
          At-will topology · won't change live infrastructure
        </span>
      </div>

      {/* Tab row */}
      <div style={{
        display: 'flex',
        gap: 2,
        padding: '0 32px',
        borderBottom: '1px solid var(--border-soft)',
      }}>
        {TABS.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                borderBottom: active ? '2px solid var(--dt-purple)' : '2px solid transparent',
                color: active ? 'var(--fg)' : 'var(--fg-3)',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                marginBottom: -1,
                transition: 'color 0.12s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
