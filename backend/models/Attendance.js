const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fieldName: String,
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  reason: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const attendanceSchema = new mongoose.Schema({
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  checkIn: {
    type: Date,
    required: true
  },
  checkInLocation: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    address: String
  },
  checkOut: {
    type: Date
  },
  checkOutLocation: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    address: String
  },
  workHours: {
    type: Number,
    default: 0,
    min: 0
  },
  overtimeHours: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['PRESENT', 'ABSENT', 'HALF_DAY'],
    default: 'PRESENT'
  },
  approvalStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvalDate: Date,
  approvalNotes: String,
  siteName: String,
  workCompleted: {
    type: Boolean,
    default: false
  },
  dailySalary: {
    type: Number,
    default: 0
  },
  overtimeSalary: {
    type: Number,
    default: 0
  },
  deductions: {
    type: Number,
    default: 0
  },
  totalSalary: {
    type: Number,
    default: 0
  },
  salaryStatus: {
    type: String,
    enum: ['PENDING', 'PROCESSED', 'PAID'],
    default: 'PENDING'
  },
  notes: String,
  disputes: [{
    raisedBy: mongoose.Schema.Types.ObjectId,
    description: String,
    status: {
      type: String,
      enum: ['OPEN', 'RESOLVED'],
      default: 'OPEN'
    },
    resolution: String,
    raisedDate: Date,
    resolvedDate: Date
  }],
  auditLog: [auditLogSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

attendanceSchema.index({ driver: 1, date: 1 }, { unique: true });
attendanceSchema.index({ driver: 1, approvalStatus: 1 });
attendanceSchema.index({ date: 1, approvalStatus: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);