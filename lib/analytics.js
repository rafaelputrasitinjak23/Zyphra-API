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

let connected = false;

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI is not configured. Analytics database is disabled.");
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    connected = true;
    console.log("MongoDB connected");
    return true;
  } catch (error) {
    connected = false;
    console.error("MongoDB connection failed:", error.message);
    return false;
  }
}

export function isDatabaseConnected() {
  return connected && mongoose.connection.readyState === 1;
}

export async function logRequest(data) {
  if (!isDatabaseConnected()) return;
  try {
    await RequestLog.create(data);
  } catch (error) {
    console.error("Analytics log failed:", error.message);
  }
}

export async function getAnalytics() {
  if (!isDatabaseConnected()) {
    return { enabled: false, message: "MongoDB is not connected" };
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
  if (!isDatabaseConnected()) return { enabled: false, days: [] };

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
