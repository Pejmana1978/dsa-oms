import { useState, useCallback, useEffect } from 'react'

let toastFn = null

export function useToast() {
  return useCallback((msg, type = 'success') => {
    if (toastFn) toastFn(msg, type)
  }, [])
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    toastFn = (msg, type) => {
      const id = Date.now()
      setToasts(prev => [...prev, { id, msg, type }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
    }
    return () => { toastFn = null }
  }, [])

  if (!toasts.length) return null

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? '#A32D2D' : '#1D9E75',
          color: '#fff',
          padding: '9px 16px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          boxShadow: '0 2px 8px rgba(0,0,0,.15)',
          animation: 'fadeIn .2s ease'
        }}>{t.msg}</div>
      ))}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </div>
  )
}
