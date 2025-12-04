// /api/recipes.js
export default async function handler(req, res) {
  try {
    const q = (req.query.q || '').toString().slice(0, 300);
    const key = process.env.SPOONACULAR_KEY;

    if (!key) {
      return res.status(500).json({ error: 'Missing SPOONACULAR_KEY env var' });
    }
    if (!q) {
      return res.status(400).json({ error: 'Missing q parameter' });
    }

    const url = new URL('https://api.spoonacular.com/recipes/complexSearch');
    url.searchParams.set('apiKey', key);
    url.searchParams.set('query', q);
    url.searchParams.set('number', '12');
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

      // 👉 Prefer the ORIGINAL recipe site, then fall back to Spoonacular
      const primaryUrl =
        item.sourceUrl ||      // original blog / website (usually has full instructions)
        item.spoonacularSourceUrl ||
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
