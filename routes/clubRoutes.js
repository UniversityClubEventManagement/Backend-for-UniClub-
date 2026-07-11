const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getClubMembers, addClubMember, removeClubMember } = require("../controllers/clubController");

router.get("/members", protect, getClubMembers);
router.post("/members", protect, addClubMember);
router.delete("/members/:id", protect, removeClubMember);

module.exports = router;
