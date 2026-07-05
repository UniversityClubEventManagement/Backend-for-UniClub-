const User = require("../models/User");

const sanitizeUser = (user) => {
  const { _id, name, email, role, faculty, department, academicYear, clubName, createdAt, updatedAt } = user;
  return { _id, name, email, role, faculty, department, academicYear, clubName, createdAt, updatedAt };
};

const getClubMembers = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role !== "club-admin" && req.user.role !== "system-admin") {
      return res.status(403).json({ message: "You do not have permission to fetch club members" });
    }

    const clubName = req.user.clubName;
    if (!clubName) {
      return res.status(400).json({ message: "Club name is required for club administration" });
    }

    const members = await User.find({ clubName }).select("-password").lean();
    const sanitizedMembers = members.map((member) => sanitizeUser(member));
    res.json(sanitizedMembers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch club members", error: error.message });
  }
};

const addClubMember = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role !== "club-admin") {
      return res.status(403).json({ message: "Only club administrators can add new members" });
    }

    const clubName = req.user.clubName;
    if (!clubName) {
      return res.status(400).json({ message: "Club name is required for club administration" });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Member email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "student") {
      return res.status(400).json({ message: "Only student accounts can be added as club members" });
    }

    if (user.clubName && user.clubName !== clubName) {
      return res.status(400).json({ message: "User already belongs to a different club" });
    }

    if (user.clubName === clubName) {
      return res.status(400).json({ message: "User is already a member of your club" });
    }

    user.clubName = clubName;
    await user.save();

    res.status(200).json({ message: "Member added successfully", member: sanitizeUser(user.toObject()) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to add club member", error: error.message });
  }
};

const removeClubMember = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role !== "club-admin") {
      return res.status(403).json({ message: "Only club administrators can remove members" });
    }

    const clubName = req.user.clubName;
    if (!clubName) {
      return res.status(400).json({ message: "Club name is required for club administration" });
    }

    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "Member not found" });
    }

    if (user.clubName !== clubName) {
      return res.status(403).json({ message: "You can only remove members from your own club" });
    }

    if (user.role === "club-admin") {
      return res.status(400).json({ message: "Club administrators cannot be removed through this action" });
    }

    user.clubName = undefined;
    await user.save();

    res.status(200).json({ message: "Member removed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to remove club member", error: error.message });
  }
};

module.exports = {
  getClubMembers,
  addClubMember,
  removeClubMember,
};
