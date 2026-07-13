# Disposable Mail — Frontend (Netlify)

Static HTML/CSS/JS frontend for Disposable Mail. Talks to the backend repo
(Spring Boot on Railway) over its REST API.

## Connect to your Railway backend

Edit **`config.js`** — this is the only file you need to change:

```js
window.API_BASE_URL = "https://YOUR-APP-NAME.up.railway.app";
```

Replace with your actual Railway app URL (Railway → your service → Settings
→ Domains). No trailing slash.

## Deploying to Netlify

1. Push this repo to GitHub.
2. Netlify → **Add new site → Import an existing project** → select this repo.
3. Build settings: leave build command empty, publish directory `.` (this
   is a static site, no build step needed).
4. Deploy. Netlify gives you a URL like `https://disposable-mail.netlify.app`.
5. **Go back to your Railway backend** and set:
   ```
   ALLOWED_ORIGINS=https://disposable-mail.netlify.app
   ```
   (exact match, no trailing slash). Redeploy the backend for it to take effect.

## Local development

Just open `index.html` with a local server (not `file://`, since `fetch`
needs a proper origin for CORS to behave predictably):

```bash
npx serve .
# or
python3 -m http.server 5500
```

Set `config.js` to point at your local backend:
```js
window.API_BASE_URL = "http://localhost:8080";
```

## Avoiding CORS entirely (optional)

Instead of calling Railway directly, you can have Netlify proxy `/api/*`
requests to Railway so the browser only ever talks to your Netlify domain.
See the commented-out `[[redirects]]` block in `netlify.toml` — uncomment
it, fill in your Railway URL, and set `window.API_BASE_URL = "";` in
`config.js`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup |
| `style.css` | Styling |
| `app.js` | App logic, calls the backend API |
| `config.js` | **Edit this** — sets the backend URL |
| `netlify.toml` | Netlify build/redirect config |
