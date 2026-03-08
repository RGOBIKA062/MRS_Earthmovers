const Vehicle = require('../models/Vehicle');
const WorkRequest = require('../models/WorkRequest');
const Attendance = require('../models/Attendance');
const User = require('../models/User');  
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class AdminController {
  async getDashboardSummary(req, res) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Fetch all data in parallel
      const [
        vehicles,
        workRequests,
        completedToday,
        pendingWork,
        activeDrivers,
        attendanceToday,
        allAttendance
      ] = await Promise.all([
        Vehicle.find({ isActive: true }),
        WorkRequest.find(),
        WorkRequest.find({
          status: 'COMPLETED',
          completedAt: { $gte: today, $lt: tomorrow }
        }),
        WorkRequest.find({ status: 'PENDING' }),
        User.find({ role: 'DRIVER', isActive: true }).countDocuments(),
        Attendance.find({
          $or: [
            { date: { $gte: today, $lt: tomorrow } },
            { createdAt: { $gte: today, $lt: tomorrow } }
          ]
        }).populate('driver', 'name phone').populate('vehicle', 'vehicleNumber type hourlyRate status'),
        Attendance.find().populate('vehicle', 'vehicleNumber type hourlyRate status')
      ]);

      // Calculate metrics
      const totalVehicles = vehicles.length;
      const availableVehicles = vehicles.filter(v => v.status === 'AVAILABLE').length;
      const maintenanceVehicles = vehicles.filter(v => v.status === 'MAINTENANCE').length;
      const busyVehicles = vehicles.filter(v => v.status === 'BUSY').length;

      const totalWorkRequests = workRequests.length;
      const completedRequests = workRequests.filter(wr => wr.status === 'COMPLETED').length;
      const inProgressRequests = workRequests.filter(wr => wr.status === 'IN_PROGRESS').length;
      const pendingRequests = pendingWork.length;

      // Calculate total revenue from ALL attendance records (workHours × hourlyRate) - same logic as DriverDashboard
      const totalRevenue = allAttendance.reduce((sum, att) => {
        const hours = att.workHours || 0;
        const rate = att.vehicle?.hourlyRate || 0;
        if (hours > 0 && rate > 0) {
          const revenue = hours * rate;
          return sum + revenue;
        }
        return sum;
      }, 0);

      // Calculate today's revenue from TODAY's attendance records
      const todayRevenue = attendanceToday.reduce((sum, att) => {
        const hours = att.workHours || 0;
        const rate = att.vehicle?.hourlyRate || 0;
        if (hours > 0 && rate > 0) {
          const revenue = hours * rate;
          console.log(`Revenue calculation: ${hours} hrs × ₹${rate}/hr = ₹${revenue}`);
          return sum + revenue;
        }
        return sum;
      }, 0);

      // Fallback: if attendance-based revenue is zero, use completed work actualCost for today.
      const todayRevenueFromCompleted = completedToday.reduce((sum, wr) => sum + (wr.actualCost || 0), 0);
      const effectiveTodayRevenue = todayRevenue > 0 ? todayRevenue : todayRevenueFromCompleted;

      console.log(`Total Today's Revenue: ₹${effectiveTodayRevenue}`);

      const assignedDrivers = new Set(
        workRequests
          .filter(wr => wr.assignedDriver)
          .map(wr => wr.assignedDriver.toString())
      ).size;

      res.json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          vehicles: {
            total: totalVehicles,
            available: availableVehicles,
            busy: busyVehicles,
            maintenance: maintenanceVehicles
          },
          workRequests: {
            total: totalWorkRequests,
            pending: pendingRequests,
            inProgress: inProgressRequests,
            completed: completedRequests
          },
          revenue: {
            total: totalRevenue,
            today: effectiveTodayRevenue
          },
          drivers: {
            total: activeDrivers,
            assigned: assignedDrivers,
            attendance: attendanceToday.length
          },
          topMetrics: [
            { label: 'Total Vehicles', value: totalVehicles, icon: 'local-shipping' },
            { label: 'Available Now', value: availableVehicles, icon: 'check-circle' },
            { label: 'Work Pending', value: pendingRequests, icon: 'assignment' },
            { label: 'Today Revenue', value: `₹${effectiveTodayRevenue.toLocaleString()}`, icon: 'trending-up' }
          ]
        }
      });
    } catch (error) {
      logger.error('Dashboard summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard summary'
      });
    }
  }

  async getDailyMetrics(req, res) {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date) : new Date();
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const [completedWork, attendance, workRequests, allVehicles] = await Promise.all([
        WorkRequest.find({
          status: 'COMPLETED',
          completedAt: { $gte: targetDate, $lt: nextDay }
        }).populate('assignedVehicle', 'vehicleNumber hourlyRate').populate('assignedDriver', 'name'),
        Attendance.find({
          createdAt: { $gte: targetDate, $lt: nextDay }
        }).populate('driver', 'name phone').populate('vehicle', 'vehicleNumber hourlyRate'),
        WorkRequest.find({
          createdAt: { $gte: targetDate, $lt: nextDay }
        }),
        Vehicle.find({ isActive: true })
      ]);

      // Calculate revenue from attendance records (workHours × hourlyRate) - same logic as DriverDashboard
      const totalRevenue = attendance.reduce((sum, att) => {
        const hours = att.workHours || 0;
        const rate = att.vehicle?.hourlyRate || 0;
        if (hours > 0 && rate > 0) {
          return sum + (hours * rate);
        }
        return sum;
      }, 0);

      const totalHours = attendance.reduce((sum, att) => sum + (att.workHours || 0), 0);
      const vehiclesUsed = new Set(completedWork.map(wr => wr.assignedVehicle?._id)).size;
      const activeVehicles = allVehicles.filter(v => v.status !== 'MAINTENANCE').length;

      res.json({
        success: true,
        data: {
          date: targetDate.toISOString().split('T')[0],
          metrics: {
            workCompleted: completedWork.length,
            workCreated: workRequests.length,
            revenue: totalRevenue,
            driversAttended: attendance.length,
            totalHours: totalHours,
            vehiclesUsed: vehiclesUsed,
            totalVehicles: allVehicles.length
          },
          details: {
            completed: completedWork,
            attendance: attendance
          }
        }
      });
    } catch (error) {
      logger.error('Daily metrics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch daily metrics'
      });
    }
  }
}

module.exports = new AdminController();
