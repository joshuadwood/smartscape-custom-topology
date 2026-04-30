import { Page } from '@dynatrace/strato-components-preview/layouts';
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { TopologyBuilder } from './pages/TopologyBuilder';
import { Relationships } from './pages/Relationships';
import { CreatedRules } from './pages/CreatedRules';
import { AuditTrail } from './pages/AuditTrail';

export const App: React.FC = () => {
  return (
    <Page>
      <Page.Header>
        <Header />
      </Page.Header>
      <Page.Main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
        <Routes>
          <Route path="/" element={<TopologyBuilder />} />
          <Route path="/relationships" element={<Relationships />} />
          <Route path="/rules" element={<CreatedRules />} />
          <Route path="/audit" element={<AuditTrail />} />
        </Routes>
      </Page.Main>
    </Page>
  );
};
