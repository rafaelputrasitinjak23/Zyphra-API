import mongoose from "mongoose";

const requestSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  statusCode: { type: Number, required: true },
  success: { type: Boolean, required: true },
  error: { type: Boolean, required: true },
  ip: { type: String },
  responseTimeMs: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

requestSchema.index({ createdAt: -1 });
requestSchema.index({ date: 1, success: 1 });
requestSchema.index({ date: 1, error: 1 });

const RequestLog = mongoose.models.RequestLog ||
  mongoose.model("RequestLog", requestSchema);

// Vercel reuses warm serverless instances. Cache the connection promise so
// concurrent requests do not create multiple MongoDB connections.
let connectionPromise = null;
let lastConnectionError = null;

function getMongoUri() {
  return process.env.MONGODB_URI?.trim();
}

export async function connectDatabase() {
  const uri = getMongoUri();

  if (!uri) {
    lastConnectionError = "MONGODB_URI is not configured";
    console.warn(lastConnectionError);
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    lastConnectionError = null;
    return true;
  }

  if (mongoose.connection.readyState === 2 && connectionPromise) {
    return connectionPromise
      .then(() => true)
      .catch(() => false);
  }

  connectionPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30000,
    serverApi: { version: "1", strict: true, deprecationErrors: true }
  })
    .then(() => {
      lastConnectionError = null;
      console.log("MongoDB connected");
      return true;
    })
    .catch((error) => {
      lastConnectionError = error?.message || "Unknown MongoDB connection error";
      console.error("MongoDB connection failed:", lastConnectionError);
      connectionPromise = null;
      return false;
    });

  return connectionPromise;
}

mongoose.connection.on("connected", () => {
  lastConnectionError = null;
  console.log("MongoDB connection ready");
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
  connectionPromise = null;
});

mongoose.connection.on("error", (error) => {
  lastConnectionError = error?.message || "Unknown MongoDB error";
  console.error("MongoDB error:", lastConnectionError);
});

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

export function getDatabaseStatus() {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };

  return {
    connected: isDatabaseConnected(),
    state: states[mongoose.connection.readyState] || "unknown",
    error: lastConnectionError
  };
}

export async function logRequest(data) {
  // Do not make the API request wait for analytics. If the Vercel instance is
  // warm and MongoDB is available, reuse the cached connection.
  if (!isDatabaseConnected()) {
    await connectDatabase();
  }

  if (!isDatabaseConnected()) return;

  try {
    await RequestLog.create(data);
  } catch (error) {
    console.error("Analytics log failed:", error.message);
  }
}

export async function getAnalytics() {
  await connectDatabase();

  if (!isDatabaseConnected()) {
    return {
      enabled: false,
      message: lastConnectionError || "MongoDB is not connected"
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  const [overall, daily, success, errors, todaySuccess, todayErrors, byEndpoint] =
    await Promise.all([
      RequestLog.countDocuments(),
      RequestLog.countDocuments({ date: today }),
      RequestLog.countDocuments({ success: true }),
      RequestLog.countDocuments({ error: true }),
      RequestLog.countDocuments({ date: today, success: true }),
      RequestLog.countDocuments({ date: today, error: true }),
      RequestLog.aggregate([
        { $group: {
          _id: { method: "$method", path: "$path" },
          requests: { $sum: 1 },
          success: { $sum: { $cond: ["$success", 1, 0] } },
          errors: { $sum: { $cond: ["$error", 1, 0] } },
          avgResponseTimeMs: { $avg: "$responseTimeMs" }
        }},
        { $sort: { requests: -1 } },
        { $limit: 50 }
      ])
    ]);

  return {
    enabled: true,
    overall: { requests: overall, success, errors },
    today: { date: today, requests: daily, success: todaySuccess, errors: todayErrors },
    byEndpoint: byEndpoint.map(item => ({
      method: item._id.method,
      path: item._id.path,
      requests: item.requests,
      success: item.success,
      errors: item.errors,
      avgResponseTimeMs: Math.round(item.avgResponseTimeMs || 0)
    }))
  };
}

export async function getDailyAnalytics(days = 7) {
  await connectDatabase();

  if (!isDatabaseConnected()) {
    return {
      enabled: false,
      days: [],
      message: lastConnectionError || "MongoDB is not connected"
    };
  }

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - Math.max(1, Math.min(days, 31)) + 1);

  const result = await RequestLog.aggregate([
    { $match: { createdAt: { $gte: from } } },
    { $group: {
      _id: "$date",
      requests: { $sum: 1 },
      success: { $sum: { $cond: ["$success", 1, 0] } },
      errors: { $sum: { $cond: ["$error", 1, 0] } }
    }},
    { $sort: { _id: 1 } }
  ]);

  return { enabled: true, days: result.map(x => ({
    date: x._id,
    requests: x.requests,
    success: x.success,
    errors: x.errors
  })) };
}
