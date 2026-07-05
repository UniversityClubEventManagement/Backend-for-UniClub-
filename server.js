const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://shaunkeithjosephs_db_user:Oh39FU7NUGgexA57@cluster0.ltmkpxw.mongodb.net/?appName=Cluster0";
const LOCAL_MONGO_URI = "mongodb://127.0.0.1:27017/uniClub";

console.log(`Connecting to MongoDB using URI: ${MONGO_URI}`);

const connectMongo = async (uri) => {
  console.log(`Trying MongoDB URI: ${uri}`);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log("MongoDB connected");
    return true;
  } catch (err) {
    console.error("MongoDB connection error:", err.message || err);
    return false;
  }
};

(async () => {
  const connected = await connectMongo(MONGO_URI);
  if (!connected && MONGO_URI !== LOCAL_MONGO_URI) {
    console.log("Attempting local MongoDB fallback...");
    await connectMongo(LOCAL_MONGO_URI);
  }
})();

app.get("/", (req, res) => {
  res.send("Backend is running");
});

const authRoutes = require("./routes/authRoutes");
const eventRoutes = require("./routes/eventRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const clubRoutes = require("./routes/clubRoutes");
const adminRoutes = require("./routes/adminRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/clubs", clubRoutes);
app.use("/api/admin", adminRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});