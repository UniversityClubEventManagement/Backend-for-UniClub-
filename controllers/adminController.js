const bcrypt = require("bcryptjs");
const Event = require("../models/Event");
const User = require("../models/User");

const sanitizeUser = (user) => {
  const { _id, name, email, role, faculty, department, academicYear, clubName, createdAt, updatedAt } = user;
  return { _id, name, email, role, faculty, department, academicYear, clubName, createdAt, updatedAt };
};

const timeToMinutes = (value) => {
  if (!value) return 0;
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + (minutes || 0);
};

const isOverlapping = (eventA, eventB) => {
  if (!eventA?.date || !eventB?.date) return false;

  const dateA = new Date(eventA.date).toISOString().split("T")[0];
  const dateB = new Date(eventB.date).toISOString().split("T")[0];
  if (dateA !== dateB) return false;

  const startA = timeToMinutes(eventA.startTime);
  const endA = timeToMinutes(eventA.endTime);
  const startB = timeToMinutes(eventB.startTime);
  const endB = timeToMinutes(eventB.endTime);

  return startA < endB && startB < endA;
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
    const conflicts = [];

    for (let i = 0; i < events.length; i += 1) {
      for (let j = i + 1; j < events.length; j += 1) {
        const first = events[i];
        const second = events[j];

        if (first._id.toString() === second._id.toString()) continue;
        if (!isOverlapping(first, second)) continue;

        conflicts.push({
          id: `${first._id}_${second._id}`,
          event1Id: first._id.toString(),
          event2Id: second._id.toString(),
          event1: `${first.title} (${first.clubName})`,
          event2: `${second.title} (${second.clubName})`,
          location: first.location,
          date: new Date(first.date).toISOString().split("T")[0],
          time: `${first.startTime} - ${first.endTime}`,
        });
      }
    }

    res.json(conflicts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch conflicts", error: error.message });
  }
};

const resolveConflict = async (req, res) => {
  if (!ensureSystemAdmin(req, res)) return;

  try {
    const { eventId } = req.params;
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const allEvents = await Event.find({
      _id: { $ne: event._id },
      status: { $in: ["approved", "pending"] },
      date: event.date,
    }).lean();

    const candidateVenues = ["Main Hall", "Lecture Room A", "Conference Room", "Auditorium", "Open Ground", "Seminar Room"];
    const nextVenue = candidateVenues.find((venue) => !allEvents.some((candidate) => candidate.location?.toLowerCase() === venue.toLowerCase()));

    if (nextVenue) {
      event.location = nextVenue;
      await event.save();
      return res.json({ message: "Event moved to an alternate venue", event });
    }

    const nextDay = new Date(event.date);
    nextDay.setDate(nextDay.getDate() + 1);
    const sameDayConflict = allEvents.some((candidate) => candidate.date && new Date(candidate.date).toISOString().split("T")[0] === nextDay.toISOString().split("T")[0]);

    if (!sameDayConflict) {
      event.date = nextDay;
      await event.save();
      return res.json({ message: "Event moved to another date", event });
    }

    const newStartTime = timeToMinutes(event.startTime) + 60;
    const newEndTime = timeToMinutes(event.endTime) + 60;
    event.startTime = `${String(Math.floor(newStartTime / 60)).padStart(2, "0")}:${String(newStartTime % 60).padStart(2, "0")}`;
    event.endTime = `${String(Math.floor(newEndTime / 60)).padStart(2, "0")}:${String(newEndTime % 60).padStart(2, "0")}`;
    await event.save();

    res.json({ message: "Event moved to another time slot", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to resolve conflict", error: error.message });
  }
};

module.exports = {
  getAdminStats,
  getPendingEvents,
  updateEventStatus,
  getClubs,
  createClub,
  getConflicts,
  resolveConflict,
};
