// Daily scout scan — runs via Vercel Cron at 8am IST (2:30am UTC)
// Searches GitHub + HN, filters by India signal + builder signal, pushes to Airtable.

const AIRTABLE_BASE  = 'appwiWdsmAvz62CTK';
const AIRTABLE_TABLE = 'tblW6mU9xd0BKTdLL';

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

// ── India location signals ────────────────────────────────────────────────────
const INDIA_CITIES = [
  'india','bangalore','bengaluru','mumbai','delhi','hyderabad','pune','chennai',
  'kolkata','noida','gurgaon','gurugram','jaipur','ahmedabad','kochi','lucknow',
  'ncr','indore','karnataka','maharashtra','telangana','tamil nadu','gujarat',
  'kerala','rajasthan','chandigarh','coimbatore','nagpur','bhubaneswar','vadodara',
  'surat','mysuru','mysore','vijayawada','visakhapatnam','vizag','mangalore',
  'hubli','dharwad','trivandrum','thiruvananthapuram','kozhikode','calicut',
  'new delhi','navi mumbai','thane','bharat',
];

// ── Indian institution signals (education → origin) ───────────────────────────
const INDIA_INST = [
  'iit ','iit,','iitb','iitd','iitm','iitk','iitkgp','iit bombay','iit delhi',
  'iit madras','iit kanpur','iit kharagpur','iit roorkee','iit guwahati',
  'iit hyderabad','iit bhu','iisc','bits pilani','bits goa','bits hyderabad',
  'bits','nit ','iiit','iim ','iim ahmedabad','iim bangalore','iim calcutta',
  'vit ','manipal','srm university','srm institute','dtu delhi','nsit','coep',
  'jadavpur','anna university','pec chandigarh','nid ahmedabad','nid ',
];

// ── Indian company signals (work background → origin) ────────────────────────
const INDIA_COMPANIES = [
  'flipkart','razorpay','zomato','swiggy','paytm','cred','meesho','phonepe',
  'freshworks','zepto','groww','browserstack','zoho','juspay','setu','unacademy',
  'sharechat','nykaa','policybazaar','dunzo','byju','slice','ola cab','ola electric',
  'springworks','chargebee','postman','hasura','sarvam','krutrim','healthify',
  'cure.fit','mfine','lenskart','mamaearth','boat lifestyle','spinny','cars24',
  'urban company','urbanclap','cleartax','quicko','delhivery','ecom express',
  'shiprocket','udaan','moglix','infra.market','zetwerk','ofbusiness',
];

// ── Diaspora locations (abroad but may be Indian-origin) ─────────────────────
const DIASPORA_LOCATIONS = [
  'san francisco','bay area','palo alto','mountain view','menlo park','sunnyvale',
  'cupertino','san jose','santa clara','new york','nyc','brooklyn','seattle',
  'bellevue','redmond','boston','cambridge','austin','chicago','los angeles',
  'london','berlin','singapore','toronto','vancouver','dubai','amsterdam',
];

// ── Negative signals (filter out pure employees / students) ──────────────────
const EMPLOYEE_SIG = [
  'software engineer at','sde at','developer at','engineer at','intern at',
  'student at','looking for','open to work','seeking opportunities',
];

