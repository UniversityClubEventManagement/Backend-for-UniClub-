const Event = require("../models/Event");

const getEvents = async (req, res) => {
  try {
    const events = await Event.find({ status: "approved" }).populate("createdBy", "name email role clubName").lean();
    const userId = req.user?.id;

    const result = events.map((event) => {
      const attendees = event.registeredUsers?.length || 0;
      return {
        ...event,
        attendees,
        isRegistered: userId ? event.registeredUsers.some((id) => id.toString() === userId) : false,
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch events", error: error.message });
  }
};

const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id).populate("createdBy", "name email role clubName").lean();

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const attendees = event.registeredUsers?.length || 0;
    const isRegistered = req.user ? event.registeredUsers.some((id) => id.toString() === req.user.id) : false;

    res.json({ ...event, attendees, isRegistered });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch event", error: error.message });
  }
};

const getClubEvents = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role !== "club-admin" && req.user.role !== "system-admin") {
      return res.status(403).json({ message: "You do not have permission to view club events" });
    }

    const query = req.user.role === "club-admin" ? { createdBy: req.user.id } : {};
    const events = await Event.find(query).populate("createdBy", "name email role clubName").lean();

    const result = events.map((event) => ({
      ...event,
      attendees: event.registeredUsers?.length || 0,
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch club events", error: error.message });
  }
};

const createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      date,
      startTime,
      endTime,
      location,
      registrationLimit,
      registrationDeadline,
      clubName: requestedClubName,
      bannerUrl,
    } = req.body;

    if (!title || !description || !category || !date || !startTime || !endTime || !location || !registrationDeadline) {
      return res.status(400).json({ message: "Missing required event fields" });
    }

    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role !== "club-admin" && req.user.role !== "system-admin") {
      return res.status(403).json({ message: "Only club administrators or system administrators can create events" });
    }

    const clubName = req.user.role === "club-admin" ? req.user.clubName : requestedClubName;
    if (!clubName) {
      return res.status(400).json({ message: "Club name is required for event creation" });
    }

    const event = await Event.create({
      title,
      description,
      category,
      date,
      startTime,
      endTime,
      location,
      registrationLimit: Number(registrationLimit) || 0,
      registrationDeadline,
      clubName,
      bannerUrl,
      createdBy: req.user.id,
      status: "pending",
    });

    res.status(201).json({ message: "Event created successfully", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to create event", error: error.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (req.user.role === "club-admin" && event.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only update your own club events" });
    }

    const {
      title,
      description,
      category,
      date,
      startTime,
      endTime,
      location,
      registrationLimit,
      registrationDeadline,
      bannerUrl,
    } = req.body;

    event.title = title || event.title;
    event.description = description || event.description;
    event.category = category || event.category;
    event.date = date || event.date;
    event.startTime = startTime || event.startTime;
    event.endTime = endTime || event.endTime;
    event.location = location || event.location;
    event.registrationLimit = Number(registrationLimit) || event.registrationLimit;
    event.registrationDeadline = registrationDeadline || event.registrationDeadline;
    event.bannerUrl = bannerUrl || event.bannerUrl;

    await event.save();
    res.json({ message: "Event updated successfully", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to update event", error: error.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (req.user.role === "club-admin" && event.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only delete your own club events" });
    }

    await event.deleteOne();
    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to delete event", error: error.message });
  }
};

const toggleRegistration = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { id } = req.params;
    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.status !== "approved") {
      return res.status(400).json({ message: "You can only register for approved events" });
    }

    const now = new Date();
    if (event.registrationDeadline && new Date(event.registrationDeadline) < now) {
      return res.status(400).json({ message: "Registration deadline has passed" });
    }

    const userId = req.user.id;
    const isRegistered = event.registeredUsers.some((id) => id.toString() === userId);

    if (isRegistered) {
      event.registeredUsers = event.registeredUsers.filter((id) => id.toString() !== userId);
    } else {
      if (event.registrationLimit > 0 && event.registeredUsers.length >= event.registrationLimit) {
        return res.status(400).json({ message: "Event has reached its registration limit" });
      }
      event.registeredUsers.push(req.user.id);
    }

    await event.save();
    res.json({ message: isRegistered ? "Registration removed" : "Registered successfully", isRegistered: !isRegistered, attendees: event.registeredUsers.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to update registration", error: error.message });
  }
};

const getMyEvents = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const events = await Event.find({ registeredUsers: req.user.id, status: "approved" }).populate("createdBy", "name clubName").lean();
    const result = events.map((event) => ({
      ...event,
      attendees: event.registeredUsers?.length || 0,
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch registered events", error: error.message });
  }
};

module.exports = {
  getEvents,
  getEventById,
  getClubEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  toggleRegistration,
  getMyEvents,
};
