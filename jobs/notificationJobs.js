const Event = require("../models/Event");
const notificationService = require("../services/notificationService");

const combineEventDateTime = (event) => {
  const date = new Date(event.date);
  const [hours, minutes] = String(event.startTime || "00:00").split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
};

const inWindow = (target, minutesFromNow, toleranceMinutes = 6) => {
  const difference = (target.getTime() - Date.now()) / 60000;
  return difference > minutesFromNow - toleranceMinutes && difference <= minutesFromNow + toleranceMinutes;
};

const sendEventReminder = async (event, label, type, priority) => {
  if (!event.registeredUsers?.length) return;
  await notificationService.notifyUsers(event.registeredUsers, {
    title: `Event starts ${label}`,
    message: `“${event.title}” starts ${label} at ${event.startTime} in ${event.location}.`,
    type: "EVENT_REMINDER",
    category: "EVENTS",
    priority,
    entityType: "Event",
    entityId: event._id.toString(),
    actionUrl: `/events/${event._id}`,
    deduplicationKey: `${type}:${event._id}`,
  });
};

const runReminderJobs = async () => {
  const events = await Event.find({
    status: "approved",
    date: { $gte: new Date(Date.now() - 60 * 60 * 1000), $lte: new Date(Date.now() + 25 * 60 * 60 * 1000) },
  }).lean();

  for (const event of events) {
    const start = combineEventDateTime(event);
    if (inWindow(start, 24 * 60)) await sendEventReminder(event, "in 24 hours", "EVENT_REMINDER_24H", "MEDIUM");
    if (inWindow(start, 60)) await sendEventReminder(event, "in 1 hour", "EVENT_REMINDER_1H", "HIGH");
    if (event.registrationDeadline && inWindow(new Date(event.registrationDeadline), 24 * 60)) {
      await notificationService.notifyUsers(event.registeredUsers || [], {
        title: "Registration deadline approaching",
        message: `Registration for “${event.title}” closes in 24 hours.`,
        type: "EVENT_REMINDER",
        category: "REGISTRATIONS",
        priority: "MEDIUM",
        entityType: "Event",
        entityId: event._id.toString(),
        actionUrl: `/events/${event._id}`,
        deduplicationKey: `REGISTRATION_DEADLINE_24H:${event._id}`,
      });
    }
  }

  const pendingCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const oldPendingEvents = await Event.find({ status: "pending", createdAt: { $lte: pendingCutoff } }).lean();
  for (const event of oldPendingEvents) {
    await notificationService.notifyRole("system-admin", {
      title: "Event approval overdue",
      message: `“${event.title}” from ${event.clubName} has been waiting for approval for more than 3 days.`,
      type: "EVENT_REMINDER",
      category: "EVENTS",
      priority: "HIGH",
      entityType: "Event",
      entityId: event._id.toString(),
      actionUrl: "/system-admin",
      deduplicationKey: `PENDING_APPROVAL_3D:${event._id}`,
    });
  }
};

const runJobs = async () => {
  try {
    await runReminderJobs();
  } catch (error) {
    console.error("Scheduled notification job failed:", error.message);
  }
};

const startNotificationJobs = () => {
  const initialTimer = setTimeout(runJobs, 10000);
  const interval = setInterval(runJobs, 10 * 60 * 1000);
  initialTimer.unref?.();
  interval.unref?.();
};

module.exports = { runReminderJobs, startNotificationJobs };
