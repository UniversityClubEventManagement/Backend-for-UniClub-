const notificationService = require("../services/notificationService");

const getNotifications = async (req, res) => {
  try {
    res.json(await notificationService.getUserNotifications(req.user._id, req.query));
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch notifications", error: error.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    res.json({ count: await notificationService.getUnreadCount(req.user._id) });
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch unread count", error: error.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(req.user._id, req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: "Unable to mark notification as read", error: error.message });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const result = await notificationService.markAllAsRead(req.user._id);
    res.json({ message: "All notifications marked as read", modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: "Unable to mark notifications as read", error: error.message });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const notification = await notificationService.deleteNotification(req.user._id, req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ message: "Unable to delete notification", error: error.message });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
