// Vercel serverless function — pushes founders to Airtable
// Handles both single and bulk pushes

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'AIRTABLE_TOKEN not configured' });
  }

  const BASE_ID = 'appoVW6cJXYYhHKnU';
  const TABLE_ID = 'tblw5OF9akHaMtH38';

  // Field IDs for the Scouted Founders table
  const F = {
    name:       'fldyTMMYSU53HVtyo',
    title:      'fldCNMzuyzYRsIJ1j',
    company:    'fldSwBGTmB83AqWkz',
    location:   'flduL5j1GQWVqTDvT',
    linkedinUrl:'fld3xYqcUzx9OOcLS',
    source:     'fld6E7ayV5lCQ0AgL',
    signals:    'fldQznFe4G3uKoWIW',
    score:      'fldfM2WorISthIbPR',
    bio:        'fldD3oJ4jm5bMBqNV',
    salesNavUrl:'fldJHTn8MvJ0QJxar',
    companyUrl: 'fldkLcnGbjLl7ZKVj',
    status:     'fldfSW7ViqWivnBzS',
    dateFound:  'fldEqPdVh0EkRZy1U',
  };

  const sourceMap = {
    github: 'GitHub',
    hn: 'Hacker News',
    ph: 'Product Hunt',
    manual: 'X / Twitter',
    'linkedin-sales-nav': 'LinkedIn Sales Nav',
  };

  try {
    const { founders } = req.body; // array of founder objects
    if (!founders || !Array.isArray(founders) || !founders.length) {
      return res.status(400).json({ error: 'No founders provided' });
    }

    // Airtable allows max 10 records per request
    const batches = [];
    for (let i = 0; i < founders.length; i += 10) {
      batches.push(founders.slice(i, i + 10));
    }

    let created = 0;
    for (const batch of batches) {
      const records = batch.map(f => ({
        fields: {
          [F.name]:        f.name || '',
          [F.title]:       f.title || '',
          [F.company]:     f.company || '',
          [F.location]:    f.location || '',
          [F.linkedinUrl]: f.linkedin_url || f.url || '',
          [F.source]:      sourceMap[f.source] || 'Manual',
          [F.signals]:     (f.signals || []).join(', '),
          [F.score]:       f.score || 0,
          [F.bio]:         f.bio || '',
          [F.salesNavUrl]: f.sales_nav_url || '',
          [F.companyUrl]:  f.company_url || '',
          [F.status]:      'New',
          [F.dateFound]:   new Date().toISOString().split('T')[0],
        }
      }));

      const resp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        console.error('Airtable error:', err);
        return res.status(resp.status).json({ error: 'Airtable API error', details: err });
      }

      const data = await resp.json();
      created += data.records.length;
    }

    return res.status(200).json({ success: true, created });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: e.message });
  }
}
