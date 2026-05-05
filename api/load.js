// Loads records from Airtable for the X Profiles review view.
// GET /api/load?status=Reviewing  — returns staged profiles

const AIRTABLE_BASE  = 'appwiWdsmAvz62CTK';
const AIRTABLE_TABLE = 'tblW6mU9xd0BKTdLL';

// Field names (used as keys in r.fields when no fields[] restriction is set)
const FNAME = {
  name:       'Name',
  company:    'Company',
  location:   'Location',
  linkedinUrl:'LinkedIn / Profile URL',
  source:     'Source',
  score:      'Score',
  bio:        'Bio / Tagline',
  companyUrl: 'Company URL',
  status:     'Status',
  dateFound:  'Date Found',
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const atToken = process.env.AIRTABLE_TOKEN;
  if (!atToken) return res.status(500).json({ error: 'AIRTABLE_TOKEN not set' });

  const statusFilter = req.query.status || 'Reviewing';
  const records = [];
  let offset = null;

  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`);
    url.searchParams.set('filterByFormula', `Status = "${statusFilter}"`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${atToken}` }
    });
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
    const data = await resp.json();

    // Log first record's keys to debug field names
    if (data.records?.length && records.length === 0) {
      console.log('[load] Sample field keys:', Object.keys(data.records[0].fields || {}));
    }

    (data.records || []).forEach(r => {
      const f = r.fields || {};
      // Try field IDs first, fall back to any key containing the concept
      const get = (id, fallbackKeys) => {
        if (f[id] !== undefined) return f[id];
        for (const k of (fallbackKeys || [])) {
          const found = Object.keys(f).find(key => key.toLowerCase().includes(k.toLowerCase()));
          if (found) return f[found];
        }
        return '';
      };

      const sourceVal = get('fld6E7ayV5lCQ0AgL', ['source']);
      const statusVal = get('fldfSW7ViqWivnBzS', ['status']);

      records.push({
        airtableId: r.id,
        name:       get('fldyTMMYSU53HVtyo', ['name']) || '',
        company:    get('fldSwBGTmB83AqWkz', ['company']) || '',
        location:   get('flduL5j1GQWVqTDvT', ['location']) || '',
        url:        get('fld3xYqcUzx9OOcLS', ['linkedin', 'profile', 'url']) || '',
        source:     typeof sourceVal === 'object' ? sourceVal?.name : (sourceVal || ''),
        score:      get('fldfM2WorISthIbPR', ['score']) || 0,
        bio:        get('fldD3oJ4jm5bMBqNV', ['bio', 'tagline']) || '',
        blog:       get('fldkLcnGbjLl7ZKVj', ['company url', 'blog']) || '',
        status:     typeof statusVal === 'object' ? statusVal?.name : (statusVal || ''),
        dateFound:  get('fldEqPdVh0EkRZy1U', ['date']) || '',
      });
    });
    offset = data.offset || null;
  } while (offset);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ records, total: records.length });
};
