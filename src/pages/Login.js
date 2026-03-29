import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) setError(err.message)
    else navigate('/')
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f5f5f4'}}>
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e0ddd8',padding:'32px 36px',width:'100%',maxWidth:380}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:28}}>
          <div style={{width:32,height:32,background:'#185FA5',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="8" rx="2" fill="white" opacity=".9"/><rect x="5" y="2" width="6" height="3" rx="1" fill="white" opacity=".6"/></svg>
          </div>
          <div>
            <div style={{fontWeight:600,fontSize:15}}>SeatCover OMS</div>
            <div style={{fontSize:11,color:'#888'}}>Order management system</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <label style={{display:'block',fontSize:11,color:'#666',marginBottom:4}}>Email address</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
          </div>
          <div>
            <label style={{display:'block',fontSize:11,color:'#666',marginBottom:4}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <div style={{background:'#FCEBEB',border:'1px solid #F7C1C1',borderRadius:6,padding:'8px 12px',fontSize:12,color:'#A32D2D'}}>{error}</div>}
          <button type="submit" disabled={loading} style={{marginTop:4,padding:'9px',background:loading?'#aaa':'#185FA5',color:'#fff',border:'none',borderRadius:6,fontWeight:500,fontSize:13}}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{marginTop:20,fontSize:11,color:'#999',textAlign:'center',lineHeight:1.6}}>
          Contact your administrator to get access.<br/>Accounts are created in the admin panel.
        </p>
      </div>
    </div>
  )
}
