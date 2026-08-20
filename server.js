import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { connectDatabase, logRequest, getAnalytics, getDailyAnalytics, isDatabaseConnected } from "./lib/analytics.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  registerRoute,
  getRegisteredRoutes
} from "./utils/routeRegistry.js";
import { aiSong, facebookDownloader, geminiChat } from "./lib/scraper.js";

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: true,
      message: "Too many requests. Please try again later.",
      retryAfterSeconds: Math.ceil((Number(res.getHeader("Retry-After")) || 60))
    });
  }
});


app.disable("x-powered-by");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
  // Only API routes are counted in MongoDB analytics.
  if (!req.path.startsWith("/api/") && req.path !== "/api") {
    return next();
  }

  // Analytics endpoints are dashboard/internal reads and must not count
  // themselves as organic API traffic.
  if (
    req.path === "/api/system/analytics" ||
    req.path === "/api/system/analytics/daily"
  ) {
    return next();
  }

  const startedAt = Date.now();

  res.on("finish", () => {
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;
    const date = new Date().toISOString().slice(0, 10);

    void logRequest({
      date,
      method: req.method,
      path: req.path,
      statusCode,
      success: statusCode >= 200 && statusCode < 400,
      error: isError,
      ip: req.ip,
      responseTimeMs: Date.now() - startedAt
    });
  });

  next();
});

app.use("/api", (req, res, next) => {
  if (
    req.path === "/system/analytics" ||
    req.path === "/system/analytics/daily"
  ) {
    return next();
  }
  return apiLimiter(req, res, next);
});


registerRoute({
  app,
  method: "GET",
  path: "/api/system/health",
  category: "system",
  description: "Memeriksa status REST API",
  handler: (req, res) => {
    res.status(200).json({
      success: true,
      message: "API is running",
      timestamp: new Date().toISOString()
    });
  }
});

registerRoute({
  app,
  method: "GET",
  path: "/api/ai/lyricgenerator",
  category: "ai",
  description: "Generate lirik lagu menggunakan AI Song API",
  handler: async (req, res, next) => {
    const { prompt } = req.query;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "prompt" is required'
      });
    }

    try {
      const result = await aiSong({ prompt });
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }
});

registerRoute({
  app,
  method: "POST",
  path: "/api/ai/lyricgenerator",
  category: "ai",
  description: "Generate lirik lagu menggunakan AI Song API",
  handler: async (req, res, next) => {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "prompt" is required'
      });
    }

    try {
      const result = await aiSong({ prompt });
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }
});

registerRoute({
  app,
  method: "GET",
  path: "/api/downloader/facebook",
  category: "downloader",
  description: "Download video Facebook menggunakan YT5s",
  handler: async (req, res, next) => {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "URL parameter is required"
      });
    }

    try {
      const result = await facebookDownloader({ url });
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  }
});

registerRoute({
  app,
  method: "POST",
  path: "/api/downloader/facebook",
  category: "downloader",
  description: "Download video Facebook menggunakan YT5s",
  handler: async (req, res, next) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "URL parameter is required"
      });
    }

    try {
      const result = await facebookDownloader({ url });
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  }
});

registerRoute({
  app,
  method: "GET",
  path: "/api/ai/gemini",
  category: "ai",
  description: "Chat dengan Gemini melalui AI Jaze",
  handler: async (req, res, next) => {
    const { prompt, image, model } = req.query;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "prompt" is required'
      });
    }

    try {
      const result = await geminiChat({ prompt, image, model });
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  }
});

registerRoute({
  app,
  method: "POST",
  path: "/api/ai/gemini",
  category: "ai",
  description: "Chat dengan Gemini melalui AI Jaze",
  handler: async (req, res, next) => {
    const { prompt, image, model, messages } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "prompt" is required'
      });
    }

    try {
      const result = await geminiChat({ prompt, image, model, messages });
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  }
});

registerRoute({
  app,
  method: "GET",
  path: "/api/system/endpoints",
  category: "system",
  description: "Menampilkan seluruh endpoint, method, dan parameter REST API",
  handler: (req, res) => {
    const endpoints = getRegisteredRoutes();
    res.status(200).json({
      success: true,
      total: endpoints.length,
      endpoints
    });
  }
});


app.get("/api/system/analytics", async (req, res) => {
  try {
    res.json({ success: true, database: isDatabaseConnected(), analytics: await getAnalytics() });
  } catch (error) {
    res.status(500).json({ success: false, error: true, message: error.message });
  }
});

app.get("/api/system/analytics/daily", async (req, res) => {
  try {
    const days = Number(req.query.days || 7);
    res.json({ success: true, analytics: await getDailyAnalytics(days) });
  } catch (error) {
    res.status(500).json({ success: false, error: true, message: error.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint tidak ditemukan",
    method: req.method,
    path: req.originalUrl
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal Server Error"
  });
});

connectDatabase().catch(error => {
  console.error("Database startup error:", error.message);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Endpoint registry: http://localhost:${PORT}/api/system/endpoints`);
});
