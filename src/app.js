const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

// shared
const authRoutes = require("./routes/shared/authRoutes");
const profileRoutes = require("./routes/shared/profileRoutes");
const paymentRoutes = require("./routes/shared/paymentRoutes");
const userRoutes = require("./routes/shared/userRoutes");
const menuRoutes = require("./routes/shared/menuRoutes");
const restaurantRoutes = require("./routes/shared/restaurantRoutes");
const cartRoutes = require("./routes/shared/cartRoutes");
const imageUploadRoutes = require("./routes/shared/imageUploadRoutes");
const qrResolverRoutes = require("./routes/shared/qrResolverRoutes");
const aiAgentRoutes = require("./routes/shared/aiAgentRoutes");
const posRoutes = require("./routes/shared/posRoutes");
const printerRoutes = require("./routes/shared/printerRoutes");
const kitchenRoutes = require("./routes/shared/kitchenRoutes");
const paymentProviderRoutes = require("./routes/shared/paymentProviderRoutes");
// services
const flexBillRoutes = require("./routes/flex-bill/flexBillRoutes");
const pickAndGoRoutes = require("./routes/pick-and-go/pickAndGoRoutes");
const tapOrderRoutes = require("./routes/tap-order-and-pay/tapOrderRoutes");
const roomOrderRoutes = require("./routes/room-service/roomOrderRoutes");
const tapPayRoutes = require("./routes/tap-and-pay/tapPayRoutes");
// admin-portal
const userAdminPortalRoutes = require("./routes/admin-portal/userAdminPortalRoutes");
const menuAdminPortalRoutes = require("./routes/admin-portal/menuAdminPortalRoutes");
const analyticsRoutes = require("./routes/admin-portal/analyticsRoutes");
const qrCodeRoutes = require("./routes/admin-portal/qrCodeRoutes");
const flexBillDashboardRoutes = require("./routes/admin-portal/flexBillDashboardRoutes");
const segmentsRoutes = require("./routes/admin-portal/segmentsRoutes");
const campaignsRoutes = require("./routes/admin-portal/campaignsRoutes");
const smsTemplateRoutes = require("./routes/admin-portal/smsTemplateRoutes");
const subscriptionRoutes = require("./routes/admin-portal/subscriptionRoutes");
// main-portal
const mainPortalRoutes = require("./routes/main-portal/mainPortalRoutes");
const superAdminRoutes = require("./routes/main-portal/superAdminRoutes");
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

  "http://tauri.localhost", // Even Crew (Windows .exe)
  "https://tauri.localhost", // Even Crew (Android APK)
  "http://localhost:5173", // Even Crew (tauri:dev)

  // Solo desarrollo local
  ...(process.env.NODE_ENV === "development"
    ? [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173",
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
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      if (req.originalUrl.includes("/webhooks/")) {
        req.rawBody = buf;
      }
    },
  }),
);
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
          service: "even-backend",
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
  res.status(200).json({ status: "OK", message: "Even Backend is running" });
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

app.use("/api", flexBillRoutes);
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

// FlexBill Dashboard (admin portal)
app.use("/api/flex-bill", flexBillDashboardRoutes);

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

// Payment Providers
app.use("/api/payment-providers", paymentProviderRoutes);

// Printers
app.use("/api/pos", printerRoutes);

// Kitchen (Even Crew)
app.use("/api/kitchen", kitchenRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ message: "API endpoint not found" });
});

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
};

app.use(errorHandler);

module.exports = app;