// ── Builder signals — at least one required alongside India signal ─────────────
const BUILDER_SIG = [
  'founder','co-founder','cofounder','building','stealth','ceo','cto','cpo',
  'started','launching','launched','side project','indie hacker','bootstrapped',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── India detection ───────────────────────────────────────────────────────────

function hasIndiaLocation(location = '', bio = '', company = '') {
  const t = (location + ' ' + bio + ' ' + company).toLowerCase();
  return INDIA_CITIES.some(c => t.includes(c));
}

function hasIndiaOrigin(bio = '', company = '', location = '') {
  const t = (bio + ' ' + company + ' ' + location).toLowerCase();
  return INDIA_INST.some(k => t.includes(k)) || INDIA_COMPANIES.some(k => t.includes(k));
}

function isInDiaspora(location = '') {
  const l = location.toLowerCase();
  return DIASPORA_LOCATIONS.some(d => l.includes(d));
}

// ── Signal extraction ─────────────────────────────────────────────────────────
// Returns an array of string tags stored in Airtable — filterable, not a score.

function extractSignals(profile, repos = []) {
  const signals = [];
  const bio     = (profile.bio      || '').toLowerCase();
  const company = (profile.company  || '').toLowerCase();
  const loc     = (profile.location || '').toLowerCase();
  const t       = bio + ' ' + company + ' ' + loc;

  // ── India signals ────────────────────────────────────────────────────────
  const indiaLoc    = hasIndiaLocation(profile.location, profile.bio, profile.company);
  const indiaOrigin = hasIndiaOrigin(profile.bio, profile.company, profile.location);
  const abroad      = isInDiaspora(profile.location || '');

  if (indiaLoc)                               signals.push('india-based');
  if (INDIA_INST.some(k => t.includes(k)))    signals.push('india-origin-edu');
  if (INDIA_COMPANIES.some(k => t.includes(k))) signals.push('india-origin-work');
  if (indiaOrigin && abroad && !indiaLoc)     signals.push('india-diaspora');

  // ── Role signals ─────────────────────────────────────────────────────────
  if (t.match(/\bfounder\b/))                 signals.push('founder');
  if (t.match(/co-?founder/))                 signals.push('co-founder');
  if (t.match(/\bceo\b/))                     signals.push('ceo');
  if (t.match(/\bcto\b/))                     signals.push('cto');
  if (t.match(/\bcpo\b/))                     signals.push('cpo');
  if (t.includes('building') || t.includes('stealth')) signals.push('building');
  if (t.includes('bootstrapped') || t.includes('indie hacker')) signals.push('bootstrapped');

  // ── Tech signals ─────────────────────────────────────────────────────────
  if (t.match(/\bai\b/) || t.includes('artificial intelligence')) signals.push('ai');
  if (t.match(/\bllm\b/))                     signals.push('llm');
  if (t.includes('ai agent') || t.includes('agentic')) signals.push('ai-agent');
  if (t.match(/\brag\b/))                     signals.push('rag');
  if (t.match(/\bsaas\b/))                    signals.push('saas');
  if (t.match(/\bb2b\b/))                     signals.push('b2b');
  if (t.includes('devtools') || t.includes('developer tools')) signals.push('devtools');
  if (t.includes('open source') || t.includes('opensource')) signals.push('open-source');

  // ── Strong background signals ─────────────────────────────────────────────
  const backgrounds = [
    'ex-google','ex-amazon','ex-microsoft','ex-meta','ex-apple','ex-openai',
    'ex-deepmind','ex-stripe','ex-uber','ex-airbnb','ex-sequoia','ex-a16z',
    'faang','stanford','mit','carnegie mellon','ycombinator','yc ','y combinator',
  ];
  backgrounds.forEach(k => { if (t.includes(k)) signals.push(k); });

  // ── Repo signals (from GitHub enrichment) ────────────────────────────────
  if (repos.length > 0) {
    const now  = Date.now();
    const d14  = now - 14 * 86400000;
    const d30  = now - 30 * 86400000;

    const recentPush14  = repos.some(r => new Date(r.pushed_at).getTime() > d14);
    const recentPush30  = repos.some(r => new Date(r.pushed_at).getTime() > d30);
    const totalStars    = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
    const hasProductUrl = repos.some(r => r.homepage && r.homepage.trim().length > 5);
    const repoCount     = repos.filter(r => !r.fork).length;

    if (recentPush14)         signals.push('active-14d');
    else if (recentPush30)    signals.push('active-30d');
    if (hasProductUrl)        signals.push('has-product-url');
    if (totalStars >= 100)    signals.push('stars-100+');
    else if (totalStars >= 50) signals.push('stars-50+');
    else if (totalStars >= 10) signals.push('stars-10+');
    if (repoCount >= 5)       signals.push('multi-repo');
  }

  return signals;
}

// ── Gate: who gets stored? ────────────────────────────────────────────────────
// Requires at minimum: an India signal + a builder signal.
// Score is still stored for ranking but is no longer the gate.

function isWorthStoring(profile, signals) {
  const hasIndia   = signals.some(s => s.startsWith('india-'));
  const hasBuilder = BUILDER_SIG.some(b => {
    const t = ((profile.bio || '') + ' ' + (profile.company || '')).toLowerCase();
    return t.includes(b);
  }) || signals.some(s => ['active-14d','active-30d','has-product-url'].includes(s));
  const isEmployee = EMPLOYEE_SIG.some(e =>
    ((profile.bio || '') + ' ' + (profile.company || '')).toLowerCase().includes(e)
  );
  return hasIndia && hasBuilder && !isEmployee;
}

// ── Scoring (kept for ranking in Airtable, not used as a gate) ───────────────

function score(bio = '', company = '', location = '', source = 'github', followers = 0, signals = []) {
  let s = 0;
  const t = (bio + ' ' + company).toLowerCase();

  const aiKw = ['ai agent','llm','autonomous agent','agentic','generative ai','genai','rag','foundation model','ai startup','ai founder','ai infra'];
  aiKw.forEach(k => { if (t.includes(k)) s += 8; });
  const saasKw = ['b2b saas','saas founder','saas startup','saas product','workflow automation','no-code','low-code','devtools'];
  saasKw.forEach(k => { if (t.includes(k)) s += 7; });
  s = Math.min(s, 30);

  const strongBg = ['iit','iisc','bits','ex-google','ex-amazon','ex-microsoft','ex-flipkart','ex-razorpay','ex-openai','ex-deepmind','faang','stanford','mit'];
  strongBg.forEach(k => { if (t.includes(k)) s += 12; });

  if (t.match(/\bai\b/))      s += 10;
  if (t.match(/\bllm\b/))     s += 6;
  if (t.match(/\bsaas\b/))    s += 8;
  if (t.match(/\bfounder\b/)) s += 15;
  if (t.match(/\bcto\b/) || t.match(/\bceo\b/)) s += 10;
  if (t.includes('building') || t.includes('stealth')) s += 8;
  if (followers > 0) s += Math.min(Math.log10(followers) * 5, 15);

  if (signals.includes('india-based'))       s += 20;
  if (signals.includes('india-origin-edu'))  s += 15;
  if (signals.includes('india-origin-work')) s += 10;
  if (signals.includes('india-diaspora'))    s += 12;
  if (signals.includes('active-14d'))        s += 15;
  if (signals.includes('active-30d'))        s += 8;
  if (signals.includes('has-product-url'))   s += 10;
  if (signals.includes('stars-100+'))        s += 15;
  else if (signals.includes('stars-50+'))    s += 10;
  else if (signals.includes('stars-10+'))    s += 5;
  if (source === 'hn')                       s += 10;

  EMPLOYEE_SIG.forEach(x => { if (t.includes(x)) s -= 15; });

  return Math.max(0, Math.min(100, Math.round(s)));
}

// ── Airtable helpers ──────────────────────────────────────────────────────────

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

// ── GitHub search ─────────────────────────────────────────────────────────────

async function searchGitHub(ghToken) {
  const headers  = { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.v3+json' };
  const results  = [];
  const seen     = new Set();
  const cutoff   = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const repoQueries = [
    // AI Agents — India-explicit
    `ai+agent+india+stars:3..500+pushed:>${cutoff}+NOT+tutorial`,
    `llm+startup+india+stars:3..300+pushed:>${cutoff}+NOT+tutorial`,
    `generative+ai+india+stars:3..300+pushed:>${cutoff}`,
    `rag+india+stars:2..200+pushed:>${cutoff}+NOT+tutorial`,
    `mcp+server+ai+stars:3..300+pushed:>${cutoff}`,
    // SaaS — India-explicit
    `saas+india+stars:3..400+pushed:>${cutoff}+NOT+tutorial`,
    `b2b+saas+india+stars:2..300+pushed:>${cutoff}`,
    `dashboard+india+stars:3..300+pushed:>${cutoff}+NOT+tutorial`,
    `workflow+automation+india+stars:2..300+pushed:>${cutoff}`,
    // Global strong signal
    `agentic+workflow+stars:3..500+pushed:>${cutoff}+NOT+awesome+NOT+tutorial`,
    `ai+agent+founder+stars:2..300+pushed:>${cutoff}`,
  ];

  const userQueries = [
    // India-based, AI/SaaS
    `location:India+type:user+AI+founder`,
    `location:India+type:user+LLM+founder`,
    `location:India+type:user+AI+CEO`,
    `location:India+type:user+AI+CTO`,
    `location:India+type:user+SaaS+founder`,
    `location:India+type:user+SaaS+CEO`,
    `location:Bangalore+type:user+founder`,
    `location:Bengaluru+type:user+founder`,
    `location:Mumbai+type:user+founder`,
    `location:Delhi+type:user+founder`,
    `location:Hyderabad+type:user+founder`,
    `location:Pune+type:user+founder`,
    // Diaspora — Indian institution + major tech hubs
    `type:user+IIT+founder`,
    `type:user+BITS+founder`,
    `type:user+IIT+CEO`,
    `type:user+IISc+building`,
  ];

  // ── Repo searches ───────────────────────────────────────────────────────
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

      for (let i = 0; i < owners.length; i += 6) {
        const chunk = owners.slice(i, i + 6);

        // Fetch profile + repos in parallel for each person in the chunk
        const enriched = await Promise.all(
          chunk.map(async o => {
            const [profileResp, reposResp] = await Promise.all([
              fetch(`https://api.github.com/users/${o.login}`, { headers }).catch(() => null),
              fetch(`https://api.github.com/users/${o.login}/repos?sort=updated&per_page=6`, { headers }).catch(() => null),
            ]);
            const profile = profileResp?.ok ? await profileResp.json() : null;
            const repos   = reposResp?.ok   ? await reposResp.json()   : [];
            return { profile, repos, fallbackBlog: o.blog };
          })
        );

        for (const { profile: p, repos, fallbackBlog } of enriched) {
          if (!p) continue;
          const signals = extractSignals(p, repos);
          if (!isWorthStoring(p, signals)) continue;
          const sc = score(p.bio, p.company || '', p.location || '', 'github', p.followers, signals);
          results.push({
            name: p.name || p.login, username: p.login,
            bio: p.bio || '', company: p.company || '', location: p.location || '',
            url: p.html_url, blog: p.blog || fallbackBlog,
            source: 'github', score: sc, signals,
          });
        }

        if (i + 6 < owners.length) await sleep(100);
      }
    } catch (e) { console.error('GH repo error:', e.message); }
    await sleep(2100);
  }

  // ── User searches ───────────────────────────────────────────────────────
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

      for (let i = 0; i < batch.length; i += 6) {
        const chunk = batch.slice(i, i + 6);

        const enriched = await Promise.all(
          chunk.map(async u => {
            const [profileResp, reposResp] = await Promise.all([
              fetch(`https://api.github.com/users/${u.login}`, { headers }).catch(() => null),
              fetch(`https://api.github.com/users/${u.login}/repos?sort=updated&per_page=6`, { headers }).catch(() => null),
            ]);
            const profile = profileResp?.ok ? await profileResp.json() : null;
            const repos   = reposResp?.ok   ? await reposResp.json()   : [];
            return { profile, repos };
          })
        );

        for (const { profile: p, repos } of enriched) {
          if (!p) continue;
          const signals = extractSignals(p, repos);
          if (!isWorthStoring(p, signals)) continue;
          const sc = score(p.bio, p.company || '', p.location || '', 'github', p.followers, signals);
          results.push({
            name: p.name || p.login, username: p.login,
            bio: p.bio || '', company: p.company || '', location: p.location || '',
            url: p.html_url, blog: p.blog || '',
            source: 'github', score: sc, signals,
          });
        }

        if (i + 6 < batch.length) await sleep(100);
      }
    } catch (e) { console.error('GH user error:', e.message); }
    await sleep(2100);
  }

  return results;
}

