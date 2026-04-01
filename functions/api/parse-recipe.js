export async function onRequestPost(context) {
  const { request, env } = context;

  // Validate origin to prevent CSRF
  const origin = request.headers.get("Origin");
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",")
    : [];

  // In development, allow localhost
  const isAllowed =
    allowedOrigins.some((o) => origin === o.trim()) ||
    origin?.startsWith("http://localhost") ||
    origin?.startsWith("http://127.0.0.1");

  const corsHeaders = {
    "Access-Control-Allow-Origin": isAllowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { recipeText, tags } = await request.json();

    if (!recipeText || typeof recipeText !== "string") {
      return new Response(
        JSON.stringify({ error: "recipeText is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tagList = tags && tags.length > 0
      ? tags
      : ["title", "prep_time", "cook_time", "total_time", "servings", "ingredients", "instructions", "notes"];

    const prompt = `You are an expert recipe formatting assistant. Extract structured data from the following recipe text and return a JSON object.

Return a JSON object with these exact keys: ${tagList.map((t) => `"${t}"`).join(", ")}

INGREDIENTS (applies to any key named "ingredients"):
- VERY MINIMAL format — just quantity and ingredient name. No extra descriptors.
- Use abbreviated measurements: T (tablespoon), t (teaspoon), c (cup), g (grams), ml, etc.
- Examples: "6 potatoes", "1 T oil", "½ t chilli powder", "250g flour", "2 eggs"
- If the recipe has sections (e.g. Potatoes, Salsa, Toppings, Base), include section headings prefixed with "**HEADING:**" (e.g. "**HEADING:Potatoes**", "**HEADING:Salsa**")
- Include a blank line marker "**BLANK**" before each section heading EXCEPT the first one
- Return as an array of strings

INSTRUCTIONS (applies to any key named "instructions", "method", "directions", or "steps"):
- AIM FOR 10-12 STEPS MAXIMUM. Only exceed this if the recipe genuinely requires it.
- Aggressively combine related actions. If steps can be done together or in the same sentence, merge them.
- Each step should be ONE sentence. No sub-steps, no "then", no lists within a step.
- Cut any preamble, repetition, or obvious instructions (e.g. "gather your ingredients").
- Use plain language. No flowery descriptions.
- Example: instead of "1. Cook bacon until crispy 2. Remove from pan 3. Drain on paper towel 4. Let cool", write ONE step: "Fry bacon until crispy, drain and set aside."
- Return as an array of strings

SERVINGS:
- Format as "Serves N" (e.g. "Serves 4", "Serves 6-8"). Default to "Serves 3" if not found.

NOTES:
- Any tips, variations, storage instructions, or other helpful info from the recipe. Return as an array of strings. If none found, return an empty array.

TEMPERATURES:
- Convert ALL temperatures to Celsius only. Never include Fahrenheit.
- Examples: "180°C", "Preheat oven to 200°C"

TIME FIELDS:
- Use human-readable format like "15 minutes" or "1 hour 30 minutes"

GENERAL:
- If a field cannot be determined from the recipe, make your best guess or return an empty string / empty array
- Return ONLY valid JSON, no markdown fences, no extra text

Recipe text:
"""
${recipeText}
"""`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      return new Response(
        JSON.stringify({ error: "Gemini API error", details: errorText }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiData = await geminiResponse.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return new Response(
        JSON.stringify({ error: "No response from Gemini" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse the JSON response from Gemini
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown fences if Gemini wrapped it
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        parsed = JSON.parse(match[1].trim());
      } else {
        throw new Error("Could not parse Gemini response as JSON");
      }
    }

    // Check for missing fields and add warnings
    const warnings = [];
    for (const tag of tagList) {
      if (!parsed[tag] || parsed[tag] === "") {
        warnings.push(`Could not extract "${tag}" from recipe`);
      }
    }

    return new Response(
      JSON.stringify({ data: parsed, warnings }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error", details: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions(context) {
  const origin = context.request.headers.get("Origin");
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
