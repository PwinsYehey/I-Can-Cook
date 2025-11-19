// /api/recipes.js
// Vercel serverless function to proxy Spoonacular safely

export default async function handler(req, res) {
  try {
    const qRaw    = (req.query.q || '').toString().slice(0, 300);
    const cuisine = (req.query.cuisine || '').toString().slice(0, 120);
    const key     = process.env.SPOONACULAR_KEY;

    if (!key) {
      return res.status(500).json({ error: 'Missing SPOONACULAR_KEY env var' });
    }
    if (!qRaw && !cuisine) {
      return res.status(400).json({ error: 'Missing q or cuisine parameter' });
    }

    const url = new URL('https://api.spoonacular.com/recipes/complexSearch');
    url.searchParams.set('apiKey', key);

    // Use ingredients (qRaw) as main query; if none, fall back to cuisine string
    const queryForApi = qRaw || cuisine || 'recipe';
    url.searchParams.set('query', queryForApi);

    if (cuisine) {
      url.searchParams.set('cuisine', cuisine); // comma-separated list is allowed
    }

    url.searchParams.set('number', '12');              // how many recipes to return
    url.searchParams.set('addRecipeInformation', 'true');
    url.searchParams.set('fillIngredients', 'true');

    const r = await fetch(url.toString());
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.error('Spoonacular error:', r.status, text);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const j = await r.json();

    const results = (j.results || []).map(item => {
      const ingredients =
        (item.extendedIngredients || []).map(i => (i.name || '').toLowerCase());

      // Prefer Spoonacular's own URL (more stable), fall back to original site
      const primaryUrl =
        item.spoonacularSourceUrl ||
        item.sourceUrl ||
        '';

      return {
        id: item.id,
        title: item.title,
        url: primaryUrl,
        image: item.image || '',
        source: item.sourceName || 'Spoonacular',
        cuisine: (item.cuisines && item.cuisines[0]) || '',
        country: '',
        ingredients
      };
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({ results });
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

