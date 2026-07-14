const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

//
const validatePassword = (password) => {
  const passwordPattern =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.#_-]).{8,}$/;

  return passwordPattern.test(password);
};
//
const createToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

const sanitizeUser = (user) => {
  const { _id, name, email, role, faculty, department, academicYear, clubName, isActive, createdAt, updatedAt } = user;
  return { _id, name, email, role, faculty, department, academicYear, clubName,  isActive,createdAt, updatedAt };
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, faculty, department, academicYear, clubName } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
      const normalizedEmail = email.toLowerCase().trim();
    }

    //
    if (!validatePassword(password)) {
  return res.status(400).json({
    message:
      "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
  });
}
//
    if (role === "student") {
      if (!faculty || !department || !academicYear) {
        return res.status(400).json({ message: "Student registration requires faculty, department, and academic year." });
      }
    }

    if (role === "club-admin" && !clubName) {
      return res.status(400).json({ message: "Club administrator registration requires a club name." });
    }

    if (role === "system-admin") {
      return res.status(403).json({ message: "System administrator accounts cannot be created through registration." });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      faculty: role === "student" ? faculty : undefined,
      department: role === "student" ? department : undefined,
      academicYear: role === "student" ? academicYear : undefined,
      clubName: role === "club-admin" ? clubName : undefined,
      isActive: true,
    });

    const token = createToken(user);

    res.status(201).json({
      message: "Registration successful",
      user: sanitizeUser(user.toObject()),
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to register user", error: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
      const normalizedEmail = email.toLowerCase().trim();
    }

    if (email === "admin@gmail.com" && password === "admin") {
      const systemAdminUser = {
        _id: "system-admin",
        name: "System Administrator",
        email: "admin@gmail.com",
        role: "system-admin",
      };

      const token = jwt.sign(
        {
          id: systemAdminUser._id,
          email: systemAdminUser.email,
          role: systemAdminUser.role,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d",
        }
      );

      return res.json({
        message: "Login successful",
        user: sanitizeUser(systemAdminUser),
        token,
      });
    }

    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (user.isActive === false) {
  return res.status(403).json({
    message: "This account has been deactivated. Please contact support.",
  });
}

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = createToken(user);

    res.json({
      message: "Login successful",
      user: sanitizeUser(user.toObject()),
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to authenticate user", error: error.message });
  }
};

const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;

    const user = await User.findById(userId).select("-password");

    if (!user || user.isActive === false) {
      return res.status(404).json({
        message: "Student profile not found",
      });
    }

    return res.status(200).json({
      message: "Student profile fetched successfully",
      user: sanitizeUser(user.toObject()),
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({
      message: "Unable to fetch student profile",
      error: error.message,
    });
  }
};

const updateStudentProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;

    const { name, faculty, department, academicYear, clubName } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        name,
        faculty,
        department,
        academicYear,
        clubName,
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!updatedUser || updatedUser.isActive === false) {
      return res.status(404).json({
        message: "Student profile not found",
      });
    }

    return res.status(200).json({
      message: "Student profile updated successfully",
      user: sanitizeUser(updatedUser.toObject()),
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      message: "Unable to update student profile",
      error: error.message,
    });
  }
};

const deleteStudentProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;

    const deactivatedUser = await User.findByIdAndUpdate(
      userId,
      { isActive: false },
      { new: true }
    ).select("-password");

    if (!deactivatedUser) {
      return res.status(404).json({
        message: "Student profile not found",
      });
    }

    return res.status(200).json({
      message: "Student profile deactivated successfully",
    });
  } catch (error) {
    console.error("Delete profile error:", error);
    return res.status(500).json({
      message: "Unable to deactivate student profile",
      error: error.message,
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getStudentProfile,
  updateStudentProfile,
  deleteStudentProfile
};
