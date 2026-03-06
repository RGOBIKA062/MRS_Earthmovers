const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const WorkAssignment = require('../models/WorkAssignment');
const Complaint = require('../models/Complaint');
const mongoose = require('mongoose');
const winston = require('winston');

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
          select: 'workType description location expectedDuration status photos',
          populate: { path: 'photos', select: 'type title imageUrl timestamp uploadedBy geolocation notes' },
        })
        .populate('vehicle', 'vehicleNumber make model type')
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

      assignment.status = status;
      if (status === 'STARTED' && !assignment.startTime) {
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
      if (assignment.vehicle && status !== 'COMPLETED') {
        assignment.vehicle.lastOdometer = odometerReading || assignment.vehicle.lastOdometer;
        assignment.vehicle.status = 'ASSIGNED';
        await assignment.vehicle.save();
      }


      // Propagate driver status to customer work request status
      if (assignment.workRequest && status !== 'COMPLETED') {
        if (status === 'ASSIGNED') {
          assignment.workRequest.status = 'ASSIGNED';
        } else if (['STARTED', 'REACHED_SITE', 'IN_PROGRESS'].includes(status)) {
          assignment.workRequest.status = 'IN_PROGRESS';
          // WhatsApp notification logic
          try {
            // Only send when status is STARTED
            if (status === 'STARTED') {
              const customer = await require('../models/User').findById(assignment.workRequest.customer);
              const mobile = assignment.workRequest.customerMobile || customer.phone;
              const driver = await require('../models/User').findById(assignment.driver);
              const vehicle = assignment.vehicle;
              const siteName = assignment.workRequest.location?.address || 'Site';
              const now = new Date();
              const message = `MRS EARTHMOVERS started work\nDriver: ${driver.name}\nVehicle: ${vehicle.vehicleNumber}\nSite: ${siteName}\nTime: ${now.toLocaleString()}`;
              // Call WhatsApp API (pseudo-code, replace with actual API call)
              await require('../services/notificationService').sendWhatsAppNotification(mobile, message);
            }
          } catch (err) {
            logger.error('WhatsApp notification error:', err);
          }
        } else if (status === 'CANCELLED') {
          assignment.workRequest.status = 'CANCELLED';
        }
        assignment.workRequest.updatedAt = new Date();
        await assignment.workRequest.save();
      }

      if (status === 'COMPLETED') {
        assignment.endTime = new Date();
        const duration = (assignment.endTime - assignment.startTime) / (1000 * 60 * 60);
        assignment.actualDuration = parseFloat(duration.toFixed(2));

        if (assignment.vehicle) {
          assignment.vehicle.lastOdometer = odometerReading || assignment.vehicle.lastOdometer;
          assignment.vehicle.status = 'AVAILABLE';
          await assignment.vehicle.save();
        }

        if (assignment.workRequest) {
          assignment.workRequest.status = 'COMPLETED';
          assignment.workRequest.completedAt = new Date();
          assignment.workRequest.updatedAt = new Date();
          await assignment.workRequest.save();
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

          if (attendance && !attendance.checkOut) {
            attendance.checkOut = assignment.endTime;
            const workHours = (assignment.endTime - attendance.checkIn) / (1000 * 60 * 60);
            attendance.workHours = parseFloat(workHours.toFixed(2));
            await attendance.save();
          }
        } catch (err) {
          logger.error('Error updating attendance on work completion:', err);
          // Don't fail the work completion if attendance update fails
        }
      }

      await assignment.save();

      const populated = await WorkAssignment.findById(assignment._id)
        .populate({
          path: 'workRequest',
          select: 'workType description location expectedDuration status photos',
          populate: { path: 'photos', select: 'type title imageUrl timestamp uploadedBy geolocation notes' },
        })
        .populate('vehicle', 'vehicleNumber make model type hourlyRate status')
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
        message: error.message
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
        .populate('vehicle', 'vehicleNumber make model')
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

      await complaint.populate('vehicle', 'vehicleNumber make model');
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
          .populate('vehicle', 'hourlyRate vehicleNumber make model type')
          .populate('workRequest', 'workType location status'),
        WorkAssignment.find({ driver: driverId })
          .populate('workRequest', 'workType location status')
          .populate('vehicle', 'vehicleNumber make model type')
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

      const completedCount = workAssignments.filter(wa => wa.status === 'COMPLETED').length;
      const totalCount = workAssignments.length;

      res.json({
        success: true,
        data: {
          completedCount,
          totalCount,
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
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const workAssignments = await WorkAssignment.find({
        driver: driverId,
        startTime: { $gte: targetDate, $lt: nextDay }
      }).populate('vehicle', 'hourlyRate');

      const completed = workAssignments.filter(wa => wa.status === 'COMPLETED').length;
      const workCount = workAssignments.length;
      
      const hoursWorked = 0;
      
      const earnings = 0;

      res.json({
        success: true,
        data: {
          completed,
          workCount,
          hoursWorked: Math.round(hoursWorked * 10) / 10,
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