import React, { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { fetchOrders } from '../lib/api'
import { ROLE_PAGES, PAGE_LABELS } from '../lib/constants'
import { ToastContainer, useToast } from '../components/Toast'
import OrdersPage from './OrdersPage'
import VerifiedPage from './VerifiedPage'
import ProductionPage from './ProductionPage'
import ShippingPage from './ShippingPage'
import ShippingUSPage from './ShippingUSPage'
import ShippingSwedPage from './ShippingSwedPage'
import StockPage from './StockPage'
import ArchivePage from './ArchivePage'
import StatsPage from './StatsPage'
import UsersPage from './UsersPage'
import CustomerServicePage from './CustomerServicePage'
const NAV_ICONS = {
  orders: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/><line x1="4" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.1"/><line x1="4" y1="7.5" x2="10" y2="7.5" stroke="currentColor" strokeWidth="1.1"/><line x1="4" y1="10" x2="7" y2="10" stroke="currentColor" strokeWidth="1.1"/></svg>,
  verified: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  production: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M7 4v3l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  shipping: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M10 6h1.5l1.5 2v3h-3V6z" stroke="currentColor" strokeWidth="1.2"/><circle cx="3.5" cy="11.5" r="1" fill="currentColor"/><circle cx="10.5" cy="11.5" r="1" fill="currentColor"/></svg>,
  stats: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="7" width="3" height="6" rx="1" fill="currentColor" opacity=".6"/><rect x="5.5" y="4" width="3" height="9" rx="1" fill="currentColor" opacity=".8"/><rect x="10" y="1" width="3" height="12" rx="1" fill="currentColor"/></svg>,
  users: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M1 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M9.5 3c1.1 0 2 .9 2 2s-.9 2-2 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><path d="M11.5 10c1 .5 1.5 1.3 1.5 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  stock: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M4 7h6M7 4v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  archive: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 6h12" stroke="currentColor" strokeWidth="1.2"/><path d="M5 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  shipping_us: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M10 6h1.5l1.5 2v3h-3V6z" stroke="currentColor" strokeWidth="1.2"/><circle cx="3.5" cy="11.5" r="1" fill="currentColor"/><circle cx="10.5" cy="11.5" r="1" fill="currentColor"/><text x="4" y="9" fontSize="4" fill="currentColor">US</text></svg>,
  shipping_sweden: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M10 6h1.5l1.5 2v3h-3V6z" stroke="currentColor" strokeWidth="1.2"/><circle cx="3.5" cy="11.5" r="1" fill="currentColor"/><circle cx="10.5" cy="11.5" r="1" fill="currentColor"/><text x="4" y="9" fontSize="4" fill="currentColor">SE</text></svg>,
  customer_service: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M1 13c0-2.2 1.8-4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><rect x="8" y="7" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M10 9.5h1M10.5 9v1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
}
export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const toast = useToast()
  const role = profile?.role || 'sales'
  const pages = ROLE_PAGES[role] || ['orders']
  useEffect(() => {
    if (profile && !page) setPage(pages[0])
  }, [profile])
  useEffect(() => {
    loadOrders()
  }, [])
  async function loadOrders() {
    try {
      const data = await fetchOrders()
      setOrders(data || [])
    } catch (e) {
      toast('Failed to load orders: ' + e.message, 'error')
    }
    setLoading(false)
  }
  const active = orders.filter(o => !o.archived)
  const pendingCount = active.filter(o => o.stage === 'New').length
  const verifiedCount = active.filter(o => o.stage === 'Verified').length
  const prodCount = active.filter(o => o.stage === 'In Production').length
  const shipUSCount = active.filter(o => o.stage === 'Production Complete').length
  const shipSwedCount = active.filter(o => o.stage === 'Shipped to Sweden').length
  function getBadge(p) {
    if (p === 'verified' && verifiedCount > 0) return verifiedCount
    if (p === 'production' && prodCount > 0) return prodCount
    if (p === 'shipping_us' && shipUSCount > 0) return shipUSCount
    if (p === 'shipping_sweden' && shipSwedCount > 0) return shipSwedCount
    return null
  }
  const activePage = page && pages.includes(page) ? page : pages[0]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 50, borderBottom: '1px solid #e0ddd8', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: '#185FA5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="8" rx="2" fill="white" opacity=".9"/><rect x="5" y="2" width="6" height="3" rx="1" fill="white" opacity=".6"/></svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>SeatCover OMS</span>
        </div>
        <div style={{ position: 'relative' }}>
          <div onClick={() => setShowUserMenu(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: showUserMenu ? '#f5f5f4' : 'transparent' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#185FA5' }}>
              {(profile?.full_name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{profile?.full_name || 'User'}</div>
              <div style={{ fontSize: 10, color: '#888', textTransform: 'capitalize' }}>{role}</div>
            </div>
          </div>
          {showUserMenu && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid #e0ddd8', borderRadius: 8, minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,.08)', zIndex: 200 }}>
              <div style={{ padding: '6px 12px', fontSize: 11, color: '#aaa', borderBottom: '1px solid #f0ede8' }}>{user?.email}</div>
              <button onClick={signOut} style={{ width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#A32D2D' }}>Sign out</button>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 185, borderRight: '1px solid #e0ddd8', padding: 10, background: '#fff', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: '#bbb', padding: '8px 8px 3px', letterSpacing: '.06em', textTransform: 'uppercase' }}>Navigation</div>
          {pages.map(p => {
            const badge = getBadge(p)
            const isActive = activePage === p
            return (
              <React.Fragment key={p}>
              <div onClick={() => setPage(p)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                color: isActive ? '#1a1a1a' : '#888', fontWeight: isActive ? 600 : 400,
                background: isActive ? '#f5f5f4' : 'transparent'
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f9f9f8' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {NAV_ICONS[p]}
                  {PAGE_LABELS[p]}
                </div>
                {badge && <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>{badge}</span>}
              </div>
              {p === 'orders' && (
                <div onClick={() => { setPage('orders'); setTimeout(() => window.dispatchEvent(new CustomEvent('filterStage', { detail: 'New' })), 100) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                    color: '#888', fontWeight: 400, background: 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9f9f8'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M4 9V5l3 4V5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="7" r="0.9" fill="currentColor"/></svg>
                    New orders
                  </div>
                  {pendingCount > 0 && <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>{pendingCount}</span>}
                </div>
              )}
              </React.Fragment>
            )
          })}
        </div>
        {activePage === 'customer_service' ? (
          <div style={{ flex: 1, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 15, fontWeight: 600, padding: '11px 16px', borderBottom: '1px solid #e0ddd8', flexShrink: 0 }}>Customer service</div>
            <div style={{ flex: 1, overflow: 'hidden' }}><CustomerServicePage /></div>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#f5f5f4' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>{PAGE_LABELS[activePage]}</div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#bbb', fontSize: 13 }}>Loading orders…</div>
            ) : (
              <>
                {activePage === 'orders' && <OrdersPage orders={orders} setOrders={setOrders} role={role} />}
                {activePage === 'verified' && <VerifiedPage orders={orders} setOrders={setOrders} role={role} />}
                {activePage === 'production' && <ProductionPage orders={orders} setOrders={setOrders} role={role} />}
                {activePage === 'shipping' && <ShippingPage orders={orders} setOrders={setOrders} role={role} />}
                {activePage === 'shipping_us' && <ShippingUSPage orders={orders} setOrders={setOrders} role={role} />}
                {activePage === 'shipping_sweden' && <ShippingSwedPage orders={orders} setOrders={setOrders} role={role} />}
                {activePage === 'stock' && <StockPage />}
                {activePage === 'archive' && <ArchivePage orders={orders} setOrders={setOrders} role={role} />}
                {activePage === 'stats' && <StatsPage orders={orders} />}
                {activePage === 'users' && <UsersPage />}
              </>
            )}
          </div>
        )}
      </div>
      <ToastContainer />
    </div>
  )
}
