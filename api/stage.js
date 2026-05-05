// Staging endpoint — X skill POSTs profiles here.
// Saves to Airtable with status="Inbox" for review in the dashboard.
// Dashboard reads via GET /api/load, user selects and pushes to "New".

const AIRTABLE_BASE  = 'appwiWdsmAvz62CTK';
const AIRTABLE_TABLE = 'tblW6mU9xd0BKTdLL';

const F = {
  name:       'fldyTMMYSU53HVtyo',
  company:    'fldSwBGTmB83AqWkz',
  location:   'flduL5j1GQWVqTDvT',
  linkedinUrl:'fld3xYqcUzx9OOcLS',
  source:     'fld6E7ayV5lCQ0AgL',
  signals:    'fldQznFe4G3uKoWIW',
  score:      'fldfM2WorISthIbPR',
  bio:        'fldD3oJ4jm5bMBqNV',
  companyUrl: 'fldkLcnGbjLl7ZKVj',
  status:     'fldfSW7ViqWivnBzS',
  dateFound:  'fldEqPdVh0EkRZy1U',
};

const INDIA_CITIES = ['india','bangalore','bengaluru','mumbai','delhi','hyderabad','pune','chennai','kolkata','noida','gurgaon','gurugram','jaipur','ahmedabad','kochi','ncr','indore','karnataka','maharashtra','telangana'];
const INDIA_INST   = ['iit','iisc','bits','nit ','isb','iiit','iim'];

function hasIndiaSignal(location='', bio='') {
  const t = (location + ' ' + bio).toLowerCase();
  return INDIA_CITIES.some(c => t.includes(c)) || INDIA_INST.some(c => t.includes(c));
}

function scoreProfile(bio='', location='') {
  let s = 10; // X source bonus
  const t = (bio + ' ' + location).toLowerCase();
  const aiKw = ['ai agent','llm','autonomous','agentic','generative ai','genai','rag','ai startup','ai infra'];
  aiKw.forEach(k => { if (t.includes(k)) s += 8; });
  s = Math.min(s, 38);
  if (t.match(/\bai\b/))      s += 10;
  if (t.match(/\bfounder\b/)) s += 15;
  if (t.match(/\bcto\b/)||t.match(/\bceo\b/)) s += 10;
  if (t.includes('building')||t.includes('stealth')) s += 8;
  if (hasIndiaSignal(location, bio)) s += 20;
  return Math.max(0, Math.min(100, Math.round(s)));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const atToken = process.env.AIRTABLE_TOKEN;
  if (!atToken) return res.status(500).json({ error: 'AIRTABLE_TOKEN not set' });

  const { profiles } = req.body || {};
  if (!profiles?.length) return res.status(400).json({ error: 'No profiles provided' });

  const today = new Date().toISOString().split('T')[0];
  let staged = 0;

  for (let i = 0; i < profiles.length; i += 10) {
    const batch = profiles.slice(i, i + 10);
    const records = batch.map(p => ({
      fields: {
        [F.name]:       p.name || p.username || '',
        [F.company]:    p.company || '',
        [F.location]:   p.location || '',
        [F.linkedinUrl]:p.url || `https://x.com/${p.username || ''}`,
        [F.source]:     'X / Twitter',
        [F.signals]:    'India-linked, AI',
        [F.score]:      scoreProfile(p.bio || '', p.location || ''),
        [F.bio]:        p.bio || '',
        [F.companyUrl]: p.website || '',
        [F.status]:     'Reviewing',
        [F.dateFound]:  today,
      }
    }));

    const resp = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${atToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
    if (resp.ok) {
      const data = await resp.json();
      staged += data.records.length;
    }
  }

  return res.status(200).json({ success: true, staged });
};
