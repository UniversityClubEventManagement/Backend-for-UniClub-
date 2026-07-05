const bcrypt = require("bcryptjs");
const Event = require("../models/Event");
const User = require("../models/User");

const sanitizeUser = (user) => {
  const { _id, name, email, role, faculty, department, academicYear, clubName, createdAt, updatedAt } = user;
  return { _id, name, email, role, faculty, department, academicYear, clubName, createdAt, updatedAt };
};

const ensureSystemAdmin = (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }

  if (req.user.role !== "system-admin") {
    res.status(403).json({ message: "You do not have permission to access this resource" });
    return false;
  }

  return true;
};

const getAdminStats = async (req, res) => {
  if (!ensureSystemAdmin(req, res)) return;

  try {
    const totalClubs = await User.distinct("clubName", { clubName: { $exists: true, $ne: "" } }).then((clubs) => clubs.length);
    const totalMembers = await User.countDocuments({ clubName: { $exists: true, $ne: "" } });
    const pendingRequests = await Event.countDocuments({ status: "pending" });
    const approvedEvents = await Event.countDocuments({ status: "approved" });
    const events = await Event.find({ status: { $in: ["approved", "pending"] } }).lean();
    const grouped = events.reduce((acc, event) => {
      const dateKey = event.date ? new Date(event.date).toISOString().split("T")[0] : "";
      const key = `${event.location || ""}_${dateKey}_${event.startTime || ""}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const conflictCount = Object.values(grouped).filter((value) => value > 1).length;

    res.json({ totalClubs, totalMembers, pendingRequests, approvedEvents, conflictCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch admin stats", error: error.message });
  }
};

const getPendingEvents = async (req, res) => {
  if (!ensureSystemAdmin(req, res)) return;

  try {
    const events = await Event.find({ status: "pending" }).populate("createdBy", "name email clubName").lean();
    res.json(events.map((event) => ({
      ...event,
      attendees: event.registeredUsers?.length || 0,
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch pending events", error: error.message });
  }
};

const updateEventStatus = async (req, res) => {
  if (!ensureSystemAdmin(req, res)) return;

  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status update" });
    }

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    event.status = status;
    await event.save();

    res.json({ message: `Event ${status} successfully`, event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to update event status", error: error.message });
  }
};

const getClubs = async (req, res) => {
  if (!ensureSystemAdmin(req, res)) return;

  try {
    const clubs = await User.aggregate([
      { $match: { clubName: { $exists: true, $ne: "" } } },
      {
        $group: {
          _id: "$clubName",
          members: { $sum: 1 },
          createdAt: { $min: "$createdAt" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const clubSummaries = await Promise.all(
      clubs.map(async (club) => {
        const activeEvents = await Event.countDocuments({ clubName: club._id, status: { $in: ["approved", "pending"] } });
        const presidentRecord = await User.findOne({ clubName: club._id, role: "club-admin" }).select("name email").lean();
        return {
          clubName: club._id,
          members: club.members,
          activeEvents,
          status: activeEvents > 0 ? "active" : "inactive",
          president: presidentRecord ? presidentRecord.name : "Unknown",
          presidentEmail: presidentRecord ? presidentRecord.email : "",
          createdAt: club.createdAt,
        };
      })
    );

    res.json(clubSummaries);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch clubs", error: error.message });
  }
};

const createClub = async (req, res) => {
  if (!ensureSystemAdmin(req, res)) return;

  try {
    const { clubName, adminName, adminEmail, password } = req.body;

    if (!clubName || !adminName || !adminEmail || !password) {
      return res.status(400).json({ message: "Missing required club registration fields" });
    }

    const existingUser = await User.findOne({ email: adminEmail.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    const existingClub = await User.findOne({ role: "club-admin", clubName: clubName.trim() });
    if (existingClub) {
      return res.status(409).json({ message: "A club with this name already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: adminName,
      email: adminEmail.toLowerCase().trim(),
      password: hashedPassword,
      role: "club-admin",
      clubName: clubName.trim(),
    });

    res.status(201).json({ message: "Club registered successfully", club: sanitizeUser(user.toObject()) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to register club", error: error.message });
  }
};

const getConflicts = async (req, res) => {
  if (!ensureSystemAdmin(req, res)) return;

  try {
    const events = await Event.find({ status: { $in: ["approved", "pending"] } }).lean();
    const grouped = events.reduce((acc, event) => {
      const dateKey = event.date ? new Date(event.date).toISOString().split("T")[0] : "";
      const key = `${event.location || ""}_${dateKey}_${event.startTime || ""}`;
      acc[key] = acc[key] || [];
      acc[key].push(event);
      return acc;
    }, {});

    const conflicts = Object.values(grouped)
      .filter((group) => group.length > 1)
      .flatMap((group) => {
        const conflictPairs = [];
        for (let i = 0; i < group.length; i += 1) {
          for (let j = i + 1; j < group.length; j += 1) {
            conflictPairs.push({
              id: `${group[i]._id}_${group[j]._id}`,
              event1: `${group[i].title} (${group[i].clubName})`,
              event2: `${group[j].title} (${group[j].clubName})`,
              location: group[i].location,
              date: new Date(group[i].date).toISOString().split("T")[0],
              time: group[i].startTime,
            });
          }
        }
        return conflictPairs;
      });

    res.json(conflicts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch conflicts", error: error.message });
  }
};

module.exports = {
  getAdminStats,
  getPendingEvents,
  updateEventStatus,
  getClubs,
  createClub,
  getConflicts,
};
