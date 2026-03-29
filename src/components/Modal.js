export default function Modal({ title, onClose, footer, children, wide }) {
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', padding: '24px 16px', overflowY: 'auto'
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e0ddd8',
        width: '100%', maxWidth: wide ? 780 : 660,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '13px 16px', borderBottom: '1px solid #e0ddd8',
          position: 'sticky', top: 0, background: '#fff', borderRadius: '12px 12px 0 0', zIndex: 2
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
            color: '#888', lineHeight: 1, padding: '2px 6px'
          }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
        {footer && (
          <div style={{
            padding: '11px 16px', borderTop: '1px solid #e0ddd8',
            display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap'
          }}>{footer}</div>
        )}
      </div>
    </div>
  )
}
