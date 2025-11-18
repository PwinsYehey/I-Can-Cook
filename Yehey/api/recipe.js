// /api/recipe.js
// Returns detailed info for a single recipe id

export default async function handler(req, res) {
  try {
    const id = (req.query.id || '').toString().trim();
    const key = process.env.SPOONACULAR_KEY;

    if (!key) {
      return res.status(500).json({ error: 'Missing SPOONACULAR_KEY env var' });
    }
    if (!id) {
      return res.status(400).json({ error: 'Missing id parameter' });
    }

    const url = `https://api.spoonacular.com/recipes/${encodeURIComponent(
      id
    )}/information?apiKey=${encodeURIComponent(key)}&includeNutrition=false`;

    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.error('Spoonacular detail error:', r.status, text);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const j = await r.json();

    // Basic HTML tag stripper for summary/instructions
    const stripHtml = (s) =>
      (s || '')
        .replace(/<\/?(br|p|li|ol|ul)\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const ingredients = (j.extendedIngredients || []).map(
      (i) => i.original || i.name || ''
    );

    // Build a simple instructions text
    let instructions = '';
    if (j.analyzedInstructions && j.analyzedInstructions.length) {
      const steps = j.analyzedInstructions[0].steps || [];
      instructions = steps
        .map((s, idx) => `${idx + 1}. ${s.step}`)
        .join('\n');
    } else if (j.instructions) {
      instructions = stripHtml(j.instructions);
    }

    const payload = {
      id: j.id,
      title: j.title,
      image: j.image || '',
      url: j.sourceUrl || j.spoonacularSourceUrl || '',
      sourceName: j.sourceName || '',
      readyInMinutes: j.readyInMinutes || null,
      servings: j.servings || null,
      cuisines: j.cuisines || [],
      diets: j.diets || [],
      summary: stripHtml(j.summary || ''),
      ingredients,
      instructions,
    };

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json(payload);
  } catch (e) {
    console.error('Recipe detail handler error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
