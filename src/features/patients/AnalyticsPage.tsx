import { Typography } from 'antd';
import { Gate } from '@/core/permissions/Gate';

export default function AnalyticsPage() {
  return (
    <Gate cap="viewAnalytics" fallback={<div style={{ padding: 40 }}><Typography.Text type="secondary">You do not have access to analytics.</Typography.Text></div>}>
      <div style={{ padding: 40 }}>
        <Typography.Title level={3}>Analytics</Typography.Title>
        <Typography.Text type="secondary">Analytics widgets load here (lazy-loaded).</Typography.Text>
      </div>
    </Gate>
  );
}
