import type { RouteObject } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '@/ui';
import { AreasTab } from './AreasTab';
import { DevicesTab } from './DevicesTab';
import { StaffTab } from './StaffTab';

type TabKey = 'areas' | 'tablets' | 'personal';

function TeamPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) || 'areas';
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Equipo y tablets" subtitle="Áreas del restaurante, tablets conectadas y personal" />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        items={[
          { value: 'areas', label: 'Áreas' },
          { value: 'tablets', label: 'Tablets' },
          { value: 'personal', label: 'Personal' },
        ]}
      />
      {tab === 'areas' && <AreasTab />}
      {tab === 'tablets' && <DevicesTab />}
      {tab === 'personal' && <StaffTab />}
    </div>
  );
}

export const adminRoutes: RouteObject[] = [{ path: 'equipo', element: <TeamPage /> }];
