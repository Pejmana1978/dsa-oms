import { STAGES } from '../lib/constants'

export default function StageProgress({ stage }) {
  const idx = STAGES.indexOf(stage)
  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 4 }}>
        {STAGES.map((s, i) => (
          <div key={s} style={{
            flex: 1, textAlign: 'center', padding: '5px 2px',
            fontSize: 10, lineHeight: 1.3,
            borderTop: `3px solid ${i < idx ? '#1D9E75' : i === idx ? '#185FA5' : '#e0ddd8'}`,
            color: i < idx ? '#1D9E75' : i === idx ? '#185FA5' : '#bbb',
            fontWeight: i === idx ? 600 : 400
          }}>{s}</div>
        ))}
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginTop: 3 }}>
        Current: <strong>{stage}</strong>
      </div>
    </div>
  )
}
