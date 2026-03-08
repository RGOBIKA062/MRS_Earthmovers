const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { auth } = require('../middleware/auth');

// GET /payments/customer - get all payments for logged-in customer
router.get('/customer', auth, paymentController.getPaymentsByCustomer);

// GET /payments/due-work-requests - get payable and due amounts per work request
router.get('/due-work-requests', auth, paymentController.getDueWorkRequests);

// POST /payments/create-order - create Razorpay order
router.post('/create-order', auth, paymentController.createOrder);

// POST /payments/record-upi - record UPI payment done via external app
router.post('/record-upi', auth, paymentController.recordUpiPayment);

// POST /payments/verify - verify Razorpay payment
router.post('/verify', auth, paymentController.verifyPayment);

module.exports = router;
