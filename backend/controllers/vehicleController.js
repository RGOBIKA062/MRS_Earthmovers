const Vehicle = require('../models/Vehicle');
const winston = require('winston');
const { releaseVehicleIfNoActiveAssignments } = require('../services/vehicleAvailabilityService');
const {
  checkVehicleAvailability,
  getVehicleAvailabilityCalendar,
  getAvailableVehiclesForDateRange,
  suggestAlternativeDates
} = require('../services/vehicleBookingService');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class VehicleController {
  async createVehicle(req, res) {
    try {
      const vehicle = new Vehicle(req.body);
      await vehicle.save();
      
      await vehicle.populate('driver', 'name phone email');
      
      res.status(201).json({
        success: true,
        message: 'Vehicle created successfully',
        data: vehicle
      });
    } catch (error) {
      logger.error('Vehicle creation error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getVehicles(req, res) {
    try {
      const { page = 1, limit = 10, status, type, search } = req.query;
      const skip = (page - 1) * limit;
      
      const filter = {};
      if (status) filter.status = status;
      if (type) filter.type = type;
      if (search) {
        filter.$or = [
          { vehicleNumber: { $regex: search, $options: 'i' } }
        ];
      }

      const vehicles = await Vehicle.find(filter)
        .populate('driver', 'name phone email')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const total = await Vehicle.countDocuments(filter);

      res.json({
        success: true,
        data: vehicles,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Vehicles fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vehicles'
      });
    }
  }

  async getVehicle(req, res) {
    try {
      const vehicle = await Vehicle.findById(req.params.id).populate('driver', 'name phone email');
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }

      res.json({
        success: true,
        data: vehicle
      });
    } catch (error) {
      logger.error('Vehicle fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vehicle'
      });
    }
  }

  async updateVehicle(req, res) {
    try {
      const vehicle = await Vehicle.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      ).populate('driver', 'name phone email');

      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }

      res.json({
        success: true,
        message: 'Vehicle updated successfully',
        data: vehicle
      });
    } catch (error) {
      logger.error('Vehicle update error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteVehicle(req, res) {
    try {
      const vehicle = await Vehicle.findById(req.params.id);
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }

      vehicle.isActive = false;
      await vehicle.save();

      res.json({
        success: true,
        message: 'Vehicle deleted successfully'
      });
    } catch (error) {
      logger.error('Vehicle deletion error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete vehicle'
      });
    }
  }

  async getAvailableVehicles(req, res) {
    try {
      // Self-heal stale statuses so completed/cancelled work frees vehicles for customer list.
      const assignedVehicles = await Vehicle.find({
        status: 'ASSIGNED',
        isActive: true
      }).select('_id');

      if (assignedVehicles.length) {
        await Promise.all(
          assignedVehicles.map((vehicle) => releaseVehicleIfNoActiveAssignments(vehicle._id))
        );
      }

      const vehicles = await Vehicle.find({ 
        status: 'AVAILABLE',
        isActive: true 
      }).select('vehicleNumber type hourlyRate');

      const countsByType = vehicles.reduce((acc, vehicle) => {
        const key = vehicle.type;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      res.json({
        success: true,
        data: vehicles,
        meta: {
          totalAvailable: vehicles.length,
          countsByType
        }
      });
    } catch (error) {
      logger.error('Available vehicles fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch available vehicles'
      });
    }
  }

  async getEmergencyVehicles(req, res) {
    try {
      const vehicles = await Vehicle.find({ 
        status: { $in: ['BREAKDOWN', 'EMERGENCY'] },
        isActive: true 
      }).populate('driver', 'name phone');

      res.json({
        success: true,
        data: vehicles
      });
    } catch (error) {
      logger.error('Emergency vehicles fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch emergency vehicles'
      });
    }
  }

  async updateVehicleLocation(req, res) {
    try {
      const { latitude, longitude, address } = req.body;
      const vehicle = await Vehicle.findByIdAndUpdate(
        req.params.id,
        {
          location: { latitude, longitude, address },
          lastOdometer: req.body.odometer || 0
        },
        { new: true }
      );

      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }

      res.json({
        success: true,
        message: 'Vehicle location updated',
        data: vehicle
      });
    } catch (error) {
      logger.error('Vehicle location update error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check availability for a specific vehicle and date range
   * POST /api/vehicles/check-availability
   * Body: { vehicleId, startDate, endDate }
   */
  async checkAvailability(req, res) {
    try {
      const { vehicleId, startDate, endDate } = req.body;

      if (!vehicleId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'vehicleId, startDate, and endDate are required',
          received: { vehicleId, startDate, endDate }
        });
      }

      // Validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      logger.info('Checking vehicle availability', { vehicleId, startDate, endDate });

      const result = await checkVehicleAvailability(vehicleId, startDate, endDate);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Check availability error:', {
        error: error.message,
        stack: error.stack,
        body: req.body
      });
      res.status(500).json({
        success: false,
        message: 'Failed to check vehicle availability',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get availability calendar for all vehicles or specific type
   * GET /api/vehicles/availability-calendar
   * Query params: startDate, endDate, vehicleType (optional)
   */
  async getAvailabilityCalendar(req, res) {
    try {
      const { startDate, endDate, vehicleType } = req.query;

      // Validate required parameters
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'startDate and endDate are required',
          received: { startDate, endDate, vehicleType }
        });
      }

      // Validate date format
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid startDate format. Expected ISO 8601 date string.'
        });
      }

      if (isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid endDate format. Expected ISO 8601 date string.'
        });
      }

      if (end <= start) {
        return res.status(400).json({
          success: false,
          message: 'endDate must be after startDate'
        });
      }

      logger.info('Fetching availability calendar', { startDate, endDate, vehicleType });

      const calendar = await getVehicleAvailabilityCalendar({
        startDate,
        endDate,
        vehicleType
      });

      res.json({
        success: true,
        data: calendar,
        meta: {
          totalVehicles: calendar.length,
          availableVehicles: calendar.filter(v => v.isCurrentlyAvailable).length,
          bookedVehicles: calendar.filter(v => !v.isCurrentlyAvailable).length,
          dateRange: { startDate, endDate },
          vehicleType: vehicleType || 'all'
        }
      });
    } catch (error) {
      logger.error('Get availability calendar error:', {
        error: error.message,
        stack: error.stack,
        query: req.query
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get availability calendar',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get available vehicles for a specific date range
   * GET /api/vehicles/available-for-dates
   * Query params: startDate, endDate, vehicleType (optional)
   */
  async getAvailableForDates(req, res) {
    try {
      const { startDate, endDate, vehicleType } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'startDate and endDate are required',
          received: { startDate, endDate, vehicleType }
        });
      }

      // Validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      logger.info('Getting available vehicles for dates', { startDate, endDate, vehicleType });

      const result = await getAvailableVehiclesForDateRange(
        startDate,
        endDate,
        vehicleType
      );

      res.json({
        success: true,
        data: result.available, // Keep same format for backward compatibility
        unavailableVehicles: result.unavailable, // Add detailed conflict info
        meta: {
          totalVehicles: result.totalVehicles,
          totalAvailable: result.availableCount,
          totalUnavailable: result.unavailableCount,
          dateRange: { startDate, endDate },
          vehicleType: vehicleType || 'all'
        }
      });
    } catch (error) {
      logger.error('Get available vehicles for dates error:', {
        error: error.message,
        stack: error.stack,
        query: req.query
      });
      res.status(500).json({
        success: false,
        message: 'Failed to get available vehicles for date range',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Suggest alternative dates if vehicle is not available
   * POST /api/vehicles/suggest-dates
   * Body: { vehicleId, requestedStartDate, durationHours }
   */
  async suggestDates(req, res) {
    try {
      const { vehicleId, requestedStartDate, durationHours } = req.body;

      if (!vehicleId || !requestedStartDate || !durationHours) {
        return res.status(400).json({
          success: false,
          message: 'vehicleId, requestedStartDate, and durationHours are required',
          received: { vehicleId, requestedStartDate, durationHours }
        });
      }

      // Validate date and duration
      const requestedDate = new Date(requestedStartDate);
      if (isNaN(requestedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid requestedStartDate format'
        });
      }

      const duration = Number(durationHours);
      if (isNaN(duration) || duration <= 0) {
        return res.status(400).json({
          success: false,
          message: 'durationHours must be a positive number'
        });
      }

      logger.info('Suggesting alternative dates', { vehicleId, requestedStartDate, durationHours });

      const suggestions = await suggestAlternativeDates(
        vehicleId,
        requestedStartDate,
        durationHours
      );

      res.json({
        success: true,
        data: suggestions,
        meta: {
          totalSuggestions: suggestions.length,
          requestedDate: requestedStartDate,
          durationHours
        }
      });
    } catch (error) {
      logger.error('Suggest dates error:', {
        error: error.message,
        stack: error.stack,
        body: req.body
      });
      res.status(500).json({
        success: false,
        message: 'Failed to suggest alternative dates',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new VehicleController();