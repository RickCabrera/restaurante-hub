import { useState } from 'react';
import { PageHeader, Tabs } from '@/ui';
import { PrintersTab } from './PrintersTab';
import { DeviceTab } from './DeviceTab';
import { AgentsTab } from './AgentsTab';
import { JobsTab } from './JobsTab';

type Tab = 'printers' | 'device' | 'agents' | 'jobs';
const KEY = 'rh.printing.tab';

export function PrintersPage() {
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      return (localStorage.getItem(KEY) as Tab) || 'printers';
    } catch {
      return 'printers';
    }
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* noop */
    }
  };
  return (
    <div>
      <PageHeader title="Impresoras" subtitle="Comandas de cocina y barra, cuentas, tickets y cortes de caja." />
      <Tabs
        className="mb-5 w-full sm:w-fit"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'printers', label: 'Impresoras' },
          { value: 'device', label: 'Este dispositivo' },
          { value: 'agents', label: 'Agentes' },
          { value: 'jobs', label: 'Cola de impresión' },
        ]}
      />
      {tab === 'printers' && <PrintersTab />}
      {tab === 'device' && <DeviceTab />}
      {tab === 'agents' && <AgentsTab />}
      {tab === 'jobs' && <JobsTab />}
    </div>
  );
}
