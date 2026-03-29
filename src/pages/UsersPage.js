import { useState, useEffect } from 'react'
import Btn from '../components/Btn'
import { RoleBadge } from '../components/Badges'
import Modal from '../components/Modal'
import { fetchProfiles, updateProfile } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

export default function UsersPage() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('sales')
  const [inviting, setInviting] = useState(false)
  const toast = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { setProfiles(await fetchProfiles()) } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  async function handleInvite() {
    if (!inviteEmail || !inviteName) { toast('Email and name are required', 'error'); return }
    setInviting(true)
    try {
      const { error } = await supabase.auth.admin.inviteUserByEmail(inviteEmail, {
        data: { full_name: inviteName, role: inviteRole }
      })
      if (error) throw error
      toast(`Invite sent to ${inviteEmail}`)
      setShowInvite(false)
      setInviteEmail(''); setInviteName(''); setInviteRole('sales')
      setTimeout(load, 1000)
    } catch (e) {
      toast(e.message, 'error')
    }
    setInviting(false)
  }

  async function changeRole(id, role) {
    try {
      const updated = await updateProfile(id, { role })
      setProfiles(prev => prev.map(p => p.id === id ? updated : p))
      toast('Role updated')
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{profiles.length} team member{profiles.length !== 1 ? 's' : ''}</span>
        <Btn variant="primary" onClick={() => setShowInvite(true)}>+ Invite user</Btn>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, overflow: 'hidden' }}>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: '#bbb', fontSize: 12 }}>Loading…</div>}
        {!loading && profiles.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#bbb', fontSize: 12 }}>No users yet. Invite your first team member.</div>
        )}
        {profiles.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < profiles.length - 1 ? '1px solid #f0ede8' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#185FA5', flexShrink: 0 }}>
                {(p.full_name || p.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.full_name || '—'}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{p.email}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <RoleBadge role={p.role} />
              <select value={p.role || 'sales'} onChange={e => changeRole(p.id, e.target.value)} style={{ width: 'auto', fontSize: 11, padding: '3px 7px' }}>
                {['admin', 'sales', 'production', 'shipping'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {showInvite && (
        <Modal
          title="Invite team member"
          onClose={() => setShowInvite(false)}
          footer={<><Btn onClick={() => setShowInvite(false)}>Cancel</Btn><Btn variant="primary" onClick={handleInvite} disabled={inviting}>{inviting ? 'Sending…' : 'Send invite'}</Btn></>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#f0f9f5', border: '1px solid #9FE1CB', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#0F6E56' }}>
              The user will receive an email with a link to set their password and log in.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 11, color: '#666' }}>Full name</label>
              <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="e.g. Anna Karlsson" autoFocus />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 11, color: '#666' }}>Email address</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="anna@yourcompany.com" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 11, color: '#666' }}>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                {['admin', 'sales', 'production', 'shipping'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
