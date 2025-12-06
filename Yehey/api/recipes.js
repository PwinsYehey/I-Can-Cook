// /api/recipes.js
// Vercel serverless function to proxy Spoonacular safely

export default async function handler(req, res) {
  try {
    const rawQ = (req.query.q || '').toString();
    const q = rawQ.slice(0, 300); // ingredients query (may be empty)
    const cuisine = (req.query.cuisine || '').toString().slice(0, 120);
    const key = process.env.SPOONACULAR_KEY; // make sure this is set in Vercel

    if (!key) {
      return res.status(500).json({ error: 'Missing SPOONACULAR_KEY env var' });
    }

    // Allow: ingredients only, cuisine only, or both.
    if (!q && !cuisine) {
      return res.status(400).json({ error: 'Missing q or cuisine parameter' });
    }

    const url = new URL('https://api.spoonacular.com/recipes/complexSearch');
    url.searchParams.set('apiKey', key);
    url.searchParams.set('number', '12'); // how many recipes to return
    url.searchParams.set('addRecipeInformation', 'true');
    url.searchParams.set('fillIngredients', 'true');

    // Only send query/includeIngredients if we actually have one
    if (q) {
      // text search
      url.searchParams.set('query', q);
      // treat q as ingredient list as well
      url.searchParams.set('includeIngredients', q);
    }

    // Cuisine filter (can be "japanese", "italian,mexican", etc.)
    if (cuisine) {
      url.searchParams.set('cuisine', cuisine);
    }

    const r = await fetch(url.toString());
    const bodyText = await r.text().catch(() => '');
    let parsed = null;

    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsed = null;
    }

    if (!r.ok) {
      const message =
        (parsed && parsed.message) ||
        (parsed && parsed.error) ||
        'Upstream API error';

      console.error('Spoonacular error:', r.status, bodyText);

      // If daily limit is reached, forward 402 so frontend can show a nice message
      if (r.status === 402) {
        return res.status(402).json({
          error: message,
          spoonacularStatus: r.status,
        });
      }

      return res.status(502).json({
        error: message,
        spoonacularStatus: r.status,
      });
    }

    const j = parsed || {};
    const results = (j.results || []).map(item => {
      const ingredients =
        (item.extendedIngredients || []).map(i => (i.name || '').toLowerCase());

      // Prefer Spoonacular’s own page first
      const primaryUrl =
        item.spoonacularSourceUrl ||
        item.sourceUrl ||
        '';

      // Build a clean instructions text if available
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
        id: item.id,
        title: item.title,
        url: primaryUrl,
        image: item.image || '',
        source: item.sourceName || 'Spoonacular',
        cuisine: (item.cuisines && item.cuisines[0]) || '',
        country: '',
        ingredients,
        instructions: instructionsText || '',
      };
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({ results });
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

