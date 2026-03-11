const Vehicle = require('../models/Vehicle');
const WorkRequest = require('../models/WorkRequest');
const WorkAssignment = require('../models/WorkAssignment');

const NON_OPERATIONAL_STATUSES = new Set(['MAINTENANCE', 'BREAKDOWN', 'EMERGENCY']);

/**
 * Check if a vehicle is available for a specific date range
 * @param {string} vehicleId - Vehicle ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<{available: boolean, conflictingBookings: Array}>}
 */
const checkVehicleAvailability = async (vehicleId, startDate, endDate) => {
  try {
    // Validate inputs
    if (!vehicleId) {
      throw new Error('vehicleId is required');
    }
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format');
    }

    if (end <= start) {
      throw new Error('endDate must be after startDate');
    }

    // Check for overlapping work requests
    const conflictingRequests = await WorkRequest.find({
      assignedVehicle: vehicleId,
      status: { $in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
      $or: [
        // Request starts during the queried period
        { startDate: { $gte: start, $lt: end } },
        // Request ends during the queried period
        { endDate: { $gt: start, $lte: end } },
        // Request completely encompasses the queried period
        { startDate: { $lte: start }, endDate: { $gte: end } }
      ]
    })
    .populate('customer', 'name phone')
    .populate('assignedVehicle', 'vehicleNumber type')
    .lean();

    // Check for overlapping work assignments
    const conflictingAssignments = await WorkAssignment.find({
      vehicle: vehicleId,
      status: { $in: ['ASSIGNED', 'STARTED', 'REACHED_SITE', 'IN_PROGRESS'] },
      $or: [
        { startTime: { $gte: start, $lt: end } },
        { endTime: { $gt: start, $lte: end } },
        { startTime: { $lte: start }, endTime: { $gte: end } }
      ]
    })
    .populate('workRequest')
    .lean();

    // Create a Set of work request IDs to avoid duplicates
    const workRequestIds = new Set(
      (conflictingRequests || []).map(req => req._id.toString())
    );

    // Combine bookings with deduplication
    const conflictingBookings = [
      ...(conflictingRequests || []).map(req => ({
        type: 'work_request',
        id: req._id,
        startDate: req.startDate,
        endDate: req.endDate,
        workType: req.workType || 'Unknown',
        customer: req.customer?.name || 'Unknown',
        status: req.status
      })),
      // Only include assignments that don't have a matching work request
      ...(conflictingAssignments || [])
        .filter(assign => {
          const workRequestId = assign.workRequest?._id?.toString();
          return !workRequestId || !workRequestIds.has(workRequestId);
        })
        .map(assign => ({
          type: 'work_assignment',
          id: assign._id,
          startDate: assign.startTime,
          endDate: assign.endTime,
          workType: assign.workRequest?.workType || 'Unknown',
          status: assign.status
        }))
    ];

    return {
      available: conflictingBookings.length === 0,
      conflictingBookings,
      checkedPeriod: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      }
    };
  } catch (error) {
    console.error('Error checking vehicle availability:', error);
    throw error;
  }
};

/**
 * Get availability calendar for all vehicles or specific vehicle type
 * @param {Object} options - Query options
 * @param {Date} options.startDate - Start date for calendar
 * @param {Date} options.endDate - End date for calendar
 * @param {string} options.vehicleType - Optional vehicle type filter
 * @returns {Promise<Array>} Array of vehicles with their availability
 */
