const jwt = require("jsonwebtoken");
const User = require("../models/User");

const SYSTEM_ADMIN_ID = "system-admin";

const getSystemAdminUser = () => ({
  _id: SYSTEM_ADMIN_ID,
  name: "System Administrator",
  email: "admin",
  role: "system-admin",
});

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.id === SYSTEM_ADMIN_ID && decoded.role === "system-admin") {
      req.user = getSystemAdminUser();
      return next();
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token verification failed" });
  }
};

const optionalProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.id === SYSTEM_ADMIN_ID && decoded.role === "system-admin") {
      req.user = getSystemAdminUser();
      return next();
    }

    const user = await User.findById(decoded.id).select("-password");
    if (user) {
      req.user = user;
    }
  } catch (error) {
    // Ignore invalid token for optional auth.
  }

  next();
};

module.exports = { protect, optionalProtect };
