# Recipe Maker

Paste a recipe, get a formatted Google Doc. Powered by Google Gemini AI.

## How It Works

1. Sign in with Google
2. Paste any recipe (any format)
3. Click "Create Recipe Doc"
4. AI extracts ingredients, instructions, times, etc.
5. A formatted Google Doc appears in your Drive

## Setup

### 1. Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)

2. Create a new project (or select an existing one)

3. Enable these APIs (APIs & Services > Library):
   
   - **Google Docs API**
   - **Google Drive API**

4. Configure the **OAuth Consent Screen** (APIs & Services > OAuth consent screen):
   
   - User type: **External**
   - App name: `Recipe Maker`
   - Add scopes:
     - `https://www.googleapis.com/auth/documents`
     - `https://www.googleapis.com/auth/drive.file`
   - Add your team's Google accounts as **Test users**
   - Leave publishing status as **Testing**

5. Create **OAuth 2.0 Client ID** (APIs & Services > Credentials > Create Credentials):
   
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://your-app.pages.dev` (your Cloudflare Pages URL)
   - Authorized redirect URIs: `https://your-app.pages.dev`
   - Copy the **Client ID**

6. Open `app.js` and replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with your Client ID.

### 2. Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key (free tier is sufficient)
3. Copy the key — you'll add it to Cloudflare in step 3

### 3. Cloudflare Pages

1. Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up)
2. Go to **Workers & Pages** > **Create application** > **Pages**
3. Connect your GitHub repository
4. Configure build settings:
   - Build command: (leave empty — no build step)
   - Build output directory: `/`
5. Deploy
6. After deployment, go to **Settings** > **Environment variables** and add:
   - `GEMINI_API_KEY` = your Gemini API key
   - `ALLOWED_ORIGINS` = `https://your-app.pages.dev` (your Cloudflare Pages URL)
7. Redeploy for env vars to take effect

### 4. Update OAuth Origins

After your first Cloudflare Pages deploy, you'll know your URL (e.g., `https://recipe-maker.pages.dev`). Go back to Google Cloud Console and update:

- Authorized JavaScript origins
- Authorized redirect URIs

## Custom Templates

You can create a Google Doc template with tags like:

```
{{title}}
Prep: {{prep_time}} | Cook: {{cook_time}}

{{ingredients}}

{{instructions}}
```

Any `{{tag_name}}` works — the AI will try to extract matching info from the recipe. Share the template doc with yourself (it must be accessible with your Google account).

## Local Development

To test locally:

1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/):
   
   ```
   npm install -g wrangler
   ```
2. Create a `.dev.vars` file in the project root:
   
   ```
   GEMINI_API_KEY=your_key_here
   ALLOWED_ORIGINS=http://localhost:8788
   ```
3. Run:
   
   ```
   npx wrangler pages dev .
   ```
4. Add `http://localhost:8788` to your Google OAuth authorized origins (for testing)

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (no build step)
- **Backend:** Cloudflare Pages Functions (Workers)
- **AI:** Google Gemini 2.0 Flash
- **Auth:** Google OAuth 2.0
- **Hosting:** Cloudflare Pages (free)
