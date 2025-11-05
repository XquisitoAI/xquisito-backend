const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const tableRoutes = require("./routes/tableRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const userRoutes = require("./routes/userRoutes");
const menuRoutes = require("./routes/menuRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");

const userAdminPortalRoutes = require("./routes/userAdminPortalRoutes");
const menuAdminPortalRoutes = require("./routes/menuAdminPortalRoutes");
const imageUploadRoutes = require("./routes/imageUploadRoutes");
const analyticsRoutes = require("./routes/analytics");
const tapOrderRoutes = require("./routes/tapOrderRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: true, // Allow all origins (or specify your frontend URL)
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-guest-id",
      "x-table-number",
    ],
  })
);
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ status: "OK", message: "Xquisito Backend is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api", tableRoutes);
app.use("/api", paymentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/restaurants", restaurantRoutes);

app.use("/api/admin-portal", userAdminPortalRoutes);
app.use("/api/admin-portal/menu", menuAdminPortalRoutes);
app.use("/api/images", imageUploadRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api", tapOrderRoutes);

app.use("/api/super-admin", superAdminRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ message: "API endpoint not found" });
});

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
};

app.use(errorHandler);

module.exports = app;
