// Standalone scan runner — used by GitHub Actions
// Calls the same scan handler used by Vercel, bypassing the HTTP layer.

const handler = require('../api/scan');

const req = {
  headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
  method: 'GET',
};

const res = {
  status(code) {
    return {
      json(data) {
        console.log(`[run-scan] Finished with status ${code}:`);
        console.log(JSON.stringify(data, null, 2));
        if (code >= 400) process.exit(1);
      }
    };
  }
};

handler(req, res).catch(err => {
  console.error('[run-scan] Fatal error:', err);
  process.exit(1);
});
