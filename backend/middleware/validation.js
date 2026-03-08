const { body, validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

const userValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone')
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\d{10}$/).withMessage('Phone number must be exactly 10 digits'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['ADMIN', 'USER', 'DRIVER']).withMessage('Invalid role'),
  validateRequest
];

const vehicleValidation = [
  body('vehicleNumber').notEmpty().withMessage('Vehicle number is required'),
  body('type').isIn(['JCB', 'Hitachi', 'Rocksplitter', 'Tractor', 'Tipper', 'Compressor']).withMessage('Invalid vehicle type'),
  body('hourlyRate').isFloat({ min: 0 }).withMessage('Hourly rate must be positive'),
  validateRequest
];

const workRequestValidation = [
  body('workType').notEmpty().withMessage('Work type is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('customerMobile')
    .notEmpty().withMessage('Customer mobile number is required')
    .matches(/^\d{10}$/).withMessage('Customer mobile number must be exactly 10 digits'),
  body('location.latitude').isFloat().withMessage('Valid latitude is required'),
  body('location.longitude').isFloat().withMessage('Valid longitude is required'),
  body('location.address').notEmpty().withMessage('Address is required'),
  body('expectedDuration').isInt({ min: 1 }).withMessage('Expected duration must be positive'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  validateRequest
];

const attendanceValidation = [
  body('driver').notEmpty().withMessage('Driver is required'),
  body('vehicle').notEmpty().withMessage('Vehicle is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('checkIn').isISO8601().withMessage('Valid check-in time is required'),
  validateRequest
];

const paymentValidation = [
  body('workRequest').notEmpty().withMessage('Work request is required'),
  body('customer').notEmpty().withMessage('Customer is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be positive'),
  body('paymentMethod').isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER']).withMessage('Invalid payment method'),
  validateRequest
];

module.exports = {
  userValidation,
  vehicleValidation,
  workRequestValidation,
  attendanceValidation,
  paymentValidation,
  validateRequest
};