import { onRequestPost, onRequestOptions } from "./functions/api/parse-recipe.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/parse-recipe") {
      const context = { request, env, ctx };

      if (request.method === "OPTIONS") {
        return onRequestOptions(context);
      }
      if (request.method === "POST") {
        return onRequestPost(context);
      }

      return new Response("Method not allowed", { status: 405 });
    }

    // Let Cloudflare Assets handle everything else (static files)
    return env.ASSETS.fetch(request);
  },
};
