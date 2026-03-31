# Recipe Maker — Design Document

## Overview

A web app where users paste a raw recipe, the app sends it to Google Gemini to extract structured data, then creates a formatted Google Doc from a template. Users authenticate with Google to grant Docs/Drive access.

---

## Architecture

```
┌─────────────┐       ┌──────────────────────┐       ┌─────────────┐
│   Browser    │──────▶│  Cloudflare Pages +  │──────▶│ Gemini API  │
│  (Static UI) │◀──────│  Workers (functions)  │◀──────│ (Flash 2.0) │
└─────┬───────┘       └──────────┬───────────┘       └─────────────┘
      │                          │
      │   Google OAuth 2.0       │  Google Docs API
      │   (browser-side flow)    │  (server-side, with user token)
      ▼                          ▼
┌─────────────────────────────────────┐
│         Google Cloud APIs           │
│  (OAuth 2.0 · Docs API · Drive API)│
└─────────────────────────────────────┘
```

### Why Cloudflare Pages + Workers?

| Requirement          | Cloudflare Pages (Free)             |
| -------------------- | ----------------------------------- |
| Static site hosting  | Yes                                 |
| Serverless functions | Yes (Workers, 100k req/day)         |
| Custom domain        | Optional, free                      |
| Cost                 | $0 forever (free tier, not a trial) |
| API key protection   | Yes (env vars in Workers)           |

The Gemini API key is stored as a Cloudflare Worker environment variable — never sent to the browser.

---

## Tech Stack

| Layer    | Choice              | Reason                                      |
| -------- | ------------------- | ------------------------------------------- |
| Frontend | Vanilla HTML/CSS/JS | No build step, simple, fast to develop      |
| Backend  | Cloudflare Workers  | Free serverless functions, protects API key |
| AI       | Gemini 2.0 Flash    | Fast, cheap, good at structured extraction  |
| Auth     | Google OAuth 2.0    | Required for Docs API access                |
| Docs     | Google Docs API v1  | Create & populate documents                 |
| Hosting  | Cloudflare Pages    | Free, deploys from GitHub repo              |

---

## User Flow

```
1. User visits app
2. User clicks "Sign in with Google"
   → OAuth consent screen requests: Google Docs + Drive (file creation) scopes
   → User grants access, app receives access token
3. User pastes raw recipe text into a text box
4. (Optional) User provides a Google Doc URL as a custom template
5. User clicks "Create Recipe Doc"
6. Browser sends recipe text + template info to Worker endpoint
7. Worker calls Gemini API:
   - Input: raw recipe text + list of template tags to extract
   - Output: JSON with structured fields
8. Worker returns structured JSON to browser
9. Browser calls Google Docs API (using user's OAuth token):
   a. Creates a new Google Doc
   b. Applies template structure with filled-in data
10. App shows link to the new Google Doc
```

---

## Template System

### Default Template Structure

The app ships with a built-in default template. The structure:

```
{{title}}

Prep Time: {{prep_time}}    Cook Time: {{cook_time}}
Total Time: {{total_time}}   Servings: {{servings}}

INGREDIENTS
{{ingredients}}

INSTRUCTIONS
{{instructions}}

NOTES
{{notes}}
```

### Dynamic Tag Discovery

When a user provides a custom Google Doc template:

1. App reads the template doc via Docs API
2. Extracts all `{{tag_name}}` patterns via regex
3. Sends those tag names to Gemini along with the recipe text
4. Gemini returns values for each discovered tag
5. App replaces tags in a new copy of the document

This means users can invent any tag they want (e.g., `{{cuisine}}`, `{{difficulty}}`, `{{calories}}`) and Gemini will attempt to extract or infer that info from the recipe.

### Standard Tags (always available)

| Tag                | Description                        |
| ------------------ | ---------------------------------- |
| `{{title}}`        | Recipe name                        |
| `{{prep_time}}`    | Preparation time                   |
| `{{cook_time}}`    | Cooking time                       |
| `{{total_time}}`   | Total time                         |
| `{{servings}}`     | Number of servings                 |
| `{{ingredients}}`  | Bulleted list of ingredients       |
| `{{instructions}}` | Numbered step-by-step instructions |
| `{{notes}}`        | Tips, variations, storage info     |

---

## API Design

### `POST /api/parse-recipe`

Called by the browser. The Worker handles the Gemini call.

**Request:**

```json
{
  "recipeText": "Paste the entire raw recipe here...",
  "tags": ["title", "prep_time", "cook_time", "total_time", "servings", "ingredients", "instructions", "notes"]
}
```

**Response:**

```json
{
  "title": "Classic Banana Bread",
  "prep_time": "15 minutes",
  "cook_time": "60 minutes",
  "total_time": "1 hour 15 minutes",
  "servings": "8",
  "ingredients": "- 3 ripe bananas\n- 1/3 cup melted butter\n- ...",
  "instructions": "1. Preheat oven to 350°F\n2. Mash bananas...\n...",
  "notes": "For extra moisture, add a tablespoon of sour cream."
}
```

