// /api/recipes.js

function normalizeText(s = '') {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeResults(items = []) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = `${normalizeText(item.title)}|${normalizeText(item.url)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}

async function searchSpoonacular({ q, cuisine, key }) {
  const url = new URL('https://api.spoonacular.com/recipes/complexSearch');
  url.searchParams.set('apiKey', key);
  url.searchParams.set('number', '12');
  url.searchParams.set('addRecipeInformation', 'true');
  url.searchParams.set('fillIngredients', 'true');
  url.searchParams.set('instructionsRequired', 'false');
  url.searchParams.set('sort', 'relevance');

  if (q) url.searchParams.set('query', q);
  if (cuisine) url.searchParams.set('cuisine', cuisine);

  const r = await fetch(url.toString());
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('Spoonacular error:', r.status, text);
    return [];
  }

  const j = await r.json();

  return (j.results || []).map(item => {
    const ingredients =
      (item.extendedIngredients || []).map(i => (i.name || '').toLowerCase());

    const primaryUrl =
      item.spoonacularSourceUrl ||
      item.sourceUrl ||
      '';

    let instructionsText = '';
    if (
      Array.isArray(item.analyzedInstructions) &&
      item.analyzedInstructions.length > 0 &&
      Array.isArray(item.analyzedInstructions[0].steps)
    ) {
      const steps = item.analyzedInstructions[0].steps;
      if (steps.length) {
        instructionsText = steps
          .map(s => {
            const num = s.number ? `${s.number}. ` : '';
            return `${num}${s.step}`.trim();
          })
          .join('\n');
      }
    }

    if (!instructionsText && item.instructions) {
      instructionsText = item.instructions;
    }

    return {
      id: `api-${item.id}`,
      title: item.title,
      url: primaryUrl,
      image: item.image || '',
      source: item.sourceName || 'Spoonacular',
      sourceType: 'api',
      cuisine: (item.cuisines && item.cuisines[0]) || '',
      country: '',
      ingredients,
      instructions: instructionsText || ''
    };
  });
}

async function searchGoogleFallback({ q, cuisine, key, cx }) {
  if (!key || !cx || !q) return [];

  const searchQueryParts = [
    q,
    cuisine ? `${cuisine} recipe` : 'recipe',
    '(site:allrecipes.com OR site:panlasangpinoy.com OR site:simplyrecipes.com OR site:food.com)'
  ];

  const searchQuery = searchQueryParts.filter(Boolean).join(' ');

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('num', '8');
  url.searchParams.set('safe', 'active');

  const r = await fetch(url.toString());
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('Google search fallback error:', r.status, text);
    return [];
  }

  const j = await r.json();
  const queryIngredients = q.split(',').map(s => normalizeText(s)).filter(Boolean);

  return (j.items || []).map((item, idx) => {
    const haystack = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();

    const guessedIngredients = queryIngredients.filter(ing => {
      if (!ing) return false;
      return haystack.includes(ing);
    });

    return {
      id: `search-${idx}-${Date.now()}`,
      title: item.title || 'Recipe result',
      url: item.link || '',
      image: item.pagemap?.cse_image?.[0]?.src || '',
      source: item.displayLink || 'Web',
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

    const spoonacularKey = process.env.SPOONACULAR_KEY;
    const googleKey = process.env.GOOGLE_SEARCH_KEY;
    const googleCx = process.env.GOOGLE_SEARCH_CX;

    if (!q && !cuisine) {
      return res.status(400).json({ error: 'Missing q or cuisine parameter' });
    }

    let results = [];

    if (spoonacularKey) {
      const spoonResults = await searchSpoonacular({
        q,
        cuisine,
        key: spoonacularKey
      });
      results.push(...spoonResults);
    }

    const spoonCount = results.length;
    const shouldUseFallback = spoonCount < 6;

    if (shouldUseFallback && googleKey && googleCx) {
      const fallbackResults = await searchGoogleFallback({
        q,
        cuisine,
        key: googleKey,
        cx: googleCx
      });
      results.push(...fallbackResults);
    }

    results = dedupeResults(results);

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({ results });
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
