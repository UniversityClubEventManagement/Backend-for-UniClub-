
const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  toggleRegistration,
  getClubEvents,
  getMyEvents,
  searchClubEvents,
  searchPublicEvents,
  uploadEventImage
} = require("../controllers/eventController");
const { protect, optionalProtect } = require("../middleware/authMiddleware");


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  }
});

router.get("/", optionalProtect, getEvents);
router.get("/my", protect, getMyEvents);
router.get("/club", protect, getClubEvents);
router.get("/search", protect, searchClubEvents);
router.get("/search/public", optionalProtect, searchPublicEvents);
router.get("/:id", optionalProtect, getEventById);
router.post("/", protect, createEvent);
router.put("/:id", protect, updateEvent);
router.delete("/:id", protect, deleteEvent);
router.post("/:id/register", protect, toggleRegistration);
router.post("/:eventId/upload", protect, upload.single("image"), uploadEventImage);

module.exports = router;
//module.exports = router;
