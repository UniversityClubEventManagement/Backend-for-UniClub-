const express = require("express");
const router = express.Router();
const { registerUser, loginUser, getStudentProfile,  updateStudentProfile, deleteStudentProfile } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/login", loginUser);
router.post("/register", registerUser);
router.get("/me", protect, (req, res) => {
  res.json({ user: req.user });
});
router.get("/profile", protect, getStudentProfile);
router.put("/profile", protect, updateStudentProfile);
router.delete("/profile", protect, deleteStudentProfile);

module.exports = router;