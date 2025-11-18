// /api/recipes.js
// Vercel serverless function to proxy Spoonacular safely
// and fall back to mock data when quota is exceeded.

const MOCK_RESULTS = {
  results: [
    {
      id: 1001,
      title: "Garlic Butter Chicken with Rice",
      url: "https://example.com/mock-garlic-butter-chicken",
      image: "https://images.pexels.com/photos/4106483/pexels-photo-4106483.jpeg",
      source: "Mock Kitchen",
      cuisine: "comfort",
      ingredients: [
        "chicken",
        "garlic",
        "butter",
        "rice",
        "salt",
        "pepper",
        "parsley"
      ]
    },
    {
      id: 1002,
      title: "Tomato Basil Pasta",
      url: "https://example.com/mock-tomato-basil-pasta",
      image: "https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg",
      source: "Mock Kitchen",
      cuisine: "italian",
      ingredients: [
        "pasta",
        "tomato",
        "garlic",
        "olive oil",
        "basil",
        "parmesan"
      ]
    },
    {
      id: 1003,
      title: "Creamy Mushroom Omelette",
      url: "https://example.com/mock-mushroom-omelette",
      image: "https://images.pexels.com/photos/4109136/pexels-photo-4109136.jpeg",
      source: "Mock Kitchen",
      cuisine: "breakfast",
      ingredients: [
        "egg",
        "mushroom",
        "milk",
        "butter",
        "cheese",
        "salt",
        "pepper"
      ]
    }
  ]
};

function sendMock(res) {
  // This keeps your UI working even when Spoonacular is out of quota
  return res.status(200).json(MOCK_RESULTS);
}

export default async function handler(req, res) {
  try {
    const q = (req.query.q || "").toString().slice(0, 300);
    const key = process.env.SPOONACULAR_KEY;

    // If no key or no query => just use mock
    if (!key) {
      console.warn("SPOONACULAR_KEY missing, using mock results.");
      return sendMock(res);
    }
    if (!q) {
      return res.status(400).json({ error: "Missing q parameter" });
    }

    const url = new URL(
      "https://api.spoonacular.com/recipes/complexSearch"
    );
    url.searchParams.set("apiKey", key);
    url.searchParams.set("query", q);
    url.searchParams.set("number", "12");
    url.searchParams.set("addRecipeInformation", "true");
    url.searchParams.set("fillIngredients", "true");

    const r = await fetch(url.toString());

    // If Spoonacular says quota exceeded or similar => use mock
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("Spoonacular error:", r.status, text);

      if (r.status === 402 || r.status === 429) {
        console.warn("Quota/rate limit hit. Serving mock data instead.");
        return sendMock(res);
      }

      return res
        .status(502)
        .json({ error: "Upstream API error", detail: text.slice(0, 200) });
    }

    const j = await r.json();

    const results = (j.results || []).map((item) => {
      const ingredients = (item.extendedIngredients || []).map((i) =>
        (i.name || "").toLowerCase()
      );
      const primaryUrl =
        item.spoonacularSourceUrl || item.sourceUrl || "";

      return {
        id: item.id,
        title: item.title,
        url: primaryUrl,
        image: item.image || "",
        source: item.sourceName || "Spoonacular",
        cuisine: (item.cuisines && item.cuisines[0]) || "",
        country: "",
        ingredients
      };
    });

    res.setHeader(
      "Cache-Control",
      "s-maxage=600, stale-while-revalidate=3600"
    );
    return res.status(200).json({ results });
  } catch (e) {
    console.error("Handler error:", e);
    // Final safety net: mock
    return sendMock(res);
  }
}

