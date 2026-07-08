const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getAdminStats,
  getPendingEvents,
  updateEventStatus,
  getClubs,
  createClub,
  getConflicts,
  resolveConflict,
} = require("../controllers/adminController");

router.get("/stats", protect, getAdminStats);
router.get("/events/pending", protect, getPendingEvents);
router.put("/events/:id/status", protect, updateEventStatus);
router.get("/clubs", protect, getClubs);
router.post("/clubs", protect, createClub);
router.get("/conflicts", protect, getConflicts);
router.post("/conflicts/:eventId/resolve", protect, resolveConflict);

module.exports = router;
