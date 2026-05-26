import { useState } from 'react'
import { supabase } from '../lib/supabase'

const LANGUAGES = [
  { value: '', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'it', label: 'Italian' },
  { value: 'es', label: 'Spanish' },
]

function SimilarCard({ example, index }) {
  const [open, setOpen] = useState(false)
  const pct = Math.round((example.similarity || 0) * 100)
  return (
    <div style={{ border: '1px solid #e0ddd8', borderRadius: 8, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: '#fafaf8', userSelect: 'none' }}
      >
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#185FA5', flexShrink: 0 }}>
          {index + 1}
        </div>
        <div style={{ flex: 1, fontSize: 12, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {example.customer_text?.slice(0, 120)}
        </div>
        <div style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>{pct}% match</div>
        <div style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>{open ? '▲' : '▼'}</div>
      </div>
      {open && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid #e0ddd8', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer</div>
            <div style={{ fontSize: 12, color: '#333', whiteSpace: 'pre-wrap' }}>{example.customer_text}</div>
          </div>
          <div style={{ borderTop: '1px solid #f0ede8', paddingTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>DSA Reply</div>
            <div style={{ fontSize: 12, color: '#333', whiteSpace: 'pre-wrap' }}>{example.rep_text}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CustomerServicePage() {
  const [customerText, setCustomerText] = useState('')
  const [language, setLanguage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [examples, setExamples] = useState([])
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    if (!customerText.trim()) return
    setLoading(true)
    setError(null)
    setDraft('')
    setExamples([])
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-draft', {
        body: { customer_text: customerText.trim(), language: language || undefined },
      })
      if (fnError) throw new Error(fnError.message)
      if (data.error) throw new Error(data.error)
      setDraft(data.draft || '')
      setExamples(data.examples || [])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleReset() {
    setCustomerText('')
    setLanguage('')
    setDraft('')
    setExamples([])
    setError(null)
  }

  const hasResult = draft || examples.length > 0

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0, overflow: 'hidden' }}>

      {/* Left panel — input */}
      <div style={{ width: 380, minWidth: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e0ddd8', padding: 16, gap: 12, overflow: 'auto' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Customer message</div>
          <textarea
            value={customerText}
            onChange={e => setCustomerText(e.target.value)}
            placeholder="Paste the customer's message here…"
            style={{ width: '100%', height: 220, resize: 'vertical', padding: '10px 12px', border: '1px solid #d0cdc8', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', lineHeight: 1.5, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Language</div>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d0cdc8', borderRadius: 8, fontSize: 12, background: '#fff', outline: 'none' }}
          >
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>

        <button
          onClick={handleGenerate}
          disabled={!customerText.trim() || loading}
          style={{ padding: '9px 0', background: customerText.trim() && !loading ? '#185FA5' : '#c8d5e0', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: customerText.trim() && !loading ? 'pointer' : 'not-allowed', transition: 'background .15s' }}
        >
          {loading ? 'Generating…' : 'Generate draft'}
        </button>

        {hasResult && (
          <button
            onClick={handleReset}
            style={{ padding: '7px 0', background: 'transparent', color: '#888', border: '1px solid #e0ddd8', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
          >
            Clear & start over
          </button>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: '#fef0f0', border: '1px solid #f5c6c6', borderRadius: 8, fontSize: 12, color: '#c0392b' }}>
            {error}
          </div>
        )}
      </div>

      {/* Right panel — results */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!hasResult && !loading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa', gap: 10 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="6" y="8" width="28" height="22" rx="4" stroke="#d0cdc8" strokeWidth="1.5"/><path d="M6 20l7-6 6 5 5-4 10 7" stroke="#d0cdc8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 34l6-6 6 6" stroke="#d0cdc8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div style={{ fontSize: 13 }}>Paste a customer message and click Generate</div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Draft section */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e0ddd8', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>AI draft</div>
                {draft && (
                  <button
                    onClick={handleCopy}
                    style={{ padding: '5px 12px', background: copied ? '#2e7d32' : '#185FA5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'background .2s' }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
              {loading && !draft ? (
                <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>Searching similar cases and generating draft…</div>
              ) : (
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  style={{ width: '100%', minHeight: 160, resize: 'vertical', padding: '10px 12px', border: '1px solid #d0cdc8', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', lineHeight: 1.6, outline: 'none', boxSizing: 'border-box' }}
                />
              )}
            </div>

            {/* Similar Q&As */}
            {examples.length > 0 && (
              <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>
                  Top {examples.length} similar past cases (click to expand)
                </div>
                {examples.map((ex, i) => <SimilarCard key={ex.id} example={ex} index={i} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
