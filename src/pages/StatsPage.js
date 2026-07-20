import { useMemo } from 'react'
import { STAGES } from '../lib/constants'

const STAGE_COLORS = ['#B5D4F4','#FAC775','#CECBF6','#F4C0D1','#C0DD97','#9FE1CB','#D3D1C7']
const SRC_COLORS = { Website: '#C0DD97', eBay: '#FAC775', Manual: '#D3D1C7' }

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: '#f5f5f4', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: color || '#1a1a1a' }}>{value}</div>
    </div>
  )
}

function BarChart({ data, maxVal }) {
  return (
    <div>
      {data.map(({ label, value, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 155, fontSize: 11, color: '#888', textAlign: 'right', flexShrink: 0 }}>{label}</div>
          <div style={{ flex: 1, background: '#f0ede8', borderRadius: 3, height: 20 }}>
            <div style={{ width: `${Math.round((value / Math.max(maxVal, 1)) * 100)}%`, background: color, height: '100%', borderRadius: 3, minWidth: value > 0 ? 4 : 0, transition: 'width .3s' }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, minWidth: 20 }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

export default function StatsPage({ orders }) {
  const stats = useMemo(() => {
    // Overview counts only ACTIVE orders, using the real stage names from
    // constants.js — the old hardcoded names didn't exist, so cards lied.
    const active = orders.filter(o => !o.archived)
    const total = active.length
    const pending = active.filter(o => o.stage === 'New').length
    const inProd = active.filter(o => ['Verified', 'In Production', 'Production Complete'].includes(o.stage)).length
    const shipped = active.filter(o => ['Shipped to Sweden', 'Shipped to Customer', 'Delivered'].includes(o.stage)).length
    const stageData = STAGES.map((s, i) => ({ label: s, value: active.filter(o => o.stage === s).length, color: STAGE_COLORS[i] }))
    const sourceData = ['Website', 'eBay', 'Manual'].map(s => ({ label: s, value: active.filter(o => o.source === s).length, color: SRC_COLORS[s] }))
    return { total, pending, inProd, shipped, stageData, sourceData, active }
  }, [orders])

  const maxStage = Math.max(...stats.stageData.map(x => x.value), 1)
  const maxSrc = Math.max(...stats.sourceData.map(x => x.value), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <StatCard label="Active orders" value={stats.total} />
        <StatCard label="New (need action)" value={stats.pending} color="#BA7517" />
        <StatCard label="In production" value={stats.inProd} color="#185FA5" />
        <StatCard label="Shipped" value={stats.shipped} color="#1D9E75" />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Orders by stage</div>
        <BarChart data={stats.stageData} maxVal={maxStage} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Orders by source</div>
        <BarChart data={stats.sourceData} maxVal={maxSrc} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Recent orders</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Order', 'Customer', 'Car', 'Stage', 'Date'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 11, color: '#888', borderBottom: '1px solid #e0ddd8', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.active.slice(0, 8).map(o => (
              <tr key={o.id}>
                <td style={{ padding: '6px 8px', color: '#185FA5', fontWeight: 600, fontSize: 11 }}>{o.order_ref}</td>
                <td style={{ padding: '6px 8px' }}>{o.customer_name}</td>
                <td style={{ padding: '6px 8px', color: '#888' }}>{o.car}</td>
                <td style={{ padding: '6px 8px' }}>
                  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 8, background: '#f0ede8', color: '#555' }}>{o.stage}</span>
                </td>
                <td style={{ padding: '6px 8px', color: '#aaa', fontSize: 11 }}>
                  {o.order_date ? o.order_date.slice(0, 10).split('-').reverse().join('/') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
