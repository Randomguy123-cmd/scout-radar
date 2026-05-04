// Vercel serverless function — proxies Product Hunt GraphQL queries
// to avoid browser CORS restrictions.

export default async function handler(req, res) {
  // Allow GET with ?days=30 or POST with body
  const days = parseInt(req.query.days || '30');
  const withinMap = { 7: 'week', 30: 'month', 90: 'quarter' };
  const within = withinMap[days] || 'month';

  const phQueries = [
    'ai agent', 'llm tool', 'autonomous agent',
    'agentic workflow', 'AI automation', 'generative AI'
  ];

  const results = [];
  const seen = new Set();

  for (const query of phQueries) {
    try {
      const resp = await fetch('https://www.producthunt.com/frontend/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'SearchQuery',
          variables: { query, type: 'Posts', within },
          query: `query SearchQuery($query: String!, $type: SearchType!, $within: SearchWithinType) {
            search(query: $query, type: $type, within: $within, first: 15) {
              edges { node { ... on Post { id name tagline url votesCount website commentsCount makers { name username headline } topics { edges { node { name } } } } } }
            }
          }`
        })
      });

      if (!resp.ok) continue;
      const data = await resp.json();
      const edges = data?.data?.search?.edges || [];

      for (const edge of edges) {
        const post = edge?.node;
        if (!post || seen.has(post.id)) continue;
        seen.add(post.id);

        const makers = post.makers || [];
        const makerNames = makers.map(m => m.name).join(', ');
        const makerBios = makers.map(m => m.headline || '').join('. ');
        const topics = (post.topics?.edges || []).map(e => e.node?.name).join(', ');
        const mainMaker = makers[0] || {};

        results.push({
          source: 'ph',
          name: mainMaker.name || makerNames || post.name,
          username: mainMaker.username || post.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          bio: post.tagline + (makerBios ? ' — ' + makerBios : ''),
          company: post.name,
          location: '',
          followers: 0,
          repos: 0,
          created: new Date().toISOString(),
          url: post.website || post.url || '',
          points: post.votesCount || 0,
          blog: post.website || '',
          _recentCommits: undefined,
          _topStars: 0,
          _hasProductRepo: true,
          _hasOrg: false,
          _onlyTutorials: false,
          _repoTopics: topics + ' ' + post.tagline,
          _phVotes: post.votesCount,
          _phComments: post.commentsCount,
          _phSource: 'api',
        });
      }
    } catch (e) {
      console.error('PH query error:', query, e.message);
    }
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  return res.status(200).json({ results });
}