---

## Google OAuth Setup

### What Needs to Be Created (Google Cloud Console)

1. **Google Cloud Project** — free to create
2. **OAuth Consent Screen**
   - User type: **External**
   - App name: "Recipe Maker"
   - Scopes required:
     - `https://www.googleapis.com/auth/documents` (create/edit Docs)
     - `https://www.googleapis.com/auth/drive.file` (access only files created by the app)
   - Publishing status: **Testing** (allows up to 100 test users without Google verification — sufficient for small group use)
3. **OAuth 2.0 Client ID**
   - Type: Web application
   - Authorized JavaScript origins: your Cloudflare Pages URL
   - Authorized redirect URIs: your Cloudflare Pages URL

### Important Note on "Testing" Mode

Google requires app verification for apps requesting sensitive scopes with >100 users. In **Testing** mode:

- You manually add Google accounts (up to 100) as test users
- Those users can authenticate — no verification needed
- This is perfect for a small work group
- Tokens expire after 7 days (users re-auth weekly)

---

## Google Doc Creation Flow (Detail)

Using the Google Docs API from the browser (user's token):

1. **Create empty doc:** `POST https://docs.googleapis.com/v1/documents` with title
2. **Build batch update requests** that insert formatted text:
   - Title as heading
   - Metadata (times, servings) as normal text
   - "INGREDIENTS" as heading, followed by bulleted list
   - "INSTRUCTIONS" as heading, followed by numbered list
   - "NOTES" as heading, followed by paragraph
3. **Send batch update:** `POST https://docs.googleapis.com/v1/documents/{docId}:batchUpdate`
4. **Return doc URL** to user: `https://docs.google.com/document/d/{docId}/edit`

For custom templates:

1. **Read template doc** via Docs API
2. **Copy it** via Drive API (`POST https://www.googleapis.com/drive/v3/files/{fileId}/copy`)
3. **Find-and-replace** each `{{tag}}` in the copy via `batchUpdate` with `replaceAllText` requests

---

## File Structure

```
RecipeMaker/
├── index.html              # Single-page app
├── style.css               # Styling
├── app.js                  # Main app logic (OAuth, UI, Docs API calls)
├── functions/              # Cloudflare Pages Functions (Workers)
│   └── api/
│       └── parse-recipe.js # Gemini API proxy
├── wrangler.toml           # Cloudflare config (optional, for local dev)
├── DESIGN.md               # This file
└── README.md               # Setup instructions
```

---

## Security Considerations

| Concern                  | Mitigation                                                              |
| ------------------------ | ----------------------------------------------------------------------- |
| Gemini API key exposure  | Key stored in Cloudflare Worker env var, never sent to browser          |
| Google token handling    | OAuth tokens stay in browser memory, not stored server-side             |
| CSRF on Worker endpoint  | Worker validates Origin header                                          |
| Scope minimization       | `drive.file` scope limits access to app-created files only              |
| Input injection (prompt) | Gemini prompt uses structured instructions, recipe text treated as data |

---

## Limitations & Tradeoffs

- **Minimal persistence:** Templates saved in browser `localStorage` only — no server-side storage. Recipes are not saved.
- **Token expiry in Testing mode:** Users re-authenticate every 7 days.
- **Gemini accuracy:** Extraction depends on recipe quality. Garbage in, garbage out.
- **No offline support:** Requires internet for all operations.
- **Rate limits:** Cloudflare free tier allows 100k Worker requests/day (more than enough).

---

## Setup Steps (for implementation)

1. Create Google Cloud Project + OAuth credentials
2. Create Cloudflare account (free)
3. Create Cloudflare Pages project linked to GitHub repo
4. Set Gemini API key as Worker environment variable
5. Set Google OAuth client ID in app config
6. Deploy
7. Add team members as test users in Google Cloud Console

---

## Design Decisions

1. **Rich formatting:** Google Docs will use styled headings, bold labels, bulleted/numbered lists — full Doc formatting, not plain text.
2. **Bad recipe input:** Gemini always returns its best attempt. App shows a warning if fields are missing or uncertain, but never rejects.
3. **Saved templates:** Users can save and switch between multiple custom templates. Templates are stored in `localStorage` (template name + Google Doc URL). A simple dropdown lets users pick a saved template or add a new one.

---

## Hosting Clarification

The **code** lives on GitHub. **Cloudflare Pages** deploys automatically from the GitHub repo — it watches for pushes and redeploys. This is not GitHub Pages. The distinction:

- **GitHub** = source code repository (where you push)
- **Cloudflare Pages** = hosting + serverless functions (where users visit the app)

Cloudflare Pages connects to your GitHub repo during setup. After that, every `git push` triggers an automatic deploy.
