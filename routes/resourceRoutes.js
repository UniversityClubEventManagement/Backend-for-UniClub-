const express = require("express");
const router = express.Router();
const { createResourceRequest, getMyResourceRequests } = require("../controllers/resourceController");
const { protect } = require("../middleware/authMiddleware");

router.post("/", protect, createResourceRequest);
router.get("/", protect, getMyResourceRequests);

module.exports = router;
