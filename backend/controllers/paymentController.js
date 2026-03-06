const Payment = require('../models/Payment');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_1sTfDQerFweaom',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '2Z4SyJFDVeAuVbVHwXmYnC8Z'
});

// Get all payments for the logged-in customer
exports.getPaymentsByCustomer = async (req, res) => {
  try {
    const customerId = req.user.id;
    const payments = await Payment.find({ customer: customerId })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payments', error: error.message });
  }
};

// Create Razorpay order
exports.createOrder = async (req, res) => {
  try {
    const { amount, customerId, workRequestId, description } = req.body;
    const customer = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      description: description || 'MRS Earthmovers Payment',
      customer_notify: 1
    };

    const order = await razorpay.orders.create(options);

    // Save pending payment in database
    const payment = new Payment({
      customer,
      workRequest: workRequestId || null,
      amount,
      paymentMethod: 'RAZORPAY',
      status: 'PENDING',
      razorpayOrderId: order.id,
      description
    });

    await payment.save();

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId: payment._id
      }
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId } = req.body;

    // Verify signature
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '2Z4SyJFDVeAuVbVHwXmYnC8Z')
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update payment status
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    payment.status = 'SUCCESS';
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.transactionDate = new Date();
    await payment.save();

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: payment
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};
