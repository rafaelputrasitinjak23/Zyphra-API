# Zyphra API

Zyphra API is an Express.js REST API with an automatic endpoint registry and a responsive developer dashboard.

## Features

- Branded **Zyphra API** frontend dashboard
- Automatic endpoint discovery
- Search and category filtering
- Built-in API tester
- Health status indicator
- AI lyric generator
- Facebook downloader
- Gemini chat endpoint
- JSON API responses
- Responsive dark UI

## Run locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## API routes

- `GET /api/system/health`
- `GET|POST /api/ai/lyricgenerator`
- `GET|POST /api/downloader/facebook`
- `GET|POST /api/ai/gemini`
- `GET /api/system/endpoints`

The web dashboard is served from `/public` by Express.

## Adding a route

Use `registerRoute()` so the endpoint automatically appears in the dashboard registry.

```js
registerRoute({
  app,
  method: "GET",
  path: "/api/example",
  category: "example",
  description: "Example endpoint",
  handler: (req, res) => {
    res.json({ success: true });
  }
});
```

## Notes

The existing scraper/license watermark content in `lib/scraper.js` has been preserved.


## Rate limiting

All `/api/*` routes are protected by a configurable rate limiter.

Defaults:
- Window: 60 seconds
- Limit: 60 requests per IP per window
- Exceeded limit: HTTP 429

Configure with `.env`:

```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
```

For production deployments with multiple server instances, use a shared rate-limit store such as Redis instead of the default in-memory store.

## MongoDB analytics

Set `MONGODB_URI` in `.env`.

Every API request is recorded with:
- date
- method
- endpoint
- HTTP status
- success/error
- IP
- response time
- timestamp

Analytics endpoints:

```text
GET /api/system/analytics
GET /api/system/analytics/daily?days=7
```

Example environment:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/zyphra_api
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
PORT=3000
```


## Frontend dashboard

The frontend is intentionally limited to request analytics: daily requests, total requests, successful requests, errors, a Chart.js daily trend, and a top-endpoint request chart.


### Analytics scope

MongoDB request analytics and rate limiting apply only to routes under `/api/*`. Frontend requests such as `/`, `/app.js`, `/styles.css`, and other static files are not counted as API requests.

## Environment variables

The server loads `.env` automatically through `dotenv`.

Copy `.env.example` to `.env`, then set your MongoDB connection string:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/zyphra_api
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
PORT=3000
```

Never commit `.env` to Git.

### Excluded analytics traffic

`/api/system/analytics` and `/api/system/analytics/daily` are excluded from both MongoDB request statistics and rate limiting. These endpoints are used by the dashboard to read statistics and therefore are not treated as organic API usage.


The dashboard uses a smooth Chart.js line chart with curved lines, hover points, tooltips, and a subtle filled area for request volume.