const getVehicleAvailabilityCalendar = async ({ startDate, endDate, vehicleType }) => {
  try {
    // Validate and parse dates
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format');
    }

    if (end <= start) {
      throw new Error('endDate must be after startDate');
    }

    // Build vehicle query
    const vehicleQuery = { isActive: true };
    if (vehicleType) {
      vehicleQuery.type = vehicleType;
    }

    // Get all active vehicles
    const vehicles = await Vehicle.find(vehicleQuery)
      .select('vehicleNumber type hourlyRate status')
      .lean();

    // If no vehicles found, return empty array
    if (!vehicles || vehicles.length === 0) {
      return [];
    }

    // For each vehicle, check availability and get bookings
    const vehicleAvailability = await Promise.all(
      vehicles.map(async (vehicle) => {
        try {
          // Get all bookings for this vehicle in the date range
          const workRequests = await WorkRequest.find({
            assignedVehicle: vehicle._id,
            status: { $in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
            $or: [
              { startDate: { $gte: start, $lt: end } },
              { endDate: { $gt: start, $lte: end } },
              { startDate: { $lte: start }, endDate: { $gte: end } }
            ]
          })
          .select('startDate endDate workType status customer')
          .populate('customer', 'name')
          .lean();

          const workAssignments = await WorkAssignment.find({
            vehicle: vehicle._id,
            status: { $in: ['ASSIGNED', 'STARTED', 'REACHED_SITE', 'IN_PROGRESS'] },
            $or: [
              { startTime: { $gte: start, $lt: end } },
              { endTime: { $gt: start, $lte: end } },
              { startTime: { $lte: start }, endTime: { $gte: end } }
            ]
          })
          .select('startTime endTime status workRequest')
          .populate('workRequest', 'workType')
          .lean();

          // Create a Set of work request IDs that are already in workRequests
          const workRequestIds = new Set(
            (workRequests || []).map(req => req._id.toString())
          );

          // Combine all bookings with null checks and deduplication
          const bookings = [
            // Include all work requests
            ...(workRequests || []).map(req => ({
              type: 'work_request',
              id: req._id,
              startDate: req.startDate,
              endDate: req.endDate,
              workType: req.workType || 'Unknown',
              status: req.status || 'PENDING',
              customerName: req.customer?.name || null
            })),
            // Only include work assignments that don't have a matching work request
            // (to avoid duplicates when a request is assigned)
            ...(workAssignments || [])
              .filter(assign => {
                // If this assignment references a work request we already included, skip it
                const workRequestId = assign.workRequest?._id?.toString();
                return !workRequestId || !workRequestIds.has(workRequestId);
              })
              .map(assign => ({
                type: 'work_assignment',
                id: assign._id,
                startDate: assign.startTime,
                endDate: assign.endTime,
                workType: assign.workRequest?.workType || 'Unknown',
                status: assign.status || 'ASSIGNED'
              }))
          ];

          // Sort bookings by start date with error handling
          bookings.sort((a, b) => {
            const dateA = new Date(a.startDate);
            const dateB = new Date(b.startDate);
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;
            return dateA - dateB;
          });

          // Check if vehicle is available RIGHT NOW (not in the selected date range)
          const now = new Date();
          const hasCurrentBooking = bookings.some(booking => {
            const bookingStart = new Date(booking.startDate);
            const bookingEnd = new Date(booking.endDate);
            // Check if current time falls within any booking
            return now >= bookingStart && now <= bookingEnd;
          });

          // Calculate next available date - when will the vehicle be free?
          let nextAvailableDate = new Date();
          if (bookings.length > 0) {
            // Get all bookings (current and future) sorted by end date
            const allBookingsSortedByEnd = bookings
              .map(b => ({
                startDate: new Date(b.startDate),
                endDate: new Date(b.endDate)
              }))
              .filter(b => !isNaN(b.endDate.getTime()))
              .sort((a, b) => b.endDate - a.endDate); // Sort descending to get latest end date first
            
            if (allBookingsSortedByEnd.length > 0) {
              // Next available is after the LATEST booking ends
              const latestEndDate = allBookingsSortedByEnd[0].endDate;
              
              // If latest booking ends in the future, that's when vehicle is next available
              if (latestEndDate > now) {
                nextAvailableDate = latestEndDate;
              }
              // If all bookings already ended, vehicle is available now
            }
          }

          return {
            vehicleId: vehicle._id,
            vehicleNumber: vehicle.vehicleNumber || 'Unknown',
            type: vehicle.type || 'Unknown',
            hourlyRate: vehicle.hourlyRate || 0,
            currentStatus: vehicle.status || 'UNKNOWN',
            bookings,
            totalBookings: bookings.length,
            nextAvailableDate: nextAvailableDate.toISOString(),
            // Vehicle is available if: no current bookings AND status is AVAILABLE
            isCurrentlyAvailable: !hasCurrentBooking && vehicle.status === 'AVAILABLE'
          };
        } catch (vehicleError) {
          // Log error but don't fail the entire operation
          console.error(`Error processing vehicle ${vehicle._id}:`, vehicleError);
          return {
            vehicleId: vehicle._id,
            vehicleNumber: vehicle.vehicleNumber || 'Unknown',
            type: vehicle.type || 'Unknown',
            hourlyRate: vehicle.hourlyRate || 0,
            currentStatus: vehicle.status || 'UNKNOWN',
            bookings: [],
            totalBookings: 0,
            nextAvailableDate: new Date().toISOString(),
            isCurrentlyAvailable: vehicle.status === 'AVAILABLE',
            error: 'Failed to fetch bookings'
          };
        }
      })
    );

    return vehicleAvailability;
  } catch (error) {
    console.error('Error getting vehicle availability calendar:', error);
    throw error;
  }
};

/**
 * Get available vehicles for a specific date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} vehicleType - Optional vehicle type filter
 * @returns {Promise<Array>} Array of available vehicles
 */
