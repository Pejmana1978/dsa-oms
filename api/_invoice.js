// Parses the text of a Stripe invoice PDF into the fields a manual OMS order
// needs. Deliberately conservative: anything it isn't sure about is left blank
// for the operator to fill in, because a silently wrong production spec is far
// worse than an empty field.

const COUNTRY_TO_CODE = {
  'united kingdom': 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  germany: 'DE', deutschland: 'DE', france: 'FR', sweden: 'SE', sverige: 'SE', denmark: 'DK',
  norway: 'NO', finland: 'FI', iceland: 'IS', italy: 'IT', italia: 'IT', spain: 'ES', espana: 'ES',
  portugal: 'PT', netherlands: 'NL', 'the netherlands': 'NL', belgium: 'BE', austria: 'AT',
  switzerland: 'CH', ireland: 'IE', poland: 'PL', hungary: 'HU', greece: 'GR', czechia: 'CZ',
  'czech republic': 'CZ', slovakia: 'SK', slovenia: 'SI', croatia: 'HR', romania: 'RO',
  bulgaria: 'BG', luxembourg: 'LU', estonia: 'EE', latvia: 'LV', lithuania: 'LT', malta: 'MT',
  cyprus: 'CY', australia: 'AU', 'new zealand': 'NZ', 'united states': 'US', usa: 'US',
  canada: 'CA', japan: 'JP',
};

const CURRENCY_BY_SYMBOL = { '€': 'EUR', '$': 'USD', '£': 'GBP', kr: 'SEK' };

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function toIsoDate(s) {
  const m = String(s || '').match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return '';
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return '';
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

function money(token) {
  const s = String(token || '');
  const symbol = (s.match(/[€$£]/) || [])[0] || (/\bkr\b/i.test(s) ? 'kr' : '');
  // Strip the symbol, then normalise 1,234.56 / 1 234,56 to a plain number.
  let n = s.replace(/[€$£]|kr/gi, '').trim().replace(/\s/g, '');
  if (/,\d{2}$/.test(n)) n = n.replace(/\./g, '').replace(',', '.');
  else n = n.replace(/,/g, '');
  const value = parseFloat(n);
  return { value: isFinite(value) ? value : null, currency: CURRENCY_BY_SYMBOL[symbol] || '' };
}

// Recognise what we can from the free-text product description. Same vocabulary
// as the eBay/Woo sync so an order looks the same wherever it came from.
export function specFromDescription(desc) {
  const t = String(desc || '');
  const year = (t.match(/\b(19|20)\d{2}\b/) || [])[0] || '';

  const MODELS = [
    ['glc', 'Mercedes-Benz GLC'], ['gle', 'Mercedes-Benz GLE'], ['gls', 'Mercedes-Benz GLS'],
    ['\\bml\\b', 'Mercedes-Benz ML'], ['c-?class', 'Mercedes-Benz C-Class'],
    ['e-?class', 'Mercedes-Benz E-Class'], ['s-?class', 'Mercedes-Benz S-Class'],
    ['slk', 'Mercedes-Benz SLK'], ['\\bsl\\b', 'Mercedes-Benz SL'],
    ['grand cherokee', 'Jeep Grand Cherokee'], ['wrangler', 'Jeep Wrangler'],
    ['mustang', 'Ford Mustang'], ['f-?150', 'Ford F-150'],
    ['discovery', 'Land Rover Discovery'], ['range rover', 'Land Rover Range Rover'],
    ['corvette', 'Chevrolet Corvette'], ['silverado', 'Chevrolet Silverado'],
    ['\\bram\\b', 'RAM'], ['tundra', 'Toyota Tundra'], ['tacoma', 'Toyota Tacoma'],
  ];
  let car = '';
  for (const [pattern, name] of MODELS) {
    if (new RegExp(pattern, 'i').test(t)) { car = year ? `${name} ${year}` : name; break; }
  }

  const position = [];
  const sides = [];
  if (/\bdriver\b/i.test(t)) sides.push('Driver');
  if (/\bpassenger\b/i.test(t)) sides.push('Passenger');
  const seats = [];
  if (/\bbottom/i.test(t)) seats.push('Bottom');
  if (/\btop|\bback(rest)?\b/i.test(t)) seats.push('Top');
  for (const side of sides) for (const seat of seats) position.push(`${side} ${seat}`);

  let material = '';
  if (/leather\s*perf/i.test(t)) material = 'Leather perf';
  else if (/\bleather\b/i.test(t)) material = 'Leather';
  else if (/vinyl\s*perf/i.test(t)) material = 'Vinyl perf';
  else if (/\bvinyl\b|mb-?\s?tex|mbtex/i.test(t)) material = 'Vinyl';  // MB Tex = Mercedes' vinyl
  else if (/alcantara/i.test(t)) material = 'Vinyl & Alcantara';
  else if (/\bcloth\b|fabric/i.test(t)) material = 'Cloth';

  const colorMatch = t.match(/\b(black|grey|gray|beige|brown|red|blue|navy|tan|white|cream|camel|cognac|bordeaux|anthracite|almond)\b/i);
  const color = colorMatch ? colorMatch[1][0].toUpperCase() + colorMatch[1].slice(1).toLowerCase() : '';

  return { car, year, position, material, color };
}

/** Pull the lines of a labelled address block ("Ship to" / "Bill to"). */
function addressBlock(lines, label) {
  const start = lines.findIndex(l => l.trim().toLowerCase() === label.toLowerCase());
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (/^(bill to|ship to|pay online|description\b|subtotal|total|amount due)/i.test(l)) break;
    if (/\bdue\b\s+[A-Z][a-z]+ \d/i.test(l)) break;      // "€333.84 due July 25, 2026"
    out.push(l);
  }
  return out;
}

