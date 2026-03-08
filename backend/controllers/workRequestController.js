const WorkRequest = require('../models/WorkRequest');
const WorkAssignment = require('../models/WorkAssignment');
const Vehicle = require('../models/Vehicle');
require('../models/PhotoProof');
const winston = require('winston');
const mongoose = require('mongoose');
const {
  reserveVehicleForAssignment,
  releaseVehicleIfNoActiveAssignments
} = require('../services/vehicleAvailabilityService');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
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

const PROGRESS_STATUSES = new Set(['STARTED', 'REACHED_SITE', 'IN_PROGRESS']);

const roundCurrency = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parseFloat(Math.max(0, parsed).toFixed(2));
};

const getRateFromType = (type) => {
  if (!type) return DEFAULT_HOURLY_RATE;
  return VEHICLE_TYPE_HOURLY_RATE[type] || DEFAULT_HOURLY_RATE;
};

const getDurationHours = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end - start;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return roundCurrency(durationMs / (1000 * 60 * 60));
};

const buildBillingSummary = (workRequest, assignment = null) => {
  const status = String(workRequest?.status || '').toUpperCase();
  const expectedHours = roundCurrency(workRequest?.expectedDuration || 0);

  const assignedVehicleRate = Number(workRequest?.assignedVehicle?.hourlyRate || 0);
  const assignmentVehicleRate = Number(assignment?.vehicle?.hourlyRate || 0);
  const fallbackRate = getRateFromType(workRequest?.preferredVehicleType);
  const hourlyRate = roundCurrency(assignedVehicleRate || assignmentVehicleRate || fallbackRate);

  const calculatedEstimatedCost = roundCurrency(expectedHours * hourlyRate);
  const storedEstimatedCost = roundCurrency(workRequest?.estimatedCost || 0);
  const estimatedCost = storedEstimatedCost > 0 ? storedEstimatedCost : calculatedEstimatedCost;

  let actualHoursWorked = roundCurrency(assignment?.actualDuration || 0);
  if (!actualHoursWorked) {
    actualHoursWorked = getDurationHours(assignment?.startTime, assignment?.endTime);
  }

  if (!actualHoursWorked && PROGRESS_STATUSES.has(String(assignment?.status || '').toUpperCase())) {
    actualHoursWorked = getDurationHours(assignment?.startTime, new Date());
  }

  const calculatedActualCost = roundCurrency(actualHoursWorked * hourlyRate);
  const storedActualCost = roundCurrency(workRequest?.actualCost || 0);

  let payableAmount = estimatedCost;
  if (status === 'COMPLETED') {
    payableAmount = calculatedActualCost || storedActualCost || estimatedCost;
  } else if (status === 'IN_PROGRESS' || PROGRESS_STATUSES.has(String(assignment?.status || '').toUpperCase())) {
    payableAmount = calculatedActualCost || estimatedCost;
  }

  return {
    hourlyRate,
    expectedHours,
    actualHoursWorked,
    estimatedCost,
    calculatedEstimatedCost,
    calculatedActualCost,
    storedActualCost,
    payableAmount: roundCurrency(payableAmount),
    isFinal: status === 'COMPLETED'
  };
};

const attachBillingSummary = (workRequestDoc, assignment = null) => {
  const workRequest = typeof workRequestDoc?.toObject === 'function'
    ? workRequestDoc.toObject()
    : { ...workRequestDoc };

  const billingSummary = buildBillingSummary(workRequest, assignment);
  workRequest.billingSummary = billingSummary;
  workRequest.payableAmount = billingSummary.payableAmount;
  workRequest.hourlyRate = billingSummary.hourlyRate;
  workRequest.actualHoursWorked = billingSummary.actualHoursWorked;

  if (billingSummary.isFinal && billingSummary.calculatedActualCost > 0) {
    workRequest.actualCost = billingSummary.calculatedActualCost;
  }

  if (!workRequest.estimatedCost || workRequest.estimatedCost <= 0) {
    workRequest.estimatedCost = billingSummary.estimatedCost;
  }

  return workRequest;
};

class WorkRequestController {
  async createWorkRequest(req, res) {
    try {
      const workRequest = new WorkRequest(req.body);
      await workRequest.save();

      await workRequest.populate('customer', 'name phone email');

      const preferredRate = getRateFromType(workRequest.preferredVehicleType);
      const estimatedCost = roundCurrency(workRequest.expectedDuration * preferredRate);
      workRequest.estimatedCost = estimatedCost;
      await workRequest.save();

      res.status(201).json({
        success: true,
        message: 'Work request created successfully',
        data: workRequest
      });
    } catch (error) {
      logger.error('Work request creation error:', {
        error: error,
        body: req.body
      });
      res.status(400).json({
        success: false,
        message: error.message,
        details: error.errors || null,
        body: req.body
      });
    }
  }

