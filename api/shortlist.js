// Pushes selected pool profiles to the Shortlist table in the same Airtable base.
// The Shortlist table must exist in Airtable — create it manually if needed.
// POST /api/shortlist  { records: [...] }

const BASE_ID    = 'appoVW6cJXYYhHKnU';
const TABLE_NAME = 'Shortlist';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return res.status(500).json({ error: 'AIRTABLE_TOKEN not set' });

  const { records } = req.body;
  if (!records || !Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'No records provided' });
  }

  const today = new Date().toISOString().split('T')[0];
  let created = 0;

  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10).map(r => ({
      fields: {
        'Name':             r.name       || '',
        'Company':          r.company    || '',
        'Location':         r.location   || '',
        'URL':              r.url        || '',
        'Source':           r.source     || '',
        'Signals':          r.signals    || '',
        'Score':            r.score      || 0,
        'Bio':              r.bio        || '',
        'Company URL':      r.companyUrl || '',
        'Date Found':       r.dateFound  || '',
        'Date Shortlisted': today,
      },
    }));

    const resp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: batch }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(resp.status).json({ error: 'Airtable error', details: err });
    }
    const data = await resp.json();
    created += data.records.length;
  }

  return res.status(200).json({ success: true, created });
};
