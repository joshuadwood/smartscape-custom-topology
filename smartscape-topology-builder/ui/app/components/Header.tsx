import React, { useState } from 'react';
import { AppHeader } from '@dynatrace/strato-components-preview/layouts';
import { useNavigate, useLocation } from 'react-router-dom';
import Colors from '@dynatrace/strato-design-tokens/colors';

const APP_VERSION = '1.11.2';

const APP_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><path d="M12 44 L32 54 L52 44 L32 34 Z" fill="#9B59B6" opacity="0.5"/><path d="M12 44 L32 54 L52 44 L32 34 Z" stroke="#6B2FA0" stroke-width="1.5" fill="none"/><path d="M12 36 L32 46 L52 36 L32 26 Z" fill="#9B59B6" opacity="0.7"/><path d="M12 36 L32 46 L52 36 L32 26 Z" stroke="#6B2FA0" stroke-width="1.5" fill="none"/><path d="M12 28 L32 38 L52 28 L32 18 Z" fill="#9B59B6" opacity="0.9"/><path d="M12 28 L32 38 L52 28 L32 18 Z" stroke="#6B2FA0" stroke-width="1.5" fill="none"/><path d="M44 22 C56 28 56 42 44 48" stroke="#1DB954" stroke-width="2.5" fill="none" stroke-linecap="round"/><polygon points="42,46 46,50 48,45" fill="#1DB954"/><circle cx="32" cy="18" r="2.5" fill="#6B2FA0"/><circle cx="32" cy="54" r="2.5" fill="#6B2FA0"/></svg>')}`;

const TABS = [
  { label: '🗺️ Topology Builder', path: '/' },
  { label: '🔗 Relationships', path: '/relationships' },
  { label: '📋 Created Rules', path: '/rules' },
  { label: '📜 Audit Trail', path: '/audit' },
] as const;

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      <AppHeader>
        <AppHeader.NavItems>
          <AppHeader.AppNavLink />
        </AppHeader.NavItems>
      </AppHeader>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        background: Colors.Background.Surface.Default,
        borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
      }}>
        <img src={APP_ICON} alt="App Icon" style={{ width: 28, height: 28 }} />
        <span style={{ fontWeight: 600, fontSize: 16, color: Colors.Text.Neutral.Default }}>
          Smartscape Topology Builder
        </span>
        <span style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued, marginLeft: -4 }}>
          v{APP_VERSION}
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          color: Colors.Text.Warning.Default,
          fontStyle: 'italic',
          maxWidth: 500,
        }}>
          ⚠️ Topologies created here are at-will and may not represent actual infrastructure relationships. Proceed with caution.
        </span>
      </div>
      <nav style={{
        display: 'flex',
        gap: 0,
        background: Colors.Background.Surface.Default,
        borderBottom: `2px solid ${Colors.Border.Neutral.Default}`,
        paddingLeft: 16,
      }}>
        {TABS.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <NavTab
              key={tab.path}
              active={active}
              label={tab.label}
              onClick={() => navigate(tab.path)}
            />
          );
        })}
      </nav>
    </>
  );
};

const NavTab: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 20px',
        border: 'none',
        borderBottom: active ? `3px solid ${Colors.Border.Primary.Accent}` : '3px solid transparent',
        background: active
          ? Colors.Background.Container.Neutral.Accent
          : hovered
          ? Colors.Background.Container.Neutral.Subdued
          : 'transparent',
        color: active ? Colors.Text.Neutral.OnAccent.Default : Colors.Text.Neutral.Default,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        marginBottom: -2,
      }}
    >
      {label}
    </button>
  );
};
