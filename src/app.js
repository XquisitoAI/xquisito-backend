const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const tableRoutes = require("./routes/tableRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const userRoutes = require("./routes/userRoutes");
const menuRoutes = require("./routes/menuRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const cartRoutes = require("./routes/cartRoutes");

const userAdminPortalRoutes = require("./routes/userAdminPortalRoutes");
const menuAdminPortalRoutes = require("./routes/menuAdminPortalRoutes");
const imageUploadRoutes = require("./routes/imageUploadRoutes");
const analyticsRoutes = require("./routes/analytics");
const tapOrderRoutes = require("./routes/tapOrderRoutes");
const roomOrderRoutes = require("./routes/roomOrderRoutes");
const mainPortalRoutes = require("./routes/mainPortalRoutes");
const qrCodeRoutes = require("./routes/qrCodeRoutes");
const qrResolverRoutes = require("./routes/qrResolverRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
const aiAgentRoutes = require("./routes/aiAgentRoutes");
const flexBillStatisticsRoutes = require("./routes/flexBillRoutes");
const pickAndGoRoutes = require("./routes/pickAndGoRoutes");
const tapPayRoutes = require("./routes/tapPayRoutes");
const segmentsRoutes = require("./routes/segmentsRoutes");
const campaignsRoutes = require("./routes/campaignsRoutes");
const smsTemplateRoutes = require("./routes/smsTemplateRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const posRoutes = require("./routes/posRoutes");
const supabase = require("./config/supabase");
const { supabaseAdmin } = require("./config/supabaseAuth");

const app = express();

// Orígenes permitidos para CORS
const allowedOrigins = [
  "https://flexbill.xquisito.ai",
  "https://taporderpay.xquisito.ai",
  "https://room-service.xquisito.ai",
  "https://pickandgo.xquisito.ai",
  "https://tapandpay.xquisito.ai",
  "https://admin-portal.xquisito.ai",
  "https://main-portal.xquisito.ai",
  "https://xquisito-flexbill-git-dev-leonardo-xquisito.vercel.app",
  "https://xquisito-pick-and-go-git-adrian-pick-and-go-xquisito.vercel.app",
  "https://xquisito-flexbill-git-diego-branch-xquisito.vercel.app",

  // Solo desarrollo
  ...(process.env.NODE_ENV === "development"
    ? [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
      ]
    : []),
];

app.use(helmet());
app.disable("x-powered-by");
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("Origen no autorizado por CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-guest-id",
      "x-table-number",
    ],
    credentials: true,
  }),
);
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// PCI Audit Log Middleware - Fire and forget
app.use((req, res, next) => {
  res.on("finish", () => {
    if (supabaseAdmin) {
      supabaseAdmin
        .from("pci_audit_logs")
        .insert({
          user_id: req.user?.id || "anonymous",
          event_type:
            res.statusCode === 401 || res.statusCode === 403
              ? "auth_failure"
              : "http_request",
          resource: `${req.method} ${req.path}`,
          result: res.statusCode < 400 ? "success" : "failure",
          source_ip:
            req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip,
          service: "xquisito-backend",
          metadata: {
            status_code: res.statusCode,
            user_agent: req.headers["user-agent"],
          },
        })
        .then(() => {})
        .catch((err) => {
          console.error("Audit log error:", err.message);
        });
    }
  });
  next();
});

app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ status: "OK", message: "Xquisito Backend is running" });
});

app.get("/health/supabase", async (req, res) => {
  try {
    const startTime = Date.now();
    const { errorRestaurants } = await supabase
      .from("restaurants")
      .select("id")
      .limit(1);
    const { errorCarts } = await supabase.from("carts").select("id").limit(1);
    const latency = Date.now() - startTime;

    if (errorRestaurants || errorCarts) {
      return res.status(503).json({
        status: "ERROR",
        service: "supabase",
        message: errorRestaurants?.message || errorCarts?.message,
        latency: `${latency}ms`,
      });
    }

    res.status(200).json({
      status: "OK",
      service: "supabase",
      message: "Supabase connection is healthy",
      latency: `${latency}ms`,
    });
  } catch (err) {
    res.status(503).json({
      status: "ERROR",
      service: "supabase",
      message: err.message,
    });
  }
});

// Supabase auth
app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);

app.use("/api", tableRoutes);
app.use("/api", paymentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/cart", cartRoutes);

app.use("/api/admin-portal", userAdminPortalRoutes);
app.use("/api/admin-portal/menu", menuAdminPortalRoutes);
app.use("/api/images", imageUploadRoutes);
app.use("/api/analytics", analyticsRoutes);

// Tap Order and Pay
app.use("/api", tapOrderRoutes);

// Room Service
app.use("/api", roomOrderRoutes);

// Main Portal
app.use("/api/main-portal", mainPortalRoutes);

// QR Code Management (Main Portal)
app.use("/api/main-portal", qrCodeRoutes);

// QR Code Resolver (Public)
app.use("/api/qr", qrResolverRoutes);

app.use("/api/super-admin", superAdminRoutes);
app.use("/api/ai-agent", aiAgentRoutes);

// FlexBill Statistics
app.use("/api/flex-bill", flexBillStatisticsRoutes);

// Pick & Go
app.use("/api/pick-and-go", pickAndGoRoutes);

// Tap & Pay
app.use("/api/tap-pay", tapPayRoutes);

// SMS Templates
app.use("/api/sms-templates", smsTemplateRoutes);

// Customer Segments for Rewards
app.use("/api/rewards/segments", segmentsRoutes);

// Campaigns for Rewards System
app.use("/api/campaigns", campaignsRoutes);

// Subscription System
app.use("/api/subscriptions", subscriptionRoutes);

// POS Integration
app.use("/api/pos", posRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ message: "API endpoint not found" });
});

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
};

app.use(errorHandler);

module.exports = app;