  async getWorkRequests(req, res) {
    try {
      const { page = 1, limit = 10, status, customer, workType, startDate, endDate } = req.query;

      const filter = {};
      if (status) filter.status = status;
      if (customer) filter.customer = customer;
      if (workType) filter.workType = workType;
      if (startDate && endDate) {
        filter.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const workRequests = await WorkRequest.find(filter)
        .populate('customer', 'name phone email')
        .populate('assignedVehicle', 'vehicleNumber type hourlyRate status lastOdometer driver')
        .populate('assignedDriver', 'name phone email')
        .populate({
          path: 'assignedVehicle',
          populate: {
            path: 'driver',
            select: 'name phone email'
          }
        })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const workRequestIds = workRequests.map((wr) => wr._id);
      const assignments = workRequestIds.length
        ? await WorkAssignment.find({ workRequest: { $in: workRequestIds } })
          .select('workRequest status startTime endTime actualDuration updatedAt completedAt vehicle')
          .populate('vehicle', 'hourlyRate type')
        : [];

      const latestAssignmentByRequest = new Map();
      assignments.forEach((assignment) => {
        const key = String(assignment.workRequest);
        const existing = latestAssignmentByRequest.get(key);
        if (!existing || new Date(assignment.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
          latestAssignmentByRequest.set(key, assignment);
        }
      });

      const workRequestsWithBilling = workRequests.map((wr) => {
        const assignment = latestAssignmentByRequest.get(String(wr._id));
        return attachBillingSummary(wr, assignment);
      });

      const total = await WorkRequest.countDocuments(filter);

      res.json({
        success: true,
        data: workRequestsWithBilling,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Work requests fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch work requests'
      });
    }
  }

  async getWorkRequest(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid work request id'
        });
      }

      const workRequest = await WorkRequest.findById(req.params.id)
        .populate('customer', 'name phone email')
        .populate('assignedVehicle', 'vehicleNumber type hourlyRate status lastOdometer driver')
        .populate('assignedDriver', 'name phone email')
        .populate({
          path: 'assignedVehicle',
          populate: {
            path: 'driver',
            select: 'name phone email'
          }
        })
        .populate('photos');

      if (!workRequest) {
        return res.status(404).json({
          success: false,
          message: 'Work request not found'
        });
      }

      const assignment = await WorkAssignment.findOne({ workRequest: workRequest._id })
        .select('status startTime endTime actualDuration locationTrail updatedAt vehicle')
        .populate('vehicle', 'hourlyRate type');

      const latestLocation = assignment?.locationTrail?.length
        ? assignment.locationTrail[assignment.locationTrail.length - 1]
        : (assignment?.location
          ? { ...assignment.location, timestamp: assignment.updatedAt }
          : null);

      const payload = attachBillingSummary(workRequest, assignment);
      payload.assignmentStatus = assignment?.status || null;
      payload.liveLocation = latestLocation;
      payload.assignmentStartTime = assignment?.startTime || null;
      payload.assignmentEndTime = assignment?.endTime || null;
      payload.assignmentUpdatedAt = assignment?.updatedAt || null;
      payload.assignmentCompletedAt = assignment?.completedAt || null;

