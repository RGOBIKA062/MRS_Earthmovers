const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  workRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkRequest'
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'RAZORPAY'],
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PARTIAL', 'SUCCESS', 'COMPLETED', 'FAILED', 'REFUNDED'],
    default: 'PENDING'
  },
  transactionId: String,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  description: String,
  dueDate: Date,
  transactionDate: Date,
  paidAt: Date,
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

module.exports = mongoose.model('Payment', paymentSchema);