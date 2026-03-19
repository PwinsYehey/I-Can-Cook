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
  if (!key || !cx || !q) {
    return {
      searchQuery: '',
      requestUrl: '',
      items: []
    };
  }

  const queryCore = q
    .split(',')
    .map(s => normalizeText(s))
    .filter(Boolean)
    .join(' ');

  const searchQuery = `${queryCore} ${cuisine ? cuisine + ' ' : ''}recipe`.trim();

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('num', '10');
  url.searchParams.set('safe', 'active');

  const requestUrl = url.toString();

  const r = await fetch(requestUrl);

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    return {
      searchQuery,
      requestUrl,
      error: {
        status: r.status,
        text
      },
      items: []
    };
  }

  const j = await r.json();

  return {
    searchQuery,
    requestUrl,
    raw: j,
    items: (j.items || []).map((item, idx) => ({
      id: `google-${idx}-${Date.now()}`,
      title: item.title || 'Recipe result',
      url: item.link || '',
      image: item.pagemap?.cse_image?.[0]?.src || '',
      source: item.displayLink || 'Google',
      sourceType: 'search',
      cuisine: cuisine || '',
      country: '',
      ingredients: [],
      instructions: ''
    }))
  };
}

export default async function handler(req, res) {
  try {
    const rawQ = (req.query.q || '').toString();
    const q = rawQ.slice(0, 300);
    const cuisine = (req.query.cuisine || '').toString().slice(0, 120);

    const googleKey = process.env.GOOGLE_SEARCH_KEY;
    const googleCx = process.env.GOOGLE_SEARCH_CX;

    const google = await searchGoogle({
      q,
      cuisine,
      key: googleKey,
      cx: googleCx
    });

    return res.status(200).json({
      debug: {
        q,
        cuisine,
        hasGoogleKey: !!googleKey,
        hasGoogleCx: !!googleCx,
        cx: googleCx || null,
        searchQuery: google.searchQuery || '',
        requestUrl: google.requestUrl || '',
        googleCount: google.items?.length || 0,
        error: google.error || null
      },
      results: google.items || [],
      raw: google.raw || null
    });
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