      res.json({
        success: true,
        data: payload
      });
    } catch (error) {
      logger.error('Work request fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch work request'
      });
    }
  }

  async assignWork(req, res) {
    try {
      const { vehicleId, driverId } = req.body;
      const workRequest = await WorkRequest.findById(req.params.id);

      if (!workRequest) {
        return res.status(404).json({
          success: false,
          message: 'Work request not found'
        });
      }

      if (workRequest.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          message: 'Work request is not in pending status'
        });
      }

      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle || !vehicle.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle not available'
        });
      }

      // CHECK FOR DATE CONFLICTS - Driver availability
      const driverConflict = await WorkRequest.findOne({
        assignedDriver: driverId,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
        $or: [
          // Overlap condition: existing work overlaps with new work
          {
            startDate: { $lt: workRequest.endDate },
            endDate: { $gt: workRequest.startDate }
          }
        ]
      });

      if (driverConflict) {
        return res.status(400).json({
          success: false,
          message: `Driver has conflicting assignment from ${driverConflict.startDate.toISOString()} to ${driverConflict.endDate.toISOString()}`
        });
      }

      // CHECK FOR DATE CONFLICTS - Vehicle availability
      const vehicleConflict = await WorkRequest.findOne({
        assignedVehicle: vehicleId,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
        $or: [
          // Overlap condition: existing work overlaps with new work
          {
            startDate: { $lt: workRequest.endDate },
            endDate: { $gt: workRequest.startDate }
          }
        ]
      });

      if (vehicleConflict) {
        return res.status(400).json({
          success: false,
          message: `Vehicle has conflicting assignment from ${vehicleConflict.startDate.toISOString()} to ${vehicleConflict.endDate.toISOString()}`
        });
      }

      workRequest.assignedVehicle = vehicleId;
      workRequest.assignedDriver = driverId;
      workRequest.status = 'ASSIGNED';
      await workRequest.save();

      const reservedVehicle = await reserveVehicleForAssignment(vehicleId, driverId);
      if (!reservedVehicle) {
        workRequest.assignedVehicle = undefined;
        workRequest.assignedDriver = undefined;
        workRequest.status = 'PENDING';
        await workRequest.save();

        return res.status(409).json({
          success: false,
          message: 'Vehicle was just assigned to another work. Please pick a different vehicle.'
        });
      }

      const workAssignment = new WorkAssignment({
        workRequest: workRequest._id,
        vehicle: vehicleId,
        driver: driverId,
        startTime: new Date(workRequest.startDate),
        status: 'ASSIGNED',
        location: workRequest.location
      });
      await workAssignment.save();

      await workRequest.populate('customer', 'name phone email');
      await workRequest.populate('assignedVehicle', 'vehicleNumber type hourlyRate status lastOdometer');
      await workRequest.populate('assignedDriver', 'name phone email');

      logger.info(`Work assigned successfully: ${workRequest._id} to driver ${driverId}`);

      res.json({
        success: true,
        message: 'Work assigned successfully',
        data: { workRequest, workAssignment }
      });
    } catch (error) {
      logger.error('Work assignment error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateWorkStatus(req, res) {
    try {
      const { status, notes } = req.body;
      const workRequest = await WorkRequest.findById(req.params.id);

      if (!workRequest) {
        return res.status(404).json({
          success: false,
          message: 'Work request not found'
        });
      }

      if (!workRequest.customerMobile) {
        const customer = await require('../models/User').findById(workRequest.customer).select('phone');
        if (customer?.phone) {
          workRequest.customerMobile = customer.phone;
        }
      }

      workRequest.status = status;
      if (status === 'COMPLETED') {
        workRequest.completedAt = new Date();
        const provisionalBilling = buildBillingSummary(workRequest, null);
        workRequest.actualCost = provisionalBilling.payableAmount;
      }
      if (notes) workRequest.notes = notes;
      
      await workRequest.save();

      if ((status === 'COMPLETED' || status === 'CANCELLED') && workRequest.assignedVehicle) {
        const assignment = await WorkAssignment.findOne({
          workRequest: workRequest._id,
          status: { $in: ['ASSIGNED', 'STARTED', 'REACHED_SITE', 'IN_PROGRESS'] }
        }).populate('vehicle', 'hourlyRate type');

        if (assignment) {
          assignment.status = status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED';
          assignment.endTime = new Date();
          assignment.updatedAt = new Date();
          if (status === 'COMPLETED') {
            assignment.completedAt = new Date();
          }
          await assignment.save();
        }

        await releaseVehicleIfNoActiveAssignments(workRequest.assignedVehicle);

        if (status === 'COMPLETED') {
          const billingSummary = buildBillingSummary(workRequest, assignment);
          workRequest.actualCost =
            billingSummary.calculatedActualCost ||
            billingSummary.storedActualCost ||
            billingSummary.estimatedCost;
          await workRequest.save();
        }
      }

      await workRequest.populate('customer', 'name phone email');
      await workRequest.populate('assignedVehicle', 'vehicleNumber type hourlyRate status lastOdometer');
      await workRequest.populate('assignedDriver', 'name phone email');

      res.json({
        success: true,
        message: 'Work status updated successfully',
        data: workRequest
      });
    } catch (error) {
      logger.error('Work status update error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updatePaymentStatus(req, res) {
    try {
      const { paymentStatus } = req.body;
      const workRequest = await WorkRequest.findById(req.params.id);

      if (!workRequest) {
        return res.status(404).json({
          success: false,
          message: 'Work request not found'
        });
      }

      workRequest.paymentStatus = paymentStatus;
      await workRequest.save();

      await workRequest.populate('customer', 'name phone email');
      await workRequest.populate('assignedVehicle', 'vehicleNumber type hourlyRate status lastOdometer');
      await workRequest.populate('assignedDriver', 'name phone email');

      res.json({
        success: true,
        message: 'Payment status updated successfully',
        data: workRequest
      });
    } catch (error) {
      logger.error('Payment status update error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getWorkRequestsByCustomer(req, res) {
    try {
      const customerId = req.user.role === 'USER'
        ? req.user.id
        : (req.query.customerId || req.params.customerId);

      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: 'customerId is required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid customerId'
        });
      }

      const workRequests = await WorkRequest.find({ customer: customerId })
        .populate('assignedVehicle', 'vehicleNumber type hourlyRate status lastOdometer')
        .populate('assignedDriver', 'name phone email')
        .sort({ createdAt: -1 });

      const workRequestIds = workRequests.map((wr) => wr._id);
      const assignments = workRequestIds.length
        ? await WorkAssignment.find({ workRequest: { $in: workRequestIds } })
          .select('workRequest status startTime endTime actualDuration updatedAt completedAt vehicle')
          .populate('vehicle', 'hourlyRate type')
        : [];

      const latestAssignmentByRequest = new Map();
      assignments.forEach((assignment) => {
        const key = String(assignment.workRequest);
        const existing = latestAssignmentByRequest.get(key);
        if (!existing || new Date(assignment.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
          latestAssignmentByRequest.set(key, assignment);
        }
      });

      const workRequestsWithBilling = workRequests.map((wr) => {
        const assignment = latestAssignmentByRequest.get(String(wr._id));
        return attachBillingSummary(wr, assignment);
      });

      res.json({
        success: true,
        data: workRequestsWithBilling
      });
    } catch (error) {
      logger.error('Customer work requests fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch work requests'
      });
    }
  }

  async getDailyReport(req, res) {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date) : new Date();
      if (Number.isNaN(targetDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }
      const startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);

      const workRequests = await WorkRequest.find({
        createdAt: { $gte: startDate, $lte: endDate }
      }).populate('customer', 'name phone');

      const completedWork = await WorkRequest.find({
        status: 'COMPLETED',
        completedAt: { $gte: startDate, $lte: endDate }
      }).populate('assignedVehicle', 'vehicleNumber type');

      const totalRevenue = completedWork.reduce((sum, wr) => sum + (wr.actualCost || 0), 0);
      const totalVehicles = new Set(
        completedWork
          .map(wr => wr.assignedVehicle?._id?.toString())
          .filter(Boolean)
      ).size;

      res.json({
        success: true,
        data: {
          date: targetDate.toISOString().split('T')[0],
          totalWorkRequests: workRequests.length,
          completedWork: completedWork.length,
          totalRevenue,
          totalVehicles,
          workRequests,
          completedWork
        }
      });
    } catch (error) {
      logger.error('Daily report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate daily report'
      });
    }
  }

  async getMonthlyReport(req, res) {
    try {
      const { year, month } = req.query;
      const numericYear = Number(year);
      const numericMonth = Number(month);

      if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
        return res.status(400).json({
          success: false,
          message: 'Invalid year or month'
        });
      }

      const startDate = new Date(numericYear, numericMonth - 1, 1);
      const endDate = new Date(numericYear, numericMonth, 0, 23, 59, 59, 999);

      const workRequests = await WorkRequest.find({
        createdAt: { $gte: startDate, $lte: endDate }
      }).populate('customer', 'name phone');

      const completedWork = await WorkRequest.find({
        status: 'COMPLETED',
        completedAt: { $gte: startDate, $lte: endDate }
      }).populate('assignedVehicle', 'vehicleNumber type');

      const totalRevenue = completedWork.reduce((sum, wr) => sum + (wr.actualCost || 0), 0);
      const totalVehicles = new Set(
        completedWork
          .map(wr => wr.assignedVehicle?._id?.toString())
          .filter(Boolean)
      ).size;
      
      const revenueByDay = {};
      completedWork.forEach(wr => {
        const day = wr.completedAt.toISOString().split('T')[0];
        revenueByDay[day] = (revenueByDay[day] || 0) + (wr.actualCost || 0);
      });

      res.json({
        success: true,
        data: {
          year: numericYear,
          month: numericMonth,
          totalWorkRequests: workRequests.length,
          completedWork: completedWork.length,
          totalRevenue,
          totalVehicles,
          revenueByDay,
          workRequests,
          completedWork
        }
      });
    } catch (error) {
      logger.error('Monthly report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate monthly report'
      });
    }
  }
}

module.exports = new WorkRequestController();