// ── HN search ─────────────────────────────────────────────────────────────────

async function searchHN() {
  const results = [];
  const seen    = new Set();
  const cutoff  = Math.floor(Date.now() / 1000) - 30 * 86400;

  const queries = [
    'AI agent India',
    'LLM startup India',
    'Show HN AI India',
    'generative AI India founder',
    'Show HN India founder',
    'AI SaaS India',
    'RAG India startup',
    'MCP server India',
    // Diaspora — IIT/BITS founders on HN
    'Show HN IIT founder',
    'Show HN India',
  ];

  await Promise.all(queries.map(async q => {
    try {
      const resp = await fetch(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=show_hn&hitsPerPage=20&numericFilters=created_at_i>${cutoff}`
      );
      const data = await resp.json();
      for (const h of (data.hits || [])) {
        if (seen.has(h.objectID)) continue;
        seen.add(h.objectID);

        const fakeProfile = {
          bio:      h.title + ' ' + (h.story_text || ''),
          company:  h.title.replace(/^Show HN:\s*/i, '').split(/[–—\-:]/).shift().trim(),
          location: '',
        };
        const signals = extractSignals(fakeProfile, []);

        // For HN we just need any India signal (location might be empty — rely on text)
        const textHasIndia = INDIA_CITIES.some(c =>
          (h.title + ' ' + (h.story_text || '')).toLowerCase().includes(c)
        ) || hasIndiaOrigin(h.title, '', '');
        if (!textHasIndia) continue;

        // Always push 'hn-show-hn' tag
        if (!signals.includes('hn-show-hn')) signals.push('hn-show-hn');
        if (h.points >= 50 && !signals.includes('hn-50pts+')) signals.push('hn-50pts+');

        const sc = score(h.title, '', 'India', 'hn', 0, signals);
        results.push({
          name: h.author, username: h.author,
          bio: h.title, company: fakeProfile.company,
          location: 'India (HN)',
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          blog: '', source: 'hn', score: sc, signals,
        });
      }
    } catch (e) { console.error('HN error:', e.message); }
  }));

  return results;
}

// ── Airtable push ─────────────────────────────────────────────────────────────

async function pushToAirtable(founders, atToken) {
  const sourceMap = { github: 'GitHub', hn: 'Hacker News', ph: 'Product Hunt' };
  let created = 0;
  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < founders.length; i += 10) {
    const batch   = founders.slice(i, i + 10);
    const records = batch.map(f => ({
      fields: {
        [F.name]:       f.name || '',
        [F.company]:    f.company || '',
        [F.location]:   f.location || '',
        [F.linkedinUrl]:f.url || '',
        [F.source]:     sourceMap[f.source] || 'GitHub',
        [F.signals]:    (f.signals || []).join(', '),
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

// ── Main handler ──────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const atToken = process.env.AIRTABLE_TOKEN;
  if (!atToken) return res.status(500).json({ error: 'AIRTABLE_TOKEN not set' });

  const startTime = Date.now();
  console.log('[scan] Starting daily scout scan');

  try {
    const existingNames = await fetchExistingNames(atToken);
    console.log(`[scan] ${existingNames.size} existing records in Airtable`);

    const [ghResults, hnResults] = await Promise.all([
      ghToken
        ? searchGitHub(ghToken)
        : (console.log('[scan] No GITHUB_TOKEN — skipping GitHub'), Promise.resolve([])),
      searchHN(),
    ]);

    const allResults = [...ghResults, ...hnResults];

    // Deduplicate by username — keep highest score
    const deduped = {};
    allResults.forEach(r => {
      if (!deduped[r.username] || r.score > deduped[r.username].score) deduped[r.username] = r;
    });

    // Remove already-stored founders (by name)
    const newFounders = Object.values(deduped)
      .filter(r => !existingNames.has((r.name || '').toLowerCase().trim()))
      .sort((a, b) => b.score - a.score);

    console.log(`[scan] ${allResults.length} found → ${newFounders.length} new`);

    const created  = newFounders.length ? await pushToAirtable(newFounders, atToken) : 0;
    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(`[scan] Done — pushed ${created} new founders in ${duration}s`);
    return res.status(200).json({ success: true, scanned: allResults.length, new: newFounders.length, created, duration_s: duration });

  } catch (e) {
    console.error('[scan] Fatal error:', e);
    return res.status(500).json({ error: e.message });
  }
};
