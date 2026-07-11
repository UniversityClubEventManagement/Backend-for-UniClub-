const express = require("express");
const router = express.Router();
const { getEvents, getEventById, createEvent, updateEvent, deleteEvent, toggleRegistration, getClubEvents, getMyEvents } = require("../controllers/eventController");
const { protect, optionalProtect } = require("../middleware/authMiddleware");

router.get("/", optionalProtect, getEvents);
router.get("/my", protect, getMyEvents);
router.get("/club", protect, getClubEvents);
router.get("/:id", optionalProtect, getEventById);
router.post("/", protect, createEvent);
router.put("/:id", protect, updateEvent);
router.delete("/:id", protect, deleteEvent);
router.post("/:id/register", protect, toggleRegistration);
router.post("/", protect, createEvent);
router.put("/:id", protect, updateEvent);
router.delete("/:id", protect, deleteEvent);
router.post("/:id/register", protect, toggleRegistration);

module.exports = router;
