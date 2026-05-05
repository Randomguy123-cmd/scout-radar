// Daily scout scan — runs via Vercel Cron at 8am IST (2:30am UTC)
// Searches GitHub + HN, filters India + Score≥50, deduplicates, pushes to Airtable.

const AIRTABLE_BASE  = 'appwiWdsmAvz62CTK';
const AIRTABLE_TABLE = 'tblW6mU9xd0BKTdLL';
const MIN_SCORE      = 50;

// Airtable field IDs
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
const INDIA_INST   = ['iit','iisc','bits pilani','nit ','isb ','iiit','iim '];
const EMPLOYEE_SIG = ['software engineer at','sde at','developer at','engineer at','intern at','student at','looking for','open to work'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function hasIndiaSignal(location='', bio='', company='') {
  const t = (location + bio + company).toLowerCase();
  return INDIA_CITIES.some(c => t.includes(c)) || INDIA_INST.some(c => t.includes(c));
}

function score(bio='', company='', location='', source='github', followers=0, hasBlog=false) {
  let s = 0;
  const t = (bio + ' ' + company).toLowerCase();

  const aiKw = ['ai agent','llm','autonomous agent','agentic','generative ai','genai','rag','foundation model','ai startup','ai founder','ai infra'];
  aiKw.forEach(k => { if (t.includes(k)) s += 8; });
  s = Math.min(s, 30);

  const strongBg = ['iit','iisc','bits','nit ','ex-google','ex-amazon','ex-microsoft','ex-flipkart','ex-razorpay','ex-uber','ex-openai','ex-deepmind','faang','stanford','mit'];
  strongBg.forEach(k => { if (t.includes(k)) s += 12; });
  s = Math.min(s + 30, 54); // cap bg bonus at 24

  if (t.match(/\bai\b/))       s += 10;
  if (t.match(/\bagent/))      s += 6;
  if (t.match(/\bsaas\b/))     s += 6;
  if (t.match(/\bllm\b/))      s += 6;
  if (t.match(/\bgenai\b/)||t.includes('gen ai')) s += 6;
  if (t.match(/\bfounder\b/))  s += 15;
  if (t.match(/\bcto\b/)||t.match(/\bceo\b/)) s += 10;
  if (t.includes('building')||t.includes('stealth')) s += 8;
  if (hasBlog)                 s += 10;
  if (followers > 0)           s += Math.min(Math.log10(followers) * 5, 15);
  if (hasIndiaSignal(location, bio, company)) s += 20;
  if (source === 'hn')         s += 10;

  EMPLOYEE_SIG.forEach(x => { if (t.includes(x)) s -= 15; });

  return Math.max(0, Math.min(100, Math.round(s)));
}

// Fetch all existing names from Airtable (paginated) for deduplication
async function fetchExistingNames(atToken) {
  const names = new Set();
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`);
    url.searchParams.set('fields[]', F.name);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${atToken}` } });
    if (!resp.ok) break;
    const data = await resp.json();
    (data.records || []).forEach(r => {
      const n = r.fields[F.name];
      if (n) names.add(n.toLowerCase().trim());
    });
    offset = data.offset || null;
  } while (offset);
  return names;
}