export function parseStripeInvoice(rawText) {
  // Stripe's PDF font has no glyph mapping for some characters, so "+", "-" and
  // certain spaces are extracted as NUL bytes ("76BF5E7C<NUL>0028", "MB<NUL>Tex",
  // "<NUL>40 745..."). Normalise them to spaces; real separators are rebuilt below.
  const lines = String(rawText || '')
    .replace(/[\u0000\u00a0\u2007\u202f]/g, ' ')
    .split('\n')
    .map(l => l.trimEnd());
  const text = lines.join('\n');
  const find = (re) => (text.match(re) || [])[1] || '';

  // Stripe numbers look like 76BF5E7C-0028; PDF extraction loses the hyphen.
  let invoiceNumber = find(/Invoice number\s+([A-Z0-9][A-Z0-9\- ]{4,})/i).trim();
  invoiceNumber = invoiceNumber.replace(/\s+/g, '-');

  const orderDate = toIsoDate(find(/Date of issue\s+(.+)/i));

  // Prefer the delivery address; fall back to the billing one.
  const shipTo = addressBlock(lines, 'Ship to');
  const billTo = addressBlock(lines, 'Bill to');
  const block = shipTo.length ? shipTo : billTo;

  const emailFrom = (arr) => (arr.join(' ').match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [])[0] || '';
  // The seller's own address appears first, so only read the customer blocks.
  const email = emailFrom(billTo) || emailFrom(shipTo);

  const isPhone = (l) => /^[+\d][\d\s()\-.]{6,}$/.test(l.trim());
  const isVat = (l) => /\bVAT\b/i.test(l);
  const phoneRaw = (block.find(isPhone) || '').trim();
  // A leading "+" is commonly lost in extraction — restore it for long numbers.
  const phone = phoneRaw && !phoneRaw.startsWith('+') && phoneRaw.replace(/\D/g, '').length > 9
    ? '+' + phoneRaw.replace(/^\s+/, '')
    : phoneRaw;

  const body = block.filter(l => !isPhone(l) && !isVat(l) && !/@/.test(l));
  const customerName = body[0] || '';
  const rest = body.slice(1);
  // Last non-empty line is the country; convert to the ISO code UPS/the OMS use.
  const countryLine = rest.length ? rest[rest.length - 1] : '';
  const countryCode = COUNTRY_TO_CODE[countryLine.trim().toLowerCase()] || '';
  const addressLines = countryCode ? rest.slice(0, -1) : rest;
  const address = [...addressLines, countryCode || countryLine].filter(Boolean).join(', ');

  // Line items sit between the table header and the totals.
  const headerIdx = lines.findIndex(l => /^\s*Description\b.*\bQty\b/i.test(l));
  const items = [];
  if (headerIdx !== -1) {
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l) continue;
      if (/^(subtotal|total|amount due|tax\b)/i.test(l)) break;
      // "<description> <qty> <unit price> <amount>"
      const m = l.match(/^(.*\S)\s+(\d+)\s+((?:[€$£]|kr\s?)[\d.,\s]+|[\d.,]+\s?kr)\s+((?:[€$£]|kr\s?)[\d.,\s]+|[\d.,]+\s?kr)$/i);
      if (!m) continue;
      const description = m[1].trim();
      const amount = money(m[4]);
      items.push({
        description,
        quantity: parseInt(m[2], 10) || 1,
        price: amount.value,
        currency: amount.currency,
        ...specFromDescription(description),
      });
    }
  }

  const totalTok = find(/\bTotal\s+((?:[€$£]|kr\s?)[\d.,\s]+|[\d.,]+\s?kr)/i)
    || find(/Amount due\s+((?:[€$£]|kr\s?)[\d.,\s]+|[\d.,]+\s?kr)/i);
  const total = money(totalTok);

  const reverseCharge = /reverse charge/i.test(text);

  return {
    invoiceNumber,
    orderDate,
    customerName,
    email,
    phone,
    address,
    countryCode,
    items,
    total: total.value,
    currency: total.currency || (items[0] && items[0].currency) || '',
    reverseCharge,
  };
}
