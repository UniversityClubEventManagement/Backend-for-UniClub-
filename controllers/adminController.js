const bcrypt = require("bcryptjs");
const Event = require("../models/Event");
const User = require("../models/User");
const notificationService = require("../services/notificationService");
const { isPasswordValid, PASSWORD_POLICY_MESSAGE } = require("../utils/passwordPolicy");

const EVENT_LOCATIONS = [
  "AUDI", "AVC", "CIV-SR", "DO1", "DO2", "ECC", "EIE-SR", "ELR",
  "IS-SR", "LIB", "LR1", "LR2", "LT1", "LT2", "MENA-SR", "MME-SR",
  "NCC", "NLH1", "NLH2", "NLH3", "OCC", "SR",
];

const notifySafely = async (operation) => {
  try {
    await operation();
  } catch (error) {
    console.error("Notification delivery failed:", error.message);
  }
};

const sanitizeUser = (user) => {
  const { _id, name, email, role, faculty, department, academicYear, clubName, createdAt, updatedAt } = user;
  return { _id, name, email, role, faculty, department, academicYear, clubName, createdAt, updatedAt };
};

const timeToMinutes = (value) => {
  if (!value) return 0;
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + (minutes || 0);
};

const minutesToTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const dateKey = (value) => new Date(value).toISOString().split("T")[0];

const isOverlapping = (eventA, eventB) => {
  if (!eventA?.date || !eventB?.date) return false;

  const dateA = dateKey(eventA.date);
  const dateB = dateKey(eventB.date);
  if (dateA !== dateB) return false;
  if (String(eventA.location || "").trim().toUpperCase() !== String(eventB.location || "").trim().toUpperCase()) return false;

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
    let conflictCount = 0;
    for (let i = 0; i < events.length; i += 1) {
      for (let j = i + 1; j < events.length; j += 1) {
        if (isOverlapping(events[i], events[j])) conflictCount += 1;
      }
    }

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

    await notifySafely(() =>
      notificationService.notifyUser(event.createdBy, {
        actorUserId: req.user.id,
        title: status === "approved" ? "Event approved" : "Event rejected",
        message:
          status === "approved"
            ? `Your event “${event.title}” has been approved.`
            : `Your event “${event.title}” has been rejected.`,
        type: status === "approved" ? "EVENT_APPROVED" : "EVENT_REJECTED",
        category: "EVENTS",
        priority: status === "approved" ? "MEDIUM" : "HIGH",
        entityType: "Event",
        entityId: event._id.toString(),
        actionUrl: "/club-admin",
        deduplicationKey: `${status === "approved" ? "EVENT_APPROVED" : "EVENT_REJECTED"}:${event._id}:${event.__v}`,
      })
    );

    if (status === "approved") {
      await notifySafely(() =>
        notificationService.notifyRole("student", {
          actorUserId: req.user.id,
          title: "New event open for registration",
          message: `“${event.title}” by ${event.clubName} is now open for registration.`,
          type: "EVENT_APPROVED",
          category: "EVENTS",
          priority: "MEDIUM",
          entityType: "Event",
          entityId: event._id.toString(),
          actionUrl: `/events/${event._id}`,
          deduplicationKey: `EVENT_OPEN:${event._id}:${event.__v}`,
        })
      );
    }

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

    if (!isPasswordValid(password)) {
      return res.status(400).json({ message: PASSWORD_POLICY_MESSAGE });
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
    const otherEvent = req.body?.otherEventId ? await Event.findById(req.body.otherEventId) : null;
    let event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Preserve an already approved event when the conflicting event is still pending.
    if (event.status === "approved" && otherEvent?.status === "pending") {
      event = otherEvent;
    }

    const allEvents = await Event.find({
      _id: { $ne: event._id },
      status: { $in: ["approved", "pending"] },
    }).lean();

    const original = {
      date: new Date(event.date),
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
    };
    const duration = timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
    if (duration <= 0) {
      return res.status(400).json({ message: "The event has an invalid time period" });
    }

    const isFree = (candidate) => !allEvents.some((existing) => isOverlapping(candidate, existing));
    let resolved = null;
    let resolutionType = "";

    // First keep the date and time, and find another venue from the event form.
    for (const location of EVENT_LOCATIONS) {
      const candidate = { ...original, location };
      if (location !== original.location && isFree(candidate)) {
        resolved = candidate;
        resolutionType = "venue";
        break;
      }
    }

    // If all venues are occupied, keep the date and venue and find a 30-minute-aligned slot.
    if (!resolved) {
      for (let start = 8 * 60; start + duration <= 21 * 60; start += 30) {
        const candidate = {
          ...original,
          startTime: minutesToTime(start),
          endTime: minutesToTime(start + duration),
        };
        if (candidate.startTime !== original.startTime && isFree(candidate)) {
          resolved = candidate;
          resolutionType = "time";
          break;
        }
      }
    }

    // Finally search future dates, checking every configured venue and time slot.
    for (let dayOffset = 1; !resolved && dayOffset <= 365; dayOffset += 1) {
      const candidateDate = new Date(original.date);
      candidateDate.setUTCDate(candidateDate.getUTCDate() + dayOffset);
      for (const location of EVENT_LOCATIONS) {
        for (let start = 8 * 60; start + duration <= 21 * 60; start += 30) {
          const candidate = {
            date: candidateDate,
            location,
            startTime: minutesToTime(start),
            endTime: minutesToTime(start + duration),
          };
          if (isFree(candidate)) {
            resolved = candidate;
            resolutionType = "date";
            break;
          }
        }
        if (resolved) break;
      }
    }

    if (!resolved) {
      return res.status(409).json({ message: "No free venue, time, or date could be found" });
    }

    event.date = resolved.date;
    event.location = resolved.location;
    event.startTime = resolved.startTime;
    event.endTime = resolved.endTime;
    event.status = "pending";
    await event.save();

    await notifySafely(() =>
      notificationService.notifyUser(event.createdBy, {
        actorUserId: req.user.id,
        title: "Event conflict resolved",
        message: `“${event.title}” was moved to ${dateKey(event.date)} at ${event.startTime}-${event.endTime} in ${event.location}. It is awaiting system-admin approval.`,
        type: "EVENT_UPDATED",
        category: "EVENTS",
        priority: "HIGH",
        entityType: "Event",
        entityId: event._id.toString(),
        actionUrl: "/club-admin",
        deduplicationKey: `CONFLICT_RESOLVED:${event._id}:${event.__v}`,
      })
    );

    res.json({
      message: `Conflict resolved using a new ${resolutionType}. The event is pending approval.`,
      event,
    });
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
