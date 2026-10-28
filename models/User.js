const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
    role: {
      type: String,
      enum: ["student", "club-admin", "system-admin"],
      required: [true, "Role is required"],
    },
    faculty: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    academicYear: {
      type: String,
      trim: true,
    },

    studentRegistrationNumber: {
  type: String,
  trim: true,
  uppercase: true,
  match: [
    /^EG\/\d{4}\/\d{4}$/,
    "Registration number must use the format EG/1234/5678",
  ],
  unique: true,
  sparse: true,
  required: function () {
    return this.role === "student";
  },
},

    clubName: {
      type: String,
      trim: true,
    },
    isActive: {
   type: Boolean,
   default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