const getAvailableVehiclesForDateRange = async (startDate, endDate, vehicleType = null) => {
  try {
    const calendar = await getVehicleAvailabilityCalendar({
      startDate,
      endDate,
      vehicleType
    });

    // Separate by availability for the REQUESTED RANGE.
    // IMPORTANT: Do not block by global ASSIGNED status alone because a future booking
    // should not make earlier non-overlapping slots unavailable.
    const availableVehicles = calendar.filter(vehicle => {
      const hasConflictsInRequestedRange = vehicle.bookings.length > 0;
      const isNonOperational = NON_OPERATIONAL_STATUSES.has(vehicle.currentStatus);
      return !hasConflictsInRequestedRange && !isNonOperational;
    });

    const unavailableVehicles = calendar.filter(vehicle => {
      const hasConflictsInRequestedRange = vehicle.bookings.length > 0;
      const isNonOperational = NON_OPERATIONAL_STATUSES.has(vehicle.currentStatus);
      return hasConflictsInRequestedRange || isNonOperational;
    });

    // Return detailed information including conflicts
    return {
      available: availableVehicles,
      unavailable: unavailableVehicles,
      totalVehicles: calendar.length,
      availableCount: availableVehicles.length,
      unavailableCount: unavailableVehicles.length
    };
  } catch (error) {
    console.error('Error getting available vehicles for date range:', error);
    throw error;
  }
};

/**
 * Suggest alternative dates if vehicle is not available
 * @param {string} vehicleId - Vehicle ID
 * @param {Date} requestedStartDate - Requested start date
 * @param {number} durationHours - Duration in hours
 * @returns {Promise<Array>} Array of suggested dates
 */
const suggestAlternativeDates = async (vehicleId, requestedStartDate, durationHours) => {
  try {
    // Validate inputs
    if (!vehicleId) {
      throw new Error('vehicleId is required');
    }
    if (!requestedStartDate) {
      throw new Error('requestedStartDate is required');
    }
    if (!durationHours || durationHours <= 0) {
      throw new Error('durationHours must be a positive number');
    }

    const start = new Date(requestedStartDate);
    if (isNaN(start.getTime())) {
      throw new Error('Invalid requestedStartDate format');
    }

    const durationMs = Number(durationHours) * 60 * 60 * 1000;
    
    // Look ahead 30 days
    const lookAheadEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Get all bookings for the next 30 days
    const workRequests = await WorkRequest.find({
      assignedVehicle: vehicleId,
      status: { $in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
      startDate: { $gte: start, $lte: lookAheadEnd }
    })
    .select('startDate endDate')
    .sort({ startDate: 1 })
    .lean();

    const workAssignments = await WorkAssignment.find({
      vehicle: vehicleId,
      status: { $in: ['ASSIGNED', 'STARTED', 'REACHED_SITE', 'IN_PROGRESS'] },
      startTime: { $gte: start, $lte: lookAheadEnd }
    })
    .select('startTime endTime workRequest')
    .populate('workRequest', '_id')
    .sort({ startTime: 1 })
    .lean();

    // Create a Set of work request IDs to avoid duplicates
    const workRequestIds = new Set(
      (workRequests || []).map(req => req._id.toString())
    );

    // Combine and sort all bookings with deduplication
    const allBookings = [
      ...(workRequests || []).map(req => ({ 
        start: req.startDate, 
        end: req.endDate 
      })).filter(b => b.start && b.end),
      // Only include assignments that don't have a matching work request
      ...(workAssignments || [])
        .filter(assign => {
          const workRequestId = assign.workRequest?._id?.toString();
          return !workRequestId || !workRequestIds.has(workRequestId);
        })
        .map(assign => ({ 
          start: assign.startTime, 
          end: assign.endTime 
        }))
        .filter(b => b.start && b.end)
    ].sort((a, b) => new Date(a.start) - new Date(b.start));

    // Find gaps between bookings
    const suggestions = [];
    let currentSearchStart = new Date(start);

    for (const booking of allBookings) {
      const bookingStart = new Date(booking.start);
      const bookingEnd = new Date(booking.end);

      // Check if there's a gap before this booking
      const gap = bookingStart - currentSearchStart;
      if (gap >= durationMs) {
        suggestions.push({
          startDate: new Date(currentSearchStart),
          endDate: new Date(currentSearchStart.getTime() + durationMs),
          available: true,
          durationHours: Number(durationHours)
        });
        
        // Limit to 5 suggestions
        if (suggestions.length >= 5) break;
      }

      // Move search start to after this booking
      currentSearchStart = bookingEnd > currentSearchStart ? new Date(bookingEnd) : currentSearchStart;
    }

    // Check if there's availability after all bookings
    if (suggestions.length < 5 && currentSearchStart < lookAheadEnd) {
      suggestions.push({
        startDate: new Date(currentSearchStart),
        endDate: new Date(currentSearchStart.getTime() + durationMs),
        available: true,
        durationHours: Number(durationHours)
      });
    }

    return suggestions;
  } catch (error) {
    console.error('Error suggesting alternative dates:', error);
    throw error;
  }
};

module.exports = {
  checkVehicleAvailability,
  getVehicleAvailabilityCalendar,
  getAvailableVehiclesForDateRange,
  suggestAlternativeDates
};

