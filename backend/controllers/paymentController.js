const Payment = require('../models/Payment');
const WorkRequest = require('../models/WorkRequest');
const WorkAssignment = require('../models/WorkAssignment');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_SNxVl3bVPmBlzI',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'pbECC7rutMm2SB2mZJjTJBOt'
});

const DEFAULT_HOURLY_RATE = 1000;
const VEHICLE_TYPE_HOURLY_RATE = {
  JCB: 1000,
  Hitachi: 1200,
  Rocksplitter: 1500,
  Tractor: 800,
  Tipper: 1000,
  Compressor: 800
};

const roundAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parseFloat(Math.max(0, parsed).toFixed(2));
};

const getRateFromType = (type) => VEHICLE_TYPE_HOURLY_RATE[type] || DEFAULT_HOURLY_RATE;

const getDurationHours = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end - start;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return roundAmount(durationMs / (1000 * 60 * 60));
};

const getPayableDetails = async (workRequest) => {
  const assignment = await WorkAssignment.findOne({ workRequest: workRequest._id })
    .sort({ updatedAt: -1 })
    .select('status startTime endTime actualDuration updatedAt vehicle')
    .populate('vehicle', 'hourlyRate type');

  const hourlyRate = roundAmount(
    Number(workRequest?.assignedVehicle?.hourlyRate || 0) ||
    Number(assignment?.vehicle?.hourlyRate || 0) ||
    getRateFromType(workRequest?.preferredVehicleType)
  );

  const expectedHours = roundAmount(workRequest.expectedDuration || 0);
  const estimatedCost = roundAmount(workRequest.estimatedCost || expectedHours * hourlyRate);

  let actualHoursWorked = roundAmount(assignment?.actualDuration || 0);
  if (!actualHoursWorked) {
    actualHoursWorked = getDurationHours(assignment?.startTime, assignment?.endTime);
  }

  const calculatedActualCost = roundAmount(actualHoursWorked * hourlyRate);
  const storedActualCost = roundAmount(workRequest.actualCost || 0);

  let payableAmount = estimatedCost;
  if (workRequest.status === 'COMPLETED') {
    payableAmount = calculatedActualCost || storedActualCost || estimatedCost;
  } else if (workRequest.status === 'IN_PROGRESS') {
    payableAmount = calculatedActualCost || estimatedCost;
  }

  const paidAgg = await Payment.aggregate([
    {
      $match: {
        workRequest: workRequest._id,
        status: { $in: ['SUCCESS', 'COMPLETED'] }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const paidAmount = roundAmount(paidAgg[0]?.total || 0);
  const dueAmount = roundAmount(payableAmount - paidAmount);

  return {
    workRequest,
    assignment,
    hourlyRate,
    expectedHours,
    actualHoursWorked,
    estimatedCost,
    payableAmount: roundAmount(payableAmount),
    paidAmount,
    dueAmount
  };
};

const updateWorkRequestPaymentStatus = async (workRequestId) => {
  const workRequest = await WorkRequest.findById(workRequestId);
  if (!workRequest) return;

  const details = await getPayableDetails(workRequest);
  if (details.dueAmount <= 0) {
    workRequest.paymentStatus = 'COMPLETED';
  } else if (details.paidAmount > 0) {
    workRequest.paymentStatus = 'PARTIAL';
  } else {
    workRequest.paymentStatus = 'PENDING';
  }

  if (workRequest.status === 'COMPLETED' && details.payableAmount > 0) {
    workRequest.actualCost = details.payableAmount;
  }

  await workRequest.save();
};

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

exports.getDueWorkRequests = async (req, res) => {
  try {
    const customerId = req.user.id;
    const workRequests = await WorkRequest.find({
      customer: customerId,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] }
    })
      .populate('assignedVehicle', 'vehicleNumber type hourlyRate')
      .populate('assignedDriver', 'name phone')
      .sort({ updatedAt: -1 });

    const dueRows = [];
    for (const wr of workRequests) {
      const details = await getPayableDetails(wr);
      if (details.payableAmount <= 0) continue;

      dueRows.push({
        workRequestId: wr._id,
        workType: wr.workType,
        status: wr.status,
        location: wr.location,
        startDate: wr.startDate,
        endDate: wr.endDate,
        completedAt: wr.completedAt,
        assignedVehicle: wr.assignedVehicle,
        assignedDriver: wr.assignedDriver,
        expectedHours: details.expectedHours,
        actualHoursWorked: details.actualHoursWorked,
        hourlyRate: details.hourlyRate,
        payableAmount: details.payableAmount,
        paidAmount: details.paidAmount,
        dueAmount: details.dueAmount,
        paymentStatus: wr.paymentStatus || 'PENDING'
      });
    }

    res.json({ success: true, data: dueRows });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch due work requests',
      error: error.message
    });
  }
};

