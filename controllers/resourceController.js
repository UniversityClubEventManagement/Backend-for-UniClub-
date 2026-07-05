const ResourceRequest = require("../models/ResourceRequest");

const createResourceRequest = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { eventName, resourceType, date, time, details } = req.body;
    if (!eventName || !resourceType || !date || !time) {
      return res.status(400).json({ message: "Missing required resource request fields" });
    }

    const request = await ResourceRequest.create({
      user: req.user.id,
      eventName,
      resourceType,
      date,
      time,
      details,
    });

    res.status(201).json({ message: "Resource request submitted", request });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to create resource request", error: error.message });
  }
};

const getMyResourceRequests = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const requests = await ResourceRequest.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to fetch resource requests", error: error.message });
  }
};

module.exports = {
  createResourceRequest,
  getMyResourceRequests,
};
