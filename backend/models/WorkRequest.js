const mongoose = require('mongoose');

const workRequestSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workType: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  customerMobile: {
    type: String,
    required: false,
    trim: true,
    match: [/^\d{10}$/, 'Customer mobile number must be exactly 10 digits']
  },
  location: {
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    pincode: String
  },
  expectedDuration: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING'
  },
  preferredVehicleType: {
    type: String,
    enum: ['JCB', 'Hitachi', 'Rocksplitter', 'Tractor', 'Tipper', 'Compressor'],
    default: null
  },
  assignedVehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle'
  },
  assignedDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  estimatedCost: {
    type: Number,
    default: 0
  },
  actualCost: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PARTIAL', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  photos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PhotoProof'
  }],
  completedAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('WorkRequest', workRequestSchema);