async function searchGitHub(ghToken) {
  const headers = { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.v3+json' };
  const results = [];
  const seen = new Set();
  const today = new Date(); today.setDate(today.getDate() - 90);
  const cutoff = today.toISOString().slice(0, 10);

  const repoQueries = [
    `ai+agent+india+stars:3..500+pushed:>${cutoff}+NOT+tutorial`,
    `llm+startup+india+stars:3..300+pushed:>${cutoff}`,
    `ai+saas+india+stars:3..300+pushed:>${cutoff}+NOT+tutorial`,
    `agentic+workflow+stars:3..500+pushed:>${cutoff}+NOT+awesome`,
    `ai+agent+stars:3..500+pushed:>${cutoff}+NOT+tutorial+NOT+course`,
    `mcp+server+ai+stars:3..300+pushed:>${cutoff}`,
  ];

  const userQueries = [
    `location:India+type:user+AI+founder`,
    `location:India+type:user+LLM+founder`,
    `location:Bangalore+type:user+AI+founder`,
    `location:Bengaluru+type:user+AI+founder`,
  ];

  // Repo searches
  for (const q of repoQueries) {
    try {
      const resp = await fetch(
        `https://api.github.com/search/repositories?q=${q}&sort=updated&per_page=30`,
        { headers }
      );
      if (resp.status === 429 || resp.status === 403) { await sleep(60000); continue; }
      if (!resp.ok) continue;
      const data = await resp.json();

      const owners = (data.items || [])
        .map(r => ({ login: r.owner?.login, blog: r.homepage || '', desc: r.description || '' }))
        .filter(o => o.login && !seen.has(o.login));
      owners.forEach(o => seen.add(o.login));

      for (let i = 0; i < owners.length; i += 8) {
        const chunk = owners.slice(i, i + 8);
        const profiles = await Promise.all(
          chunk.map(o => fetch(`https://api.github.com/users/${o.login}`, { headers })
            .then(r => r.ok ? r.json() : null).catch(() => null))
        );
        for (let j = 0; j < profiles.length; j++) {
          const p = profiles[j];
          if (!p) continue;
          if (!hasIndiaSignal(p.location, p.bio, p.company)) continue;
          const s = score(p.bio, p.company || '', p.location || '', 'github', p.followers, !!(p.blog || chunk[j].blog));
          if (s < MIN_SCORE) continue;
          results.push({ name: p.name || p.login, username: p.login, bio: p.bio || '', company: p.company || '', location: p.location || '', url: p.html_url, blog: p.blog || chunk[j].blog, source: 'github', score: s });
        }
        if (i + 8 < owners.length) await sleep(100);
      }
    } catch (e) { console.error('GH repo error:', e.message); }
    await sleep(2100);
  }

  // User searches
  for (const q of userQueries) {
    try {
      const resp = await fetch(
        `https://api.github.com/search/users?q=${q}&per_page=30`,
        { headers }
      );
      if (resp.status === 429 || resp.status === 403) { await sleep(60000); continue; }
      if (!resp.ok) continue;
      const data = await resp.json();

      const batch = (data.items || []).filter(u => !seen.has(u.login));
      batch.forEach(u => seen.add(u.login));

      for (let i = 0; i < batch.length; i += 8) {
        const chunk = batch.slice(i, i + 8);
        const profiles = await Promise.all(
          chunk.map(u => fetch(`https://api.github.com/users/${u.login}`, { headers })
            .then(r => r.ok ? r.json() : null).catch(() => null))
        );
        for (const p of profiles) {
          if (!p) continue;
          const s = score(p.bio, p.company || '', p.location || '', 'github', p.followers, !!p.blog);
          if (s < MIN_SCORE) continue;
          results.push({ name: p.name || p.login, username: p.login, bio: p.bio || '', company: p.company || '', location: p.location || '', url: p.html_url, blog: p.blog || '', source: 'github', score: s });
        }
        if (i + 8 < batch.length) await sleep(100);
      }
    } catch (e) { console.error('GH user error:', e.message); }
    await sleep(2100);
  }

  return results;
}

async function searchHN() {
  const results = [];
  const seen = new Set();
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
  const queries = ['AI agent India', 'LLM startup India', 'Show HN AI India', 'generative AI India founder'];

  await Promise.all(queries.map(async q => {
    try {
      const resp = await fetch(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=show_hn&hitsPerPage=20&numericFilters=created_at_i>${cutoff}`
      );
      const data = await resp.json();
      for (const h of (data.hits || [])) {
        if (seen.has(h.objectID)) continue;
        seen.add(h.objectID);
        const t = (h.title + ' ' + (h.story_text || '')).toLowerCase();
        if (!INDIA_CITIES.some(c => t.includes(c))) continue;
        const s = score(h.title, '', 'India', 'hn', 0, false);
        if (s < MIN_SCORE) continue;
        results.push({
          name: h.author, username: h.author,
          bio: h.title, company: h.title.replace(/^Show HN:\s*/i, '').split(/[–—\-:]/).shift().trim(),
          location: 'India (HN)', url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          blog: '', source: 'hn', score: s,
        });
      }
    } catch (e) { console.error('HN error:', e.message); }
  }));

  return results;
}

async function pushToAirtable(founders, atToken) {
  const sourceMap = { github: 'GitHub', hn: 'Hacker News', ph: 'Product Hunt' };
  let created = 0;
  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < founders.length; i += 10) {
    const batch = founders.slice(i, i + 10);
    const records = batch.map(f => ({
      fields: {
        [F.name]:       f.name || '',
        [F.company]:    f.company || '',
        [F.location]:   f.location || '',
        [F.linkedinUrl]:f.url || '',
        [F.source]:     sourceMap[f.source] || 'GitHub',
        [F.signals]:    'India-linked, AI',
        [F.score]:      f.score || 0,
        [F.bio]:        f.bio || '',
        [F.companyUrl]: f.blog || '',
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
  return created;
}

module.exports = async (req, res) => {
  // Verify cron secret (Vercel sets Authorization header automatically for cron calls)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ghToken = process.env.GITHUB_TOKEN;
  const atToken = process.env.AIRTABLE_TOKEN;
  if (!atToken) return res.status(500).json({ error: 'AIRTABLE_TOKEN not set' });

  const startTime = Date.now();
  console.log('[scan] Starting daily scout scan');

  try {
    const existingNames = await fetchExistingNames(atToken);
    console.log(`[scan] ${existingNames.size} existing records in Airtable`);

    const [ghResults, hnResults] = await Promise.all([
      ghToken ? searchGitHub(ghToken) : (console.log('[scan] No GITHUB_TOKEN — skipping GitHub'), Promise.resolve([])),
      searchHN(),
    ]);

    const allResults = [...ghResults, ...hnResults];

    // Deduplicate across sources by username
    const deduped = {};
    allResults.forEach(r => {
      if (!deduped[r.username] || r.score > deduped[r.username].score) deduped[r.username] = r;
    });

    // Remove already-in-Airtable founders
    const newFounders = Object.values(deduped)
      .filter(r => !existingNames.has(r.name.toLowerCase().trim()))
      .sort((a, b) => b.score - a.score);

    console.log(`[scan] ${allResults.length} found → ${newFounders.length} new`);

    const created = newFounders.length ? await pushToAirtable(newFounders, atToken) : 0;
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(`[scan] Done — pushed ${created} new founders in ${duration}s`);
    return res.status(200).json({ success: true, scanned: allResults.length, new: newFounders.length, created, duration_s: duration });

  } catch (e) {
    console.error('[scan] Fatal error:', e);
    return res.status(500).json({ error: e.message });
  }
};
