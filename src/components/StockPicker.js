import { useState, useEffect } from 'react'
import { fetchStock, decrementStock } from '../lib/api'
import Btn from './Btn'

export default function StockPicker({ onSelect, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchStock().then(data => { setItems(data || []); setLoading(false) })
  }, [])

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    return (i.model + i.type + i.colour).toLowerCase().includes(q)
  })

  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.model]) acc[item.model] = []
    acc[item.model].push(item)
    return acc
  }, {})

  async function select(item) {
    try {
      await decrementStock(item.id)
      onSelect(item)
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 560, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Select from Sweden stock</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888' }}>✕</button>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search model, type, colour…" style={{ marginBottom: 12 }} autoFocus />
        {loading && <div style={{ textAlign: 'center', padding: 24, color: '#bbb' }}>Loading stock…</div>}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {Object.entries(grouped).map(([model, modelItems]) => (
            <div key={model} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#666', padding: '4px 0', borderBottom: '1px solid #e0ddd8', marginBottom: 6 }}>{model}</div>
              {modelItems.map(item => (
                <div key={item.id}
                  onClick={() => item.quantity > 0 && select(item)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 6, marginBottom: 4,
                    cursor: item.quantity > 0 ? 'pointer' : 'not-allowed',
                    background: item.quantity > 0 ? '#fafaf9' : '#f5f5f5',
                    border: '1px solid #e0ddd8',
                    opacity: item.quantity === 0 ? 0.5 : 1
                  }}
                  onMouseEnter={e => { if (item.quantity > 0) e.currentTarget.style.background = '#f0f0ef' }}
                  onMouseLeave={e => { if (item.quantity > 0) e.currentTarget.style.background = '#fafaf9' }}>
                  <div>
                    <span style={{ fontSize: 12 }}>{item.type} — {item.colour}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: item.quantity === 0 ? '#E24B4A' : item.quantity <= 2 ? '#d97706' : '#27a069' }}>
                      {item.quantity} in stock
                    </span>
                    {item.quantity === 0 && <span style={{ fontSize: 10, color: '#E24B4A' }}>Out of stock</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {!loading && Object.keys(grouped).length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: '#bbb', fontSize: 12 }}>No items found</div>
          )}
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  )
}
