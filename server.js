/**
 * Node.js Deploy Entry - Express
 * 编译后导入 dist/ 下的 bundle
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./dist/routes/auth.js";
import makeupRoutes from "./dist/routes/makeup.js";
import taskRoutes from "./dist/routes/tasks.js";
import rechargeRoutes from "./dist/routes/recharge.js";
import consumptionRoutes from "./dist/routes/consumption.js";

// 环境检查
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error('缺少 ADMIN_SECRET 环境变量');
  process.exit(1);
}

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [];
if (ALLOWED_ORIGINS.length === 0) {
  console.error('缺少 ALLOWED_ORIGINS 环境变量');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", platform: "node-express", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/makeup", makeupRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/recharge", rechargeRoutes);
app.use("/api/consumption", consumptionRoutes);

app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ success: false, message: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log("Makeup Backend running on port " + PORT);
});
