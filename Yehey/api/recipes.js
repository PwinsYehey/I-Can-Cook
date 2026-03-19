// /api/recipes.js

function normalizeText(s = '') {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchGoogle({ q, cuisine, key, cx }) {
  if (!key || !cx || !q) return [];

  const queryCore = q
    .split(',')
    .map(s => normalizeText(s))
    .filter(Boolean)
    .join(' ');

  const searchQuery = `${queryCore} ${cuisine ? cuisine + ' ' : ''}recipe`;

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('num', '10');
  url.searchParams.set('safe', 'active');

  const r = await fetch(url.toString());

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('Google search error:', r.status, text);
    return [];
  }

  const j = await r.json();
  const queryIngredients = q.split(',').map(s => normalizeText(s)).filter(Boolean);

  return (j.items || []).map((item, idx) => {
    const haystack = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();

    const guessedIngredients = queryIngredients.filter(ing => haystack.includes(ing));

    return {
      id: `google-${idx}-${Date.now()}`,
      title: item.title || 'Recipe result',
      url: item.link || '',
      image: item.pagemap?.cse_image?.[0]?.src || '',
      source: item.displayLink || 'Google',
      sourceType: 'search',
      cuisine: cuisine || '',
      country: '',
      ingredients: guessedIngredients,
      instructions: ''
    };
  });
}

export default async function handler(req, res) {
  try {
    const rawQ = (req.query.q || '').toString();
    const q = rawQ.slice(0, 300);
    const cuisine = (req.query.cuisine || '').toString().slice(0, 120);

    const googleKey = process.env.GOOGLE_SEARCH_KEY;
    const googleCx = process.env.GOOGLE_SEARCH_CX;

    if (!q && !cuisine) {
      return res.status(400).json({ error: 'Missing q or cuisine parameter' });
    }

    const googleResults = await searchGoogle({
      q,
      cuisine,
      key: googleKey,
      cx: googleCx
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      debug: {
        google: googleResults.length,
        q,
        cuisine,
        hasGoogleKey: !!googleKey,
        hasGoogleCx: !!googleCx
      },
      results: googleResults
    });
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
