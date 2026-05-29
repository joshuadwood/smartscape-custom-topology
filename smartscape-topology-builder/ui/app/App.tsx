import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { TopologyBuilder } from './pages/TopologyBuilder';
import { Relationships } from './pages/Relationships';
import { CreatedRules } from './pages/CreatedRules';
import { AuditTrail } from './pages/AuditTrail';

export const App: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--bg)',
      color: 'var(--fg)',
      overflow: 'hidden',
      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
    }}>
      <Header />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<TopologyBuilder />} />
          <Route path="/relationships" element={<Relationships />} />
          <Route path="/rules" element={<CreatedRules />} />
          <Route path="/audit" element={<AuditTrail />} />
        </Routes>
      </div>
    </div>
  );
};

