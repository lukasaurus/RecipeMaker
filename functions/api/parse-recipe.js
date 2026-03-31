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

    const prompt = `You are a recipe parser. Extract structured data from the following recipe text.

Return a JSON object with these exact keys: ${tagList.map((t) => `"${t}"`).join(", ")}

Rules:
- "ingredients" should be a list with each ingredient on its own line, prefixed with "- "
- "instructions" should be numbered steps, each on its own line, prefixed with "1. ", "2. ", etc.
- "notes" should include any tips, variations, or storage info. If none found, return an empty string.
- For time fields, use human-readable format like "15 minutes" or "1 hour 30 minutes"
- If a field cannot be determined from the recipe, make your best guess or return an empty string
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
