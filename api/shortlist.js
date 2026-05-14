// Pushes selected pool profiles to the Shortlist table in the same Airtable base.
// Creates the Shortlist table automatically if it doesn't exist yet.
// POST /api/shortlist  { records: [...] }

const BASE_ID  = 'appoVW6cJXYYhHKnU';
const TABLE_NAME = 'Shortlist';

async function getOrCreateTable(token) {
  // List tables in the base
  const listResp = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listResp.ok) throw new Error('Cannot list tables: ' + await listResp.text());
  const { tables } = await listResp.json();
  const existing = tables.find(t => t.name === TABLE_NAME);
  if (existing) return existing.id;

  // Create the table
  const createResp = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: TABLE_NAME,
      description: 'Shortlisted founders from the Pool',
      fields: [
        { name: 'Name',        type: 'singleLineText' },
        { name: 'Company',     type: 'singleLineText' },
        { name: 'Location',    type: 'singleLineText' },
        { name: 'URL',         type: 'url' },
        { name: 'Source',      type: 'singleLineText' },
        { name: 'Signals',     type: 'multilineText' },
        { name: 'Score',       type: 'number', options: { precision: 0 } },
        { name: 'Bio',         type: 'multilineText' },
        { name: 'Company URL', type: 'url' },
        { name: 'Date Found',  type: 'singleLineText' },
        { name: 'Date Shortlisted', type: 'singleLineText' },
      ],
    }),
  });
  if (!createResp.ok) throw new Error('Cannot create table: ' + await createResp.text());
  const table = await createResp.json();
  return table.id;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return res.status(500).json({ error: 'AIRTABLE_TOKEN not set' });

  const { records } = req.body;
  if (!records || !Array.isArray(records) || !records.length) {
    return res.status(400).json({ error: 'No records provided' });
  }

  try {
    const tableId = await getOrCreateTable(token);
    const today = new Date().toISOString().split('T')[0];
    let created = 0;

    for (let i = 0; i < records.length; i += 10) {
      const batch = records.slice(i, i + 10).map(r => ({
        fields: {
          'Name':               r.name        || '',
          'Company':            r.company     || '',
          'Location':           r.location    || '',
          'URL':                r.url         || '',
          'Source':             r.source      || '',
          'Signals':            r.signals     || '',
          'Score':              r.score       || 0,
          'Bio':                r.bio         || '',
          'Company URL':        r.companyUrl  || '',
          'Date Found':         r.dateFound   || '',
          'Date Shortlisted':   today,
        },
      }));

      const resp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`, {
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
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