// Create Razorpay order
exports.createOrder = async (req, res) => {
  try {
    const { amount, workRequestId, description } = req.body;
    const customer = req.user.id;
    const inputAmount = roundAmount(amount);

    if (!inputAmount || inputAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    let safeAmount = inputAmount;
    let safeWorkRequestId = null;
    let computedDescription = description || 'MRS Earthmovers Payment';

    if (workRequestId) {
      const workRequest = await WorkRequest.findById(workRequestId).populate('assignedVehicle', 'hourlyRate type');
      if (!workRequest || String(workRequest.customer) !== String(customer)) {
        return res.status(403).json({
          success: false,
          message: 'Invalid work request for this customer'
        });
      }

      const details = await getPayableDetails(workRequest);
      if (details.dueAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'This work request is already fully paid'
        });
      }

      if (inputAmount > details.dueAmount) {
        return res.status(400).json({
          success: false,
          message: `Amount exceeds due amount. Remaining due is ₹${details.dueAmount}`,
          data: { dueAmount: details.dueAmount }
        });
      }

      safeAmount = inputAmount;
      safeWorkRequestId = workRequestId;
      computedDescription = description || `Payment for ${workRequest.workType} (${workRequest._id})`;
    }

    const options = {
      amount: Math.round(safeAmount * 100), // Convert to paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      description: computedDescription
    };

    const order = await razorpay.orders.create(options);

    // Save pending payment in database
    const payment = new Payment({
      customer,
      workRequest: safeWorkRequestId,
      amount: safeAmount,
      paymentMethod: 'RAZORPAY',
      status: 'PENDING',
      razorpayOrderId: order.id,
      description: computedDescription
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
    const isRazorpayFailure =
      error?.statusCode ||
      error?.error?.code ||
      String(error?.message || '').toLowerCase().includes('razorpay');

    res.status(isRazorpayFailure ? 502 : 500).json({
      success: false,
      message: isRazorpayFailure
        ? 'Razorpay service is unavailable. Please try another payment method.'
        : 'Failed to create order',
      error: error.message
    });
  }
};

// Record payment made through external UPI apps like GPay/PhonePe
exports.recordUpiPayment = async (req, res) => {
  try {
    const { amount, workRequestId, description, app } = req.body;
    const customer = req.user.id;
    const inputAmount = roundAmount(amount);

    if (!inputAmount || inputAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    let safeAmount = inputAmount;
    let safeWorkRequestId = null;
    let computedDescription = description || 'UPI Payment';

    if (workRequestId) {
      const workRequest = await WorkRequest.findById(workRequestId).populate('assignedVehicle', 'hourlyRate type');
      if (!workRequest || String(workRequest.customer) !== String(customer)) {
        return res.status(403).json({
          success: false,
          message: 'Invalid work request for this customer'
        });
      }

      const details = await getPayableDetails(workRequest);
      if (details.dueAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'This work request is already fully paid'
        });
      }

      if (inputAmount > details.dueAmount) {
        return res.status(400).json({
          success: false,
          message: `Amount exceeds due amount. Remaining due is Rs.${details.dueAmount}`,
          data: { dueAmount: details.dueAmount }
        });
      }

      safeAmount = inputAmount;
      safeWorkRequestId = workRequestId;
      computedDescription = description || `UPI payment for ${workRequest.workType} (${workRequest._id})`;
    }

    const payment = new Payment({
      customer,
      workRequest: safeWorkRequestId,
      amount: safeAmount,
      paymentMethod: 'UPI',
      status: 'SUCCESS',
      transactionId: `${String(app || 'UPI').toUpperCase()}_${Date.now()}`,
      description: computedDescription,
      transactionDate: new Date(),
      paidAt: new Date()
    });

    await payment.save();

    if (payment.workRequest) {
      await updateWorkRequestPaymentStatus(payment.workRequest);
    }

    res.json({
      success: true,
      message: 'UPI payment recorded successfully',
      data: payment
    });
  } catch (error) {
    console.error('UPI record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record UPI payment',
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

    if (payment.workRequest) {
      await updateWorkRequestPaymentStatus(payment.workRequest);
    }

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
