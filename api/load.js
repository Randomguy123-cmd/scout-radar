// Loads records from Airtable.
// GET /api/load          — returns all records (pool view)
// GET /api/load?status=Reviewing — returns staged profiles only

const AIRTABLE_BASE  = 'appoVW6cJXYYhHKnU';
const AIRTABLE_TABLE = 'tblw5OF9akHaMtH38';

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const atToken = process.env.AIRTABLE_TOKEN;
  if (!atToken) return res.status(500).json({ error: 'AIRTABLE_TOKEN not set' });

  const statusFilter = req.query.status || null;
  const records = [];
  let offset = null;

  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`);
    if (statusFilter) url.searchParams.set('filterByFormula', `{Source} = "X / Twitter"`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('sort[0][field]', 'Date Found');
    url.searchParams.set('sort[0][direction]', 'desc');
    if (offset) url.searchParams.set('offset', offset);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${atToken}` }
    });
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
    const data = await resp.json();

    (data.records || []).forEach(r => {
      const f = r.fields || {};
      records.push({
        airtableId: r.id,
        name:       f['Name']        || '',
        company:    f['Company']     || '',
        location:   f['Location']    || '',
        url:        f['URL']         || '',
        source:     f['Source']      || '',
        signals:    f['Signals']     || '',
        score:      f['Score']       || 0,
        bio:        f['Bio']         || '',
        companyUrl: f['Company URL'] || '',
        status:     f['Status']      || '',
        dateFound:  f['Date Found']  || '',
      });
    });
    offset = data.offset || null;
  } while (offset);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ records, total: records.length });
};
