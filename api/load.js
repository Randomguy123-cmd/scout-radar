// Loads records from Airtable for the dashboard inbox view.
// GET /api/load?status=Inbox  — returns staged profiles
// GET /api/load               — returns all records

const AIRTABLE_BASE  = 'appwiWdsmAvz62CTK';
const AIRTABLE_TABLE = 'tblW6mU9xd0BKTdLL';

const F = {
  name:       'fldyTMMYSU53HVtyo',
  company:    'fldSwBGTmB83AqWkz',
  location:   'flduL5j1GQWVqTDvT',
  linkedinUrl:'fld3xYqcUzx9OOcLS',
  source:     'fld6E7ayV5lCQ0AgL',
  score:      'fldfM2WorISthIbPR',
  bio:        'fldD3oJ4jm5bMBqNV',
  companyUrl: 'fldkLcnGbjLl7ZKVj',
  status:     'fldfSW7ViqWivnBzS',
  dateFound:  'fldEqPdVh0EkRZy1U',
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
    url.searchParams.set('filterByFormula', `{${F.status}} = "${statusFilter}"`);
    [F.name, F.company, F.location, F.linkedinUrl, F.source, F.score, F.bio, F.companyUrl, F.status, F.dateFound]
      .forEach(fid => url.searchParams.append('fields[]', fid));
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${atToken}` }
    });
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
    const data = await resp.json();

    (data.records || []).forEach(r => {
      records.push({
        airtableId: r.id,
        name:       r.fields[F.name] || '',
        company:    r.fields[F.company] || '',
        location:   r.fields[F.location] || '',
        url:        r.fields[F.linkedinUrl] || '',
        source:     typeof r.fields[F.source] === 'object' ? r.fields[F.source]?.name : (r.fields[F.source] || ''),
        score:      r.fields[F.score] || 0,
        bio:        r.fields[F.bio] || '',
        blog:       r.fields[F.companyUrl] || '',
        status:     typeof r.fields[F.status] === 'object' ? r.fields[F.status]?.name : (r.fields[F.status] || ''),
        dateFound:  r.fields[F.dateFound] || '',
      });
    });
    offset = data.offset || null;
  } while (offset);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ records, total: records.length });
};
