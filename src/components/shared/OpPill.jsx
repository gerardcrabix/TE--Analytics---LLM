import { opStatusPillStyle } from '../../lib/dashboardIndex';

export function OpPill({ opStatusIdx, size }) {
  const pill = opStatusPillStyle(opStatusIdx, size);
  return <span style={pill.style}>{pill.label}</span>;
}

export function KpiTile({ label, value, color }) {
  return (
    <div className="kpi-tile">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}
