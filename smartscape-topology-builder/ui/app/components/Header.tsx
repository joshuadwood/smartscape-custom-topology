import React, { useState } from 'react';
import { AppHeader } from '@dynatrace/strato-components-preview/layouts';
import { useNavigate, useLocation } from 'react-router-dom';
import Colors from '@dynatrace/strato-design-tokens/colors';

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
