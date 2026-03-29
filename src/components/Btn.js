export default function Btn({ children, onClick, variant = 'default', size = 'md', disabled, type = 'button', style = {} }) {
  const base = {
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid',
    borderRadius: 6,
    fontWeight: 400,
    lineHeight: 1.4,
    opacity: disabled ? 0.5 : 1,
    transition: 'background .1s',
    ...style
  }
  const sizes = {
    sm: { padding: '3px 9px', fontSize: 11 },
    md: { padding: '6px 13px', fontSize: 13 },
    lg: { padding: '9px 18px', fontSize: 14 },
  }
  const variants = {
    default: { background: 'transparent', borderColor: '#ccc', color: '#333' },
    primary: { background: '#185FA5', borderColor: '#185FA5', color: '#fff' },
    success: { background: '#1D9E75', borderColor: '#1D9E75', color: '#fff' },
    danger:  { background: 'transparent', borderColor: '#A32D2D', color: '#A32D2D' },
    ghost:   { background: 'transparent', border: 'none', color: '#185FA5', padding: 0 },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...sizes[size], ...variants[variant] }}>
      {children}
    </button>
  )
}
