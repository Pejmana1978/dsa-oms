export const STAGES = [
  'New',
  'Verified',
  'In Production',
  'Production Complete',
  'Shipped to Sweden',
  'Shipped to Customer',
  'Delivered'
]
export const ROLE_PAGES = {
  admin:           ['orders', 'verified', 'production', 'shipping_us', 'shipping_sweden', 'stock', 'stats', 'archive', 'users'],
  sales:           ['orders', 'stats', 'archive'],
  production:      ['production'],
  shipping_us:     ['shipping_us'],
  shipping_sweden: ['shipping_sweden'],
}
export const PAGE_LABELS = {
  orders:          'All orders',
  verified:        'Verified orders',
  production:      'Production queue',
  shipping_us:     'Shipping (USA)',
  shipping_sweden: 'Shipping (Sweden)',
  stock:           'Sweden stock',
  archive:         'Archive',
  stats:           'Overview',
  users:           'Users',
}
export const BADGE_STYLES = {
  'New':                  { background: '#E6F1FB', color: '#0C447C' },
  'Verified':             { background: '#EEEDFE', color: '#3C3489' },
  'In Production':        { background: '#FBEAF0', color: '#72243E' },
  'Production Complete':  { background: '#EAF3DE', color: '#27500A' },
  'Shipped to Sweden':    { background: '#E1F5EE', color: '#085041' },
  'Shipped to Customer':  { background: '#D4EDDA', color: '#155724' },
  'Delivered':            { background: '#F1EFE8', color: '#444441' },
}
export const SOURCE_STYLES = {
  Website: { background: '#EAF3DE', color: '#3B6D11' },
  eBay:    { background: '#FAEEDA', color: '#854F0B' },
  Manual:  { background: '#F1EFE8', color: '#5F5E5A' },
}
export const POSITION_OPTIONS = [
  'Driver Bottom',
  'Driver Top',
  'Passenger Bottom',
  'Passenger Top',
  'Other',
]
export const MATERIAL_OPTIONS = [
  'Vinyl',
  'Vinyl perf',
  'Leather',
  'Leather perf',
  'Cloth',
  'Vinyl & Alcantara',
  'Other',
]
export const SEAT_OPTIONS = [
  'Full set (5)',
  'Front pair',
  'Rear bench',
  'Driver only',
  'Front + rear',
]
