const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { auth } = require('../middleware/auth');

// GET /payments/customer - get all payments for logged-in customer
router.get('/customer', auth, paymentController.getPaymentsByCustomer);

// POST /payments/create-order - create Razorpay order
router.post('/create-order', auth, paymentController.createOrder);

// POST /payments/verify - verify Razorpay payment
router.post('/verify', auth, paymentController.verifyPayment);

module.exports = router;
