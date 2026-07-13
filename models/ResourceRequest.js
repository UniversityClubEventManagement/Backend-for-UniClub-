const mongoose = require("mongoose");

const resourceRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventName: {
      type: String,
      required: [true, "Event name is required"],
      trim: true,
    },
    resourceType: {
      type: String,
      required: [true, "Resource type is required"],
      enum: ["Venue", "Photography", "Video", "Audio", "Projector", "Other"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
    },
    time: {
      type: String,
      required: [true, "Time is required"],
    },
    details: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ResourceRequest", resourceRequestSchema);
