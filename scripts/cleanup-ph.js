#!/usr/bin/env node
// Deletes bad Product Hunt records added on 2026-05-14 from Airtable.
// Usage: AIRTABLE_TOKEN=pat... node scripts/cleanup-ph.js

const BASE_ID  = 'appoVW6cJXYYhHKnU';
const TABLE_ID = 'tblw5OF9akHaMtH38';
const TOKEN    = process.env.AIRTABLE_TOKEN;

if (!TOKEN) {
  console.error('ERROR: AIRTABLE_TOKEN env var is not set.');
  process.exit(1);
}

const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
const HEADERS  = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function fetchBadRecords() {
  const records = [];
  let offset;

  const formula = encodeURIComponent(
    `AND({Date Found}="2026-05-14", {Source}="Product Hunt")`
  );

  do {
    const url = `${BASE_URL}?filterByFormula=${formula}&fields[]=Name${offset ? `&offset=${offset}` : ''}`;
    const res  = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable fetch failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    records.push(...json.records);
    offset = json.offset;
    console.log(`Fetched ${records.length} records so far...`);
  } while (offset);

  return records;
}

async function deleteInBatches(records) {
  const BATCH = 10;
  let deleted = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch  = records.slice(i, i + BATCH);
    const ids    = batch.map(r => r.id);
    const params = ids.map(id => `records[]=${id}`).join('&');
    const url    = `${BASE_URL}?${params}`;

    const res = await fetch(url, { method: 'DELETE', headers: HEADERS });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable delete failed (${res.status}): ${text}`);
    }

    deleted += ids.length;
    console.log(`Deleted ${deleted} / ${records.length}`);

    // Airtable rate limit: 5 req/s — small pause between batches
    if (i + BATCH < records.length) await new Promise(r => setTimeout(r, 250));
  }

  return deleted;
}

(async () => {
  console.log('Fetching bad PH records (Date Found=2026-05-14, Source=Product Hunt)...');
  const records = await fetchBadRecords();
  console.log(`Found ${records.length} records to delete.`);

  if (records.length === 0) {
    console.log('Nothing to delete. Exiting.');
    process.exit(0);
  }

  const deleted = await deleteInBatches(records);
  console.log(`Done. Deleted ${deleted} records.`);
})().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
