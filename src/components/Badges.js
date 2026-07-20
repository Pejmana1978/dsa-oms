import { BADGE_STYLES, SOURCE_STYLES } from '../lib/constants'

export function StageBadge({ stage }) {
  const style = BADGE_STYLES[stage] || { background: '#eee', color: '#555' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 500,
      ...style
    }}>{stage}</span>
  )
}

export function SourceBadge({ source }) {
  const style = SOURCE_STYLES[source] || { background: '#eee', color: '#555' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 5,
      fontSize: 11,
      ...style
    }}>{source}</span>
  )
}

export function RoleBadge({ role }) {
  const styles = {
    admin:           { background: '#E6F1FB', color: '#0C447C' },
    sales:           { background: '#EAF3DE', color: '#27500A' },
    production:      { background: '#FBEAF0', color: '#72243E' },
    shipping_us:     { background: '#E1F5EE', color: '#085041' },
    shipping_sweden: { background: '#E1F5EE', color: '#085041' },
  }
  const s = styles[role] || { background: '#eee', color: '#555' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 500,
      ...s
    }}>{role}</span>
  )
}
