const Notification = require("../models/Notification");
const User = require("../models/User");

const normalizeId = (value) => String(value?._id || value || "");

const createNotification = async (data) => {
  const recipientUserId = normalizeId(data.recipientUserId);
  if (!recipientUserId) return null;

  try {
    return await Notification.create({ ...data, recipientUserId });
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
};

const notifyUser = (recipientUserId, data) =>
  createNotification({ ...data, recipientUserId });

const notifyUsers = async (recipientUserIds, data) =>
  Promise.all([...new Set(recipientUserIds.map(normalizeId).filter(Boolean))].map((id) => notifyUser(id, data)));

const notifyRole = async (role, data) => {
  const users = await User.find({ role }).select("_id").lean();
  const ids = users.map((user) => user._id);
  if (role === "system-admin") ids.push("system-admin");
  return notifyUsers(ids, data);
};

const getUserNotifications = async (recipientUserId, options = {}) => {
  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const query = { recipientUserId: normalizeId(recipientUserId) };
  if (options.unread === "true") query.isRead = false;
  if (options.category) query.category = options.category;
  if (options.priority) query.priority = options.priority;

  const [notifications, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(query),
  ]);
  return { notifications, page, limit, total, pages: Math.ceil(total / limit) };
};

const getUnreadCount = (recipientUserId) =>
  Notification.countDocuments({ recipientUserId: normalizeId(recipientUserId), isRead: false });

const markAsRead = (recipientUserId, notificationId) =>
  Notification.findOneAndUpdate(
    { _id: notificationId, recipientUserId: normalizeId(recipientUserId) },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

const markAllAsRead = (recipientUserId) =>
  Notification.updateMany(
    { recipientUserId: normalizeId(recipientUserId), isRead: false },
    { isRead: true, readAt: new Date() }
  );

const deleteNotification = (recipientUserId, notificationId) =>
  Notification.findOneAndDelete({ _id: notificationId, recipientUserId: normalizeId(recipientUserId) });

const deleteExpiredNotifications = () =>
  Notification.deleteMany({ expiresAt: { $ne: null, $lte: new Date() } });

module.exports = {
  createNotification,
  notifyUser,
  notifyUsers,
  notifyRole,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteExpiredNotifications,
};
