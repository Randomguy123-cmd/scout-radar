// Receives X (Twitter) profile data and pushes to Airtable.
// GET  → returns target accounts + hashtags for the X scouting skill
// POST → accepts profiles array and pushes India-filtered ones to Airtable

const X_TARGETS = {
  hashtags: [
    '#IndiaAI',
    '#AIIndia',
    '#BuildingInPublic',
    '#StartupIndia',
    '#DeepTechIndia',
    '#MadeInIndia',
    '#IndieHackers',
    '#AIStartup',
    '#LLM',
    '#AIAgent',
  ],
  search_queries: [
    'founder "AI agent" India',
    'building "AI" India stealth',
    '"IIT" OR "IISc" OR "BITS" founder AI',
    'CEO CTO "AI startup" Bangalore',
    'CEO CTO "AI startup" Mumbai',
    'CEO CTO "AI startup" Delhi',
    'founder LLM India "building"',
    '"pre-seed" OR "seed" India AI founder',
  ],
  seed_accounts: [
    // Indian VC / accelerator accounts — scrape followers
    'antler',
    'blume_ventures',
    'kalaari',
    'accel_india',
    'nexusvp',
    'stellaris_vp',
    'sequoiacapital',
    'lightspeedIndia',
    'matrix_india',
    'chiratae',
    // Active Indian AI ecosystem voices
    'suchirmv',
    'kumarshreyas',
    'pratyushbuddy',
    'nileshtrivedi',
    'bharat_s',
  ],
  filters: {
    india_cities: ['india','bangalore','bengaluru','mumbai','delhi','hyderabad','pune','chennai','kolkata','noida','gurgaon','gurugram','jaipur','ahmedabad','kochi','ncr','indore'],
    india_institutions: ['iit','iisc','bits','nit','isb','iiit','iim'],
    founder_signals: ['founder','ceo','cto','building','stealth','co-founder'],
    ai_signals: ['ai','llm','agent','genai','saas','ml','deep learning'],
    exclude_if_only: ['student','intern','looking for','open to work','job seeker'],
  },
};

const AIRTABLE_BASE  = 'appwiWdsmAvz62CTK';
const AIRTABLE_TABLE = 'tblW6mU9xd0BKTdLL';

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
  companyUrl: 'fldkLcnGbjLl7ZKVj',
  status:     'fldfSW7ViqWivnBzS',
  dateFound:  'fldEqPdVh0EkRZy1U',
};

const INDIA_CITIES = ['india','bangalore','bengaluru','mumbai','delhi','hyderabad','pune','chennai','kolkata','noida','gurgaon','gurugram','jaipur','ahmedabad','kochi','lucknow','ncr','indore','karnataka','maharashtra','telangana'];
const INDIA_INST   = ['iit','iisc','bits','nit ','isb','iiit','iim'];

function hasIndiaSignal(location='', bio='') {
  const t = (location + ' ' + bio).toLowerCase();
  return INDIA_CITIES.some(c => t.includes(c)) || INDIA_INST.some(c => t.includes(c));
}

function scoreProfile(bio='', location='') {
  let s = 0;
  const t = (bio + ' ' + location).toLowerCase();

  const aiKw = ['ai agent','llm','autonomous','agentic','generative ai','genai','rag','foundation model','ai startup','ai infra'];
  aiKw.forEach(k => { if (t.includes(k)) s += 8; });
  s = Math.min(s, 30);

  if (t.match(/\bai\b/))       s += 10;
  if (t.match(/\bagent/))      s += 6;
  if (t.match(/\bsaas\b/))     s += 6;
  if (t.match(/\bllm\b/))      s += 6;
  if (t.match(/\bfounder\b/))  s += 15;
  if (t.match(/\bcto\b/)||t.match(/\bceo\b/)) s += 10;
  if (t.includes('building')||t.includes('stealth')) s += 8;
  if (hasIndiaSignal(location, bio)) s += 20;
  s += 10; // X source bonus

  return Math.max(0, Math.min(100, Math.round(s)));
}

async function fetchExistingUrls(atToken) {
  const urls = new Set();
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`);
    url.searchParams.set('fields[]', F.linkedinUrl);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${atToken}` } });
    if (!resp.ok) break;
    const data = await resp.json();
    (data.records || []).forEach(r => {
      const u = r.fields[F.linkedinUrl];
      if (u) urls.add(u.toLowerCase().trim());
    });
    offset = data.offset || null;
  } while (offset);
  return urls;
}

module.exports = async (req, res) => {
  // GET — return target config for the X scouting skill
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json(X_TARGETS);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'GET or POST only' });
  }

  const atToken = process.env.AIRTABLE_TOKEN;
  if (!atToken) return res.status(500).json({ error: 'AIRTABLE_TOKEN not set' });

  // Accept: { profiles: [{ name, username, bio, location, url, company }] }
  const { profiles } = req.body || {};
  if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
    return res.status(400).json({ error: 'No founders provided' });
  }

  // India-only filter
  const indiaProfiles = profiles.filter(p => hasIndiaSignal(p.location || '', p.bio || ''));

  if (indiaProfiles.length === 0) {
    return res.status(200).json({ success: true, received: profiles.length, india: 0, created: 0 });
  }

  // Dedup against existing
  const existingUrls = await fetchExistingUrls(atToken);
  const newProfiles = indiaProfiles.filter(p => {
    const u = (p.url || '').toLowerCase().trim();
    return u && !existingUrls.has(u);
  });

  if (newProfiles.length === 0) {
    return res.status(200).json({ success: true, received: profiles.length, india: indiaProfiles.length, duplicates: indiaProfiles.length, created: 0 });
  }

  const today = new Date().toISOString().split('T')[0];
  let created = 0;

  for (let i = 0; i < newProfiles.length; i += 10) {
    const batch = newProfiles.slice(i, i + 10);
    const records = batch.map(p => ({
      fields: {
        [F.name]:       p.name || p.username || '',
        [F.company]:    p.company || '',
        [F.location]:   p.location || '',
        [F.linkedinUrl]:p.url || `https://x.com/${p.username}`,
        [F.source]:     'X (Twitter)',
        [F.signals]:    'India-linked, AI',
        [F.score]:      scoreProfile(p.bio || '', p.location || ''),
        [F.bio]:        p.bio || '',
        [F.companyUrl]: p.website || '',
        [F.status]:     'New',
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
      created += data.records.length;
    } else {
      console.error('Airtable push error:', await resp.text());
    }
  }

  return res.status(200).json({
    success: true,
    received: profiles.length,
    india: indiaProfiles.length,
    new: newProfiles.length,
    created,
  });
};
