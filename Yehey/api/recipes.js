// api/recipes.js
export default async function handler(req, res) {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing SPOONACULAR_API_KEY env' });
  }

  const { mode } = req.query || {};

  try {
    if (mode === 'autocomplete') {
      return await handleAutocomplete(req, res, apiKey);
    } else if (mode === 'info') {
      return await handleIngredientInfo(req, res, apiKey);
    } else if (mode === 'subs') {
      return await handleSubstitutes(req, res, apiKey);
    } else {
      // default = recipe search
      return await handleRecipeSearch(req, res, apiKey);
    }
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* --------- Recipe Search (default) ---------- */
async function handleRecipeSearch(req, res, apiKey) {
  const { q = '', cuisine = '', diet = '', intolerances = '' } = req.query || {};

  const params = new URLSearchParams();
  params.set('apiKey', apiKey);
  params.set('number', '20');
  params.set('addRecipeInformation', 'true');
  params.set('fillIngredients', 'true');

  if (q) params.set('includeIngredients', q);
  if (cuisine) params.set('cuisine', cuisine);
  if (diet) params.set('diet', diet);
  if (intolerances) params.set('intolerances', intolerances);

  const url = `https://api.spoonacular.com/recipes/complexSearch?${params.toString()}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    console.error('Spoonacular search error:', text);
    return res.status(resp.status).json({ error: 'Search failed' });
  }
  const data = await resp.json();

  const results = (data.results || []).map(r => {
    const ingredients = (r.extendedIngredients || []).map(i => i.name || '');
    return {
      id: r.id,
      title: r.title,
      image: r.image,
      url: r.sourceUrl || r.spoonacularSourceUrl || '',
      ingredients,
      cuisine: (r.cuisines && r.cuisines[0]) || '',
      source: r.sourceName || 'Spoonacular',
      country: null
    };
  });

  return res.status(200).json({ results });
}

/* --------- Autocomplete ingredients ---------- */
async function handleAutocomplete(req, res, apiKey) {
  const { query = '' } = req.query || {};
  if (!query) {
    return res.status(200).json([]);
  }

  const params = new URLSearchParams();
  params.set('apiKey', apiKey);
  params.set('query', query);
  params.set('number', '8');
  params.set('metaInformation', 'true');

  const url = `https://api.spoonacular.com/food/ingredients/autocomplete?${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    console.error('Spoonacular autocomplete error:', text);
    return res.status(resp.status).json([]);
  }
  const data = await resp.json();

  // Return only what we need
  const mapped = data.map(item => ({
    id: item.id,
    name: item.name,
    aisle: item.aisle || ''
  }));
  return res.status(200).json(mapped);
}

/* --------- Ingredient info by name ---------- */
async function handleIngredientInfo(req, res, apiKey) {
  const { name = '' } = req.query || {};
  if (!name) {
    return res.status(400).json({ error: 'Missing ingredient name' });
  }

  // Step 1: search/autocomplete to find an ID
  const params = new URLSearchParams();
  params.set('apiKey', apiKey);
  params.set('query', name);
  params.set('number', '1');

  const searchUrl = `https://api.spoonacular.com/food/ingredients/search?${params.toString()}`;
  const sResp = await fetch(searchUrl);
  if (!sResp.ok) {
    const text = await sResp.text();
    console.error('Spoonacular ingredient search error:', text);
    return res.status(sResp.status).json({ error: 'Ingredient search failed' });
  }
  const sData = await sResp.json();
  const first = (sData.results || [])[0];
  if (!first || !first.id) {
    return res.status(404).json({ error: 'No ingredient found' });
  }

  const infoParams = new URLSearchParams();
  infoParams.set('apiKey', apiKey);
  infoParams.set('amount', '100');
  infoParams.set('unit', 'g');
  infoParams.set('includeNutrition', 'true');

  const infoUrl = `https://api.spoonacular.com/food/ingredients/${first.id}/information?${infoParams.toString()}`;
  const iResp = await fetch(infoUrl);
  if (!iResp.ok) {
    const text = await iResp.text();
    console.error('Spoonacular ingredient info error:', text);
    return res.status(iResp.status).json({ error: 'Ingredient info failed' });
  }
  const info = await iResp.json();

  const calories = info.nutrition?.nutrients?.find(n => /calories/i.test(n.name || ''))?.amount || null;
  const image = info.image
    ? `https://spoonacular.com/cdn/ingredients_250x250/${info.image}`
    : '';

  return res.status(200).json({
    id: info.id,
    name: info.name || first.name,
    aisle: info.aisle || '',
    calories,
    image,
    possibleUnits: info.possibleUnits || []
  });
}

/* --------- Ingredient substitutes ---------- */
async function handleSubstitutes(req, res, apiKey) {
  const { name = '' } = req.query || {};
  if (!name) {
    return res.status(400).json({ error: 'Missing ingredient name' });
  }

  const params = new URLSearchParams();
  params.set('apiKey', apiKey);
  params.set('ingredientName', name);

  const url = `https://api.spoonacular.com/food/ingredients/substitutes?${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    console.error('Spoonacular subs error:', text);
    return res.status(resp.status).json({ error: 'Substitutes lookup failed' });
  }
  const data = await resp.json();

  return res.status(200).json({
    substitutes: data.substitutes || [],
    message: data.message || ''
  });
}



