export const STAGES = [
  'New',
  'Awaiting verification',
  'Verified',
  'In production',
  'Production completed',
  'Packed',
  'Shipped'
]

export const ROLE_PAGES = {
  admin:      ['orders', 'production', 'shipping', 'stats', 'users'],
  sales:      ['orders', 'stats'],
  production: ['production'],
  shipping:   ['shipping'],
}

export const PAGE_LABELS = {
  orders:     'All orders',
  production: 'Production queue',
  shipping:   'Shipping',
  stats:      'Overview',
  users:      'Users',
}

export const BADGE_STYLES = {
  'New':                    { background: '#E6F1FB', color: '#0C447C' },
  'Awaiting verification':  { background: '#FAEEDA', color: '#633806' },
  'Verified':               { background: '#EEEDFE', color: '#3C3489' },
  'In production':          { background: '#FBEAF0', color: '#72243E' },
  'Production completed':   { background: '#EAF3DE', color: '#27500A' },
  'Packed':                 { background: '#E1F5EE', color: '#085041' },
  'Shipped':                { background: '#F1EFE8', color: '#444441' },
}

export const SOURCE_STYLES = {
  Shopify: { background: '#EAF3DE', color: '#3B6D11' },
  eBay:    { background: '#FAEEDA', color: '#854F0B' },
  Manual:  { background: '#F1EFE8', color: '#5F5E5A' },
}

export const SEAT_OPTIONS = [
  'Full set (5)',
  'Front pair',
  'Rear bench',
  'Driver only',
  'Front + rear',
]
