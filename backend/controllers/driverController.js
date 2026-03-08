const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const WorkAssignment = require('../models/WorkAssignment');
const Complaint = require('../models/Complaint');
const PhotoProof = require('../models/PhotoProof');
const mongoose = require('mongoose');
const winston = require('winston');
const {
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

class DriverController {
  static DAILY_DRIVER_SALARY = 1000;

  static getAssignmentDurationHours(assignment) {
    const explicitDuration = Number(assignment?.actualDuration);
    if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
      return explicitDuration;
    }

    const start = assignment?.startTime ? new Date(assignment.startTime).getTime() : NaN;

    const endCandidates = [assignment?.endTime, assignment?.completedAt]
      .map((value) => (value ? new Date(value).getTime() : NaN))
      .filter((value) => !Number.isNaN(value));

    const end = endCandidates.length > 0 ? Math.max(...endCandidates) : NaN;
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      return (end - start) / (1000 * 60 * 60);
    }

    return 0;
  }

  async getDrivers(req, res) {
    try {
      const { search, page = 1, limit = 50 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const filter = { role: 'DRIVER' };
      if (search) {
        filter.$or = [
          { name: { $regex: String(search), $options: 'i' } },
          { phone: { $regex: String(search), $options: 'i' } },
          { email: { $regex: String(search), $options: 'i' } }
        ];
      }

      const [drivers, total] = await Promise.all([
        User.find(filter)
          .select('name phone email role isActive createdAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        User.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: drivers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Drivers fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch drivers'
      });
    }
  }

  async getDriverWorkList(req, res) {
    try {
      const driverId = req.params.driverId || req.user.id;
      const { status, date } = req.query;

      if (!mongoose.isValidObjectId(driverId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid driver id'
        });
      }

      const filter = { driver: driverId };
      if (status) filter.status = status;
      if (date) {
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid date'
          });
        }

        const dayStart = new Date(parsed);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        filter.startTime = { $gte: dayStart, $lt: dayEnd };
      }

      const workAssignments = await WorkAssignment.find(filter)
        .populate({
          path: 'workRequest',
          select: 'workType description location expectedDuration status photos startDate endDate',
          populate: { path: 'photos', select: 'type title imageUrl timestamp uploadedBy geolocation notes' },
        })
        .populate('vehicle', 'vehicleNumber type')
        .sort({ startTime: -1 });

      res.json({
        success: true,
        data: workAssignments
      });
    } catch (error) {
      logger.error('Driver work list fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch driver work list'
      });
    }
  }

  async updateWorkStatus(req, res) {
    try {
      const { status, location, notes, odometerReading } = req.body;
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid work assignment id'
        });
      }

      const allowedTransitions = {
        ASSIGNED: ['STARTED', 'CANCELLED'],
        STARTED: ['REACHED_SITE', 'CANCELLED'],
        REACHED_SITE: ['IN_PROGRESS', 'CANCELLED'],
        IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
        COMPLETED: [],
        CANCELLED: []
      };

      const assignment = await WorkAssignment.findById(req.params.id)
        .populate('workRequest')
        .populate('vehicle');

      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'Work assignment not found'
        });
      }

      if (assignment.driver.toString() !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const currentStatus = assignment.status;
      if (!allowedTransitions[currentStatus]?.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${currentStatus} to ${status}`
        });
      }

      if (status === 'STARTED' && req.user.role !== 'ADMIN') {
        const scheduledStart = assignment.workRequest?.startDate || assignment.startTime;
        if (scheduledStart) {
          const scheduledDay = new Date(scheduledStart).toISOString().slice(0, 10);
          const today = new Date().toISOString().slice(0, 10);
          if (scheduledDay !== today) {
            return res.status(400).json({
              success: false,
              message: `Work can only be started on assigned date (${scheduledDay}).`
            });
          }
        }
      }

      if (status === 'IN_PROGRESS') {
        const beforePhoto = await PhotoProof.findOne({
          workAssignment: assignment._id,
          type: 'BEFORE'
        }).select('_id');

        if (!beforePhoto) {
          return res.status(400).json({
            success: false,
            message: 'Capture a geotagged BEFORE photo before starting work progress.'
          });
        }
      }

      let assignmentSavedEarly = false;

      if (status === 'COMPLETED') {
        const afterPhoto = await PhotoProof.findOne({
          workAssignment: assignment._id,
          type: 'AFTER'
        }).select('_id');

        if (!afterPhoto) {
          return res.status(400).json({
            success: false,
            message: 'Capture a geotagged AFTER photo before completing work.'
          });
        }
      }

      assignment.status = status;

      if (status === 'STARTED') {
        assignment.startTime = new Date();
      }

      if (location) {
        assignment.location = {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address
        };
      }

      if (notes) assignment.notes = notes;
      if (odometerReading) assignment.odometerReading = odometerReading;

      // Keep vehicle state consistent with assignment state
      if (assignment.vehicle && !['COMPLETED', 'CANCELLED'].includes(status)) {
        assignment.vehicle.lastOdometer = odometerReading || assignment.vehicle.lastOdometer;
        assignment.vehicle.status = 'ASSIGNED';
        await assignment.vehicle.save();
      }

      // Propagate driver status to customer work request status
      if (assignment.workRequest) {
        if (!assignment.workRequest.customerMobile) {
          const customer = await User.findById(assignment.workRequest.customer).select('phone');
          if (customer?.phone) {
            assignment.workRequest.customerMobile = customer.phone;
          }
        }

        if (status === 'STARTED' || status === 'REACHED_SITE' || status === 'IN_PROGRESS') {
          assignment.workRequest.status = 'IN_PROGRESS';
        } else if (status === 'CANCELLED') {
          assignment.workRequest.status = 'CANCELLED';
        }

        if (status === 'STARTED') {
          try {
            const customer = await User.findById(assignment.workRequest.customer);
            const mobile = assignment.workRequest.customerMobile || customer?.phone;
            const driver = await User.findById(assignment.driver);
            const vehicle = assignment.vehicle;
            const siteName = assignment.workRequest.location?.address || 'Site';
            const now = new Date();
            const message = `MRS EARTHMOVERS started work\nDriver: ${driver?.name || 'Driver'}\nVehicle: ${vehicle?.vehicleNumber || 'Vehicle'}\nSite: ${siteName}\nTime: ${now.toLocaleString()}`;
            if (mobile) {
              await require('../services/notificationService').sendWhatsAppNotification(mobile, message);
            }
          } catch (err) {
            logger.error('WhatsApp notification error:', err);
          }
        }

        assignment.workRequest.updatedAt = new Date();
      }

      if (status === 'COMPLETED') {
        if (!assignment.startTime) {
          return res.status(400).json({
            success: false,
            message: 'Work cannot be completed before it is started.'
          });
        }

        assignment.endTime = new Date();
        const durationHours = Math.max(0, (assignment.endTime - assignment.startTime) / (1000 * 60 * 60));
        assignment.actualDuration = parseFloat(durationHours.toFixed(2));
        assignment.completedAt = new Date();

        if (assignment.vehicle) {
          // Persist status transition before release check so this assignment is not counted as active.
          await assignment.save();
          assignmentSavedEarly = true;

          assignment.vehicle.lastOdometer = odometerReading || assignment.vehicle.lastOdometer;
          await assignment.vehicle.save();
          await releaseVehicleIfNoActiveAssignments(assignment.vehicle._id);
        }

        if (assignment.workRequest) {
          assignment.workRequest.status = 'COMPLETED';
          assignment.workRequest.completedAt = new Date();
          const hourlyRate = Number(assignment.vehicle?.hourlyRate || 0);
          const calculatedActualCost = hourlyRate > 0
            ? parseFloat((assignment.actualDuration * hourlyRate).toFixed(2))
            : 0;
          assignment.workRequest.actualCost = calculatedActualCost || assignment.workRequest.actualCost || assignment.workRequest.estimatedCost || 0;
          assignment.workRequest.updatedAt = new Date();
        }

        // Update attendance record with checkout time for revenue calculation
        try {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          const Attendance = require('../models/Attendance');
          const attendance = await Attendance.findOne({
            driver: assignment.driver,
            date: { $gte: today, $lt: tomorrow }
          });

          if (attendance) {
            // Use the actual work duration from assignment for consistency
            // This ensures driver dashboard and admin reports show the same hours
            if (!attendance.checkOut) {
              attendance.checkOut = assignment.endTime;
            }
            
            // Accumulate work hours from multiple assignments in a day
            const currentWorkHours = parseFloat(attendance.workHours || 0);
            const newWorkHours = parseFloat(assignment.actualDuration || 0);
            attendance.workHours = parseFloat((currentWorkHours + newWorkHours).toFixed(2));
            
            await attendance.save();
          }
        } catch (err) {
          logger.error('Error updating attendance on work completion:', err);
        }
      }

      if (status === 'CANCELLED' && assignment.vehicle) {
        // Persist cancellation before release check so this assignment is not counted as active.
        await assignment.save();
        assignmentSavedEarly = true;
        await releaseVehicleIfNoActiveAssignments(assignment.vehicle._id);
      }

      if (!assignmentSavedEarly) {
        await assignment.save();
      }
      if (assignment.workRequest) {
        await assignment.workRequest.save();
      }

      const populated = await WorkAssignment.findById(assignment._id)
        .populate({
          path: 'workRequest',
          select: 'workType description location expectedDuration status photos startDate endDate',
          populate: { path: 'photos', select: 'type title imageUrl timestamp uploadedBy geolocation notes' },
        })
        .populate('vehicle', 'vehicleNumber type hourlyRate status')
        .populate('driver', 'name phone');

      res.json({
        success: true,
        message: 'Work status updated successfully',
        data: populated
      });
    } catch (error) {
      logger.error('Work status update error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update work status'
      });
    }
  }

  async updateLocation(req, res) {
    try {
      const { id } = req.params;
      const { latitude, longitude, accuracy, address, timestamp } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid assignment id'
        });
      }

      const assignment = await WorkAssignment.findById(id);
      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'Work assignment not found'
        });
      }

      // Add location to trail
      if (!assignment.locationTrail) {
        assignment.locationTrail = [];
      }

      assignment.locationTrail.push({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: parseFloat(accuracy),
        address: address ? String(address) : '',
        timestamp: timestamp ? new Date(timestamp) : new Date()
      });

      assignment.location = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address ? String(address) : ''
      };

      // Keep only last 1000 locations to prevent doc from growing too large
      if (assignment.locationTrail.length > 1000) {
        assignment.locationTrail = assignment.locationTrail.slice(-1000);
      }

      assignment.updatedAt = new Date();
      await assignment.save();

      res.json({
        success: true,
        message: 'Location updated successfully',
        data: assignment
      });
    } catch (error) {
      logger.error('Update location error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getDriverProgress(req, res) {
    try {
      const driverId = req.params.driverId || req.user.id;
      const workAssignments = await WorkAssignment.find({ driver: driverId })
        .populate('workRequest', 'workType description location')
        .populate('vehicle', 'vehicleNumber type')
        .sort({ startTime: -1 });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayAssignments = workAssignments.filter(wa => 
        wa.startTime >= today && wa.startTime < tomorrow
      );

      const progressData = {
        totalAssignments: workAssignments.length,
        todayAssignments: todayAssignments.length,
        completedToday: todayAssignments.filter(wa => wa.status === 'COMPLETED').length,
        inProgressToday: todayAssignments.filter(wa => 
          wa.status === 'IN_PROGRESS' || wa.status === 'STARTED' || wa.status === 'REACHED_SITE'
        ).length,
        pendingToday: todayAssignments.filter(wa => wa.status === 'ASSIGNED').length
      };

      res.json({
        success: true,
        data: {
          progress: progressData,
          workAssignments: todayAssignments
        }
      });
    } catch (error) {
      logger.error('Driver progress fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch driver progress'
      });
    }
  }

  async reportComplaint(req, res) {
    try {
      const { type, description, severity, location } = req.body;
      const driverId = req.params.driverId || req.user.id;

      const complaint = new Complaint({
        vehicle: req.body.vehicleId,
        driver: driverId,
        type,
        description,
        severity,
        location,
        status: 'REPORTED',
        reportedAt: new Date()
      });

      await complaint.save();

      if (severity === 'CRITICAL' || severity === 'HIGH') {
        const vehicle = await Vehicle.findById(req.body.vehicleId);
        if (vehicle) {
          vehicle.status = 'EMERGENCY';
          await vehicle.save();
        }
      }

      await complaint.populate('vehicle', 'vehicleNumber type');
      await complaint.populate('driver', 'name phone');

      res.status(201).json({
        success: true,
        message: 'Complaint reported successfully',
        data: complaint
      });
    } catch (error) {
      logger.error('Complaint reporting error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getDriverVehicles(req, res) {
    try {
      const driverId = req.params.driverId || req.user.id;
      const vehicles = await Vehicle.find({ driver: driverId, isActive: true })
        .populate('driver', 'name phone');

      res.json({
        success: true,
        data: vehicles
      });
    } catch (error) {
      logger.error('Driver vehicles fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch driver vehicles'
      });
    }
  }

  async getLiveLocation(req, res) {
    try {
      const driverId = req.params.driverId || req.user.id;
      const assignments = await WorkAssignment.find({
        driver: driverId,
        status: { $in: ['STARTED', 'REACHED_SITE', 'IN_PROGRESS'] }
      }).populate('vehicle');

      const liveLocations = assignments.map(assignment => ({
        vehicleId: assignment.vehicle._id,
        vehicleNumber: assignment.vehicle.vehicleNumber,
        location: assignment.location,
        status: assignment.status,
        startTime: assignment.startTime
      }));

      res.json({
        success: true,
        data: liveLocations
      });
    } catch (error) {
      logger.error('Live location fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch live locations'
      });
    }
  }

  async getDriverDashboard(req, res) {
    try {
      const driverId = req.params.driverId || req.user.id;
      if (!mongoose.isValidObjectId(driverId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid driver id'
        });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [todayWork, assignments] = await Promise.all([
        WorkAssignment.find({
          driver: driverId,
          startTime: { $gte: today, $lt: tomorrow }
        })
          .populate('vehicle', 'hourlyRate vehicleNumber type')
          .populate('workRequest', 'workType location status'),
        WorkAssignment.find({ driver: driverId })
          .populate('workRequest', 'workType location status')
          .populate('vehicle', 'vehicleNumber type')
          .sort({ startTime: -1 })
          .limit(5)
      ]);

      const activeCount = todayWork.filter(wa => !['COMPLETED', 'CANCELLED'].includes(wa.status)).length;
      const dashboard = {
        todayWork: {
          total: activeCount,
          completed: todayWork.filter(wa => wa.status === 'COMPLETED').length,
          inProgress: todayWork.filter(wa => 
            wa.status === 'STARTED' || wa.status === 'REACHED_SITE' || wa.status === 'IN_PROGRESS'
          ).length,
          pending: todayWork.filter(wa => wa.status === 'ASSIGNED').length
        },
        recentAssignments: assignments,
        totalEarningsToday: 0,
      };

      res.json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      logger.error('Driver dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch driver dashboard'
      });
    }
  }

  async getWorkAssignmentsStats(req, res) {
    try {
      const driverId = req.params.driverId || req.user.id;
      if (!mongoose.isValidObjectId(driverId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid driver id'
        });
      }

      const workAssignments = await WorkAssignment.find({ driver: driverId })
        .populate('workRequest', 'workType status')
        .populate('vehicle', 'hourlyRate vehicleNumber');

      const completedAssignments = workAssignments.filter((assignment) => assignment.status === 'COMPLETED');
      const completedCount = completedAssignments.length;
      const totalCount = workAssignments.length;
      const totalHoursWorked = completedAssignments.reduce(
        (sum, assignment) => sum + DriverController.getAssignmentDurationHours(assignment),
        0
      );

      res.json({
        success: true,
        data: {
          completedCount,
          totalCount,
          totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
          totalEarnings: 0
        }
      });
    } catch (error) {
      logger.error('Work assignments stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch work assignments stats'
      });
    }
  }

  async getDailyStats(req, res) {
    try {
      const driverId = req.params.driverId || req.user.id;
      const { date } = req.query;

      if (!mongoose.isValidObjectId(driverId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid driver id'
        });
      }

      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'Date parameter is required'
        });
      }

      const targetDate = new Date(date);
      if (Number.isNaN(targetDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date parameter'
        });
      }
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const workAssignments = await WorkAssignment.find({
        driver: driverId,
        startTime: { $gte: targetDate, $lt: nextDay }
      }).populate('vehicle', 'hourlyRate');

      const completedAssignments = await WorkAssignment.find({
        driver: driverId,
        status: 'COMPLETED',
        $or: [
          { completedAt: { $gte: targetDate, $lt: nextDay } },
          { endTime: { $gte: targetDate, $lt: nextDay } }
        ]
      });

      const completed = completedAssignments.length;
      const workCount = workAssignments.length;

      const hoursWorked = completedAssignments.reduce(
        (sum, assignment) => sum + DriverController.getAssignmentDurationHours(assignment),
        0
      );

      const earnings = 0;

      res.json({
        success: true,
        data: {
          completed,
          workCount,
          hoursWorked: Math.round(hoursWorked * 100) / 100,
          earnings: Math.round(earnings)
        }
      });
    } catch (error) {
      logger.error('Daily stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch daily stats'
      });
    }
  }
}

module.exports = new DriverController();