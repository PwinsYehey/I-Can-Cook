// /api/recipe.js
// Returns detailed info for a single recipe id
// Uses Spoonacular when available; falls back to mock details when quota is exceeded.

const MOCK_DETAILS = {
  1001: {
    id: 1001,
    title: "Garlic Butter Chicken with Rice",
    image: "https://images.pexels.com/photos/4106483/pexels-photo-4106483.jpeg",
    url: "https://example.com/mock-garlic-butter-chicken",
    sourceName: "Mock Kitchen",
    readyInMinutes: 30,
    servings: 2,
    cuisines: ["comfort"],
    diets: [],
    summary:
      "A cozy garlic butter chicken dish served over warm rice. Perfect for using pantry staples like chicken, garlic, butter, and rice.",
    ingredients: [
      "2 chicken thighs or breasts",
      "3 cloves garlic, minced",
      "2 tbsp butter",
      "1 cup cooked rice",
      "Salt and pepper, to taste",
      "1 tbsp chopped parsley"
    ],
    instructions:
      "1. Season chicken with salt and pepper.\n2. Melt butter in a pan and sauté garlic until fragrant.\n3. Add chicken and cook until golden and cooked through.\n4. Serve over warm rice and sprinkle with parsley."
  },
  1002: {
    id: 1002,
    title: "Tomato Basil Pasta",
    image: "https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg",
    url: "https://example.com/mock-tomato-basil-pasta",
    sourceName: "Mock Kitchen",
    readyInMinutes: 20,
    servings: 2,
    cuisines: ["Italian"],
    diets: ["Vegetarian"],
    summary:
      "Quick and bright tomato basil pasta using tomatoes, garlic, olive oil, and fresh basil.",
    ingredients: [
      "200 g pasta",
      "2 tomatoes, chopped",
      "2 cloves garlic, minced",
      "2 tbsp olive oil",
      "Handful of fresh basil leaves",
      "Salt and pepper, to taste",
      "Grated parmesan, to serve"
    ],
    instructions:
      "1. Cook pasta according to package instructions.\n2. In a pan, sauté garlic in olive oil.\n3. Add chopped tomatoes and cook until soft.\n4. Toss in cooked pasta and basil.\n5. Season and serve with parmesan."
  },
  1003: {
    id: 1003,
    title: "Creamy Mushroom Omelette",
    image: "https://images.pexels.com/photos/4109136/pexels-photo-4109136.jpeg",
    url: "https://example.com/mock-mushroom-omelette",
    sourceName: "Mock Kitchen",
    readyInMinutes: 15,
    servings: 1,
    cuisines: ["Breakfast"],
    diets: ["Vegetarian"],
    summary:
      "Fluffy omelette filled with creamy mushrooms and cheese — ideal for a quick breakfast.",
    ingredients: [
      "2 eggs",
      "1/4 cup sliced mushrooms",
      "2 tbsp milk or cream",
      "1 tbsp butter",
      "2 tbsp grated cheese",
      "Salt and pepper, to taste"
    ],
    instructions:
      "1. Whisk eggs with milk, salt, and pepper.\n2. Sauté mushrooms in butter until soft.\n3. Pour eggs into the pan and cook until almost set.\n4. Add cheese, fold omelette, and cook briefly.\n5. Serve hot."
  }
};

function stripHtml(s) {
  return (s || "")
    .replace(/<\/?(br|p|li|ol|ul)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sendMockDetail(id, res) {
  const numericId = Number(id);
  const mock = MOCK_DETAILS[numericId];
  if (!mock) {
    return res
      .status(404)
      .json({ error: "No mock detail available for this recipe." });
  }
  return res.status(200).json(mock);
}

export default async function handler(req, res) {
  try {
    const id = (req.query.id || "").toString().trim();
    const key = process.env.SPOONACULAR_KEY;

    if (!id) {
      return res.status(400).json({ error: "Missing id parameter" });
    }

    // If no key, go straight to mock
    if (!key) {
      console.warn("SPOONACULAR_KEY missing, using mock detail.");
      return sendMockDetail(id, res);
    }

    const url = `https://api.spoonacular.com/recipes/${encodeURIComponent(
      id
    )}/information?apiKey=${encodeURIComponent(
      key
    )}&includeNutrition=false`;

    const r = await fetch(url);

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("Spoonacular detail error:", r.status, text);

      if (r.status === 402 || r.status === 429) {
        console.warn("Quota/rate limit hit. Serving mock detail instead.");
        return sendMockDetail(id, res);
      }

      return res
        .status(502)
        .json({ error: "Upstream API error", detail: text.slice(0, 200) });
    }

    const j = await r.json();

    const ingredients = (j.extendedIngredients || []).map(
      (i) => i.original || i.name || ""
    );

    let instructions = "";
    if (j.analyzedInstructions && j.analyzedInstructions.length) {
      const steps = j.analyzedInstructions[0].steps || [];
      instructions = steps
        .map((s, idx) => `${idx + 1}. ${s.step}`)
        .join("\n");
    } else if (j.instructions) {
      instructions = stripHtml(j.instructions);
    }

    const payload = {
      id: j.id,
      title: j.title,
      image: j.image || "",
      url: j.sourceUrl || j.spoonacularSourceUrl || "",
      sourceName: j.sourceName || "",
      readyInMinutes: j.readyInMinutes || null,
      servings: j.servings || null,
      cuisines: j.cuisines || [],
      diets: j.diets || [],
      summary: stripHtml(j.summary || ""),
      ingredients,
      instructions
    };

    res.setHeader(
      "Cache-Control",
      "s-maxage=600, stale-while-revalidate=3600"
    );
    return res.status(200).json(payload);
  } catch (e) {
    console.error("Recipe detail handler error:", e);
    // Fallback to mock if our handler explodes
    return sendMockDetail(req.query.id, res);
  }
}
