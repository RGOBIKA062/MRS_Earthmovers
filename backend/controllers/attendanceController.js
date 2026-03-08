const Attendance = require('../models/Attendance');
const Vehicle = require('../models/Vehicle');
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

class AttendanceController {
  static DAILY_DRIVER_SALARY = 1000;
  static OVERTIME_MULTIPLIER = 1.5;
  static STANDARD_WORK_HOURS = 8;

  static toSafeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  static getEffectiveWorkHours(record) {
    const storedHours = AttendanceController.toSafeNumber(record?.workHours);
    if (storedHours > 0) {
      return storedHours;
    }

    const checkInTime = new Date(record?.checkIn);
    const checkOutTime = new Date(record?.checkOut);
    if (
      Number.isNaN(checkInTime.getTime()) ||
      Number.isNaN(checkOutTime.getTime()) ||
      checkOutTime <= checkInTime
    ) {
      return Math.max(0, storedHours);
    }

    const durationHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);
    return Math.max(0, parseFloat(durationHours.toFixed(2)));
  }

  // ============================================
  // CORE ATTENDANCE OPERATIONS
  // ============================================

  async markAttendance(req, res) {
    try {
      const { driverId, vehicleId, siteName, checkInTime, checkInLocation } = req.body;
      
      if (!driverId || !vehicleId) {
        return res.status(400).json({
          success: false,
          message: 'Driver ID and Vehicle ID are required'
        });
      }

      const checkIn = new Date(checkInTime);
      if (Number.isNaN(checkIn.valueOf())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid check-in time'
        });
      }

      // Check for existing attendance today
      const dayStart = new Date(checkIn);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(checkIn);
      dayEnd.setHours(23, 59, 59, 999);

      const existingAttendance = await Attendance.findOne({
        driver: driverId,
        date: { $gte: dayStart, $lte: dayEnd }
      });

      if (existingAttendance && existingAttendance.checkOut === null) {
        return res.status(400).json({
          success: false,
          message: 'Attendance already marked for today. Please check out first.'
        });
      }

      // Validate vehicle exists
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }

      // Validate driver exists
      const driver = await User.findById(driverId);
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: 'Driver not found'
        });
      }

      // Create attendance record
      const attendance = new Attendance({
        driver: driverId,
        vehicle: vehicleId,
        date: dayStart,
        checkIn: checkIn,
        checkInLocation: checkInLocation || undefined,
        siteName: siteName?.trim() || 'Not specified',
        status: 'PRESENT',
        approvalStatus: 'PENDING'
      });

      await attendance.save();
      await attendance.populate('driver', 'name phone email');
      await attendance.populate('vehicle', 'vehicleNumber type');

      // Add audit log
      attendance.auditLog.push({
        changedBy: req.user.id,
        fieldName: 'attendance_created',
        newValue: 'MARKED',
        reason: 'Initial check-in'
      });
      await attendance.save();

      logger.info(`Attendance marked for driver ${driverId} on ${dayStart}`);

      res.status(201).json({
        success: true,
        message: 'Attendance marked successfully',
        data: attendance
      });
    } catch (error) {
      logger.error('Attendance marking error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark attendance'
      });
    }
  }

  async checkOut(req, res) {
    try {
      const { attendanceId, checkOutTime, checkOutLocation, notes } = req.body;

      if (!attendanceId) {
        return res.status(400).json({
          success: false,
          message: 'Attendance ID is required'
        });
      }

      const attendance = await Attendance.findById(attendanceId)
        .populate('driver', 'name phone email')
        .populate('vehicle', 'vehicleNumber type');

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message: 'Attendance record not found'
        });
      }

      if (attendance.checkOut !== null) {
        return res.status(400).json({
          success: false,
          message: 'Attendance already checked out'
        });
      }

      const checkOut = new Date(checkOutTime);
      if (Number.isNaN(checkOut.valueOf())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid check-out time'
        });
      }

      if (checkOut <= attendance.checkIn) {
        return res.status(400).json({
          success: false,
          message: 'Check-out time must be after check-in time'
        });
      }

      // Calculate work hours
      const durationMs = checkOut - attendance.checkIn;
      const workHours = Math.max(0, durationMs / (1000 * 60 * 60));
      const workHoursRounded = parseFloat(workHours.toFixed(2));

      // Calculate overtime
      const overtimeHours = Math.max(0, workHoursRounded - AttendanceController.STANDARD_WORK_HOURS);

      // Calculate salary
      const dailySalary = AttendanceController.DAILY_DRIVER_SALARY;
      const overtimeSalary = overtimeHours * (dailySalary / 8) * AttendanceController.OVERTIME_MULTIPLIER;
      const totalSalary = dailySalary + overtimeSalary;

      attendance.checkOut = checkOut;
      attendance.checkOutLocation = checkOutLocation || undefined;
      attendance.workHours = workHoursRounded;
      attendance.overtimeHours = parseFloat(overtimeHours.toFixed(2));
      attendance.dailySalary = parseFloat(dailySalary.toFixed(2));
      attendance.overtimeSalary = parseFloat(overtimeSalary.toFixed(2));
      attendance.totalSalary = parseFloat(totalSalary.toFixed(2));
      attendance.notes = notes?.trim() || '';

      // Add audit log
      attendance.auditLog.push({
        changedBy: req.user.id,
        fieldName: 'checkout_completed',
        newValue: checkOut.toISOString(),
        reason: 'Check-out recorded'
      });

      await attendance.save();

      logger.info(`Check-out recorded for driver ${attendance.driver._id} - ${workHoursRounded} hours worked`);

      res.json({
        success: true,
        message: 'Check-out recorded successfully',
        data: {
          attendanceId: attendance._id,
          driver: attendance.driver.name,
          vehicle: attendance.vehicle.vehicleNumber,
          checkInTime: attendance.checkIn,
          checkOutTime: attendance.checkOut,
          workHours: attendance.workHours,
          overtimeHours: attendance.overtimeHours,
          totalSalary: attendance.totalSalary
        }
      });
    } catch (error) {
      logger.error('Check-out error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to record check-out'
      });
    }
  }

  async updateAttendance(req, res) {
    try {
      const { checkOutTime, notes, status } = req.body;
      const attendance = await Attendance.findById(req.params.id)
        .populate('driver', 'name phone')
        .populate('vehicle', 'vehicleNumber type');

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message: 'Attendance record not found'
        });
      }

      const oldValues = {
        status: attendance.status,
        notes: attendance.notes,
        workHours: attendance.workHours
      };

      if (checkOutTime && !attendance.checkOut) {
        const checkOut = new Date(checkOutTime);
        if (checkOut <= attendance.checkIn) {
          return res.status(400).json({
            success: false,
            message: 'Check-out time must be after check-in time'
          });
        }

        const durationMs = checkOut - attendance.checkIn;
        const workHours = Math.max(0, durationMs / (1000 * 60 * 60));
        attendance.checkOut = checkOut;
        attendance.workHours = parseFloat(workHours.toFixed(2));

        attendance.auditLog.push({
          changedBy: req.user.id,
          fieldName: 'workHours',
          oldValue: oldValues.workHours,
          newValue: attendance.workHours,
          reason: 'Updated during edit'
        });
      }

      if (notes !== undefined) {
        attendance.auditLog.push({
          changedBy: req.user.id,
          fieldName: 'notes',
          oldValue: oldValues.notes,
          newValue: notes,
          reason: 'Notes updated'
        });
        attendance.notes = notes;
      }

      if (status && ['PRESENT', 'ABSENT', 'HALF_DAY'].includes(status)) {
        attendance.auditLog.push({
          changedBy: req.user.id,
          fieldName: 'status',
          oldValue: oldValues.status,
          newValue: status,
          reason: 'Status updated'
        });
        attendance.status = status;
      }

      attendance.updatedAt = new Date();
      await attendance.save();

      logger.info(`Attendance ${req.params.id} updated`);

      res.json({
        success: true,
        message: 'Attendance updated successfully',
        data: attendance
      });
    } catch (error) {
      logger.error('Attendance update error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update attendance'
      });
    }
  }

  // ============================================
  // APPROVAL AND WORKFLOW
  // ============================================

  async approveAttendance(req, res) {
    try {
      const { attendanceId, notes } = req.body;

      const attendance = await Attendance.findById(attendanceId)
        .populate('driver', 'name phone')
        .populate('vehicle', 'vehicleNumber type')
        .populate('approvedBy', 'name');

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message: 'Attendance record not found'
        });
      }

      attendance.approvalStatus = 'APPROVED';
      attendance.approvedBy = req.user.id;
      attendance.approvalDate = new Date();
      attendance.approvalNotes = notes?.trim() || '';

      attendance.auditLog.push({
        changedBy: req.user.id,
        fieldName: 'approvalStatus',
        oldValue: 'PENDING',
        newValue: 'APPROVED',
        reason: notes || 'Approved by admin'
      });

      await attendance.save();
      await attendance.populate('approvedBy', 'name');

      logger.info(`Attendance ${attendanceId} approved by ${req.user.id}`);

      res.json({
        success: true,
        message: 'Attendance approved successfully',
        data: attendance
      });
    } catch (error) {
      logger.error('Attendance approval error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to approve attendance'
      });
    }
  }

  async rejectAttendance(req, res) {
    try {
      const { attendanceId, reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      const attendance = await Attendance.findById(attendanceId)
        .populate('driver', 'name phone')
        .populate('approvedBy', 'name');

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message: 'Attendance record not found'
        });
      }

      attendance.approvalStatus = 'REJECTED';
      attendance.approvalNotes = reason;
      attendance.approvedBy = req.user.id;
      attendance.approvalDate = new Date();

      attendance.auditLog.push({
        changedBy: req.user.id,
        fieldName: 'approvalStatus',
        oldValue: attendance.approvalStatus,
        newValue: 'REJECTED',
        reason: reason
      });

      await attendance.save();

      logger.info(`Attendance ${attendanceId} rejected by ${req.user.id}`);

      res.json({
        success: true,
        message: 'Attendance rejected successfully',
        data: attendance
      });
    } catch (error) {
      logger.error('Attendance rejection error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to reject attendance'
      });
    }
  }

  async raiseDispute(req, res) {
    try {
      const { attendanceId, description } = req.body;

      if (!description) {
        return res.status(400).json({
          success: false,
          message: 'Dispute description is required'
        });
      }

      const attendance = await Attendance.findById(attendanceId);

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message: 'Attendance record not found'
        });
      }

      attendance.disputes.push({
        raisedBy: req.user.id,
        description: description,
        status: 'OPEN',
        raisedDate: new Date()
      });

      attendance.auditLog.push({
        changedBy: req.user.id,
        fieldName: 'dispute_raised',
        newValue: description,
        reason: 'Dispute raised by ' + (req.user.name || 'user')
      });

      await attendance.save();

      logger.info(`Dispute raised for attendance ${attendanceId}`);

      res.json({
        success: true,
        message: 'Dispute raised successfully',
        data: attendance
      });
    } catch (error) {
      logger.error('Dispute creation error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to raise dispute'
      });
    }
  }

  async resolveDispute(req, res) {
    try {
      const { attendanceId, disputeIndex, resolution } = req.body;

      const attendance = await Attendance.findById(attendanceId);

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message: 'Attendance record not found'
        });
      }

      if (!attendance.disputes[disputeIndex]) {
        return res.status(404).json({
          success: false,
          message: 'Dispute not found'
        });
      }

      attendance.disputes[disputeIndex].status = 'RESOLVED';
      attendance.disputes[disputeIndex].resolution = resolution;
      attendance.disputes[disputeIndex].resolvedDate = new Date();

      attendance.auditLog.push({
        changedBy: req.user.id,
        fieldName: 'dispute_resolved',
        newValue: resolution,
        reason: 'Dispute resolved'
      });

      await attendance.save();

      logger.info(`Dispute resolved for attendance ${attendanceId}`);

      res.json({
        success: true,
        message: 'Dispute resolved successfully',
        data: attendance
      });
    } catch (error) {
      logger.error('Dispute resolution error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to resolve dispute'
      });
    }
  }

  // ============================================
  // RETRIEVAL AND FILTERING
  // ============================================

  async getAttendance(req, res) {
    try {
      const { driverId, date, approvalStatus, status, page = 1, limit = 10 } = req.query;
      const skip = (page - 1) * limit;

      const filter = {};
      if (driverId) filter.driver = driverId;
      if (approvalStatus) filter.approvalStatus = approvalStatus;
      if (status) filter.status = status;

      if (date) {
        const targetDate = new Date(date);
        filter.date = {
          $gte: new Date(targetDate.setHours(0, 0, 0, 0)),
          $lt: new Date(targetDate.setHours(23, 59, 59, 999))
        };
      }

      const attendance = await Attendance.find(filter)
        .populate('driver', 'name phone email')
        .populate('vehicle', 'vehicleNumber type')
        .populate('approvedBy', 'name')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1 });

      const total = await Attendance.countDocuments(filter);

      res.json({
        success: true,
        data: attendance,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Attendance fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch attendance'
      });
    }
  }

  async getDriverAttendance(req, res) {
    try {
      const driverId = req.params.driverId || req.user.id;
      const { startDate, endDate, page = 1, limit = 50 } = req.query;
      const skip = (page - 1) * limit;

      const filter = { driver: driverId };
      if (startDate && endDate) {
        filter.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      const attendance = await Attendance.find(filter)
        .populate('vehicle', 'vehicleNumber type')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const totalAttendance = await Attendance.countDocuments(filter);
      const totalHours = attendance.reduce((sum, att) => sum + (att.workHours || 0), 0);
      const totalPresentDays = attendance.filter(att => att.status === 'PRESENT').length;
      const totalAbsentDays = attendance.filter(att => att.status === 'ABSENT').length;
      const totalHalfDays = attendance.filter(att => att.status === 'HALF_DAY').length;
      const totalOvertimeHours = attendance.reduce((sum, att) => sum + (att.overtimeHours || 0), 0);
      const totalEarnings = attendance.reduce((sum, att) => sum + (att.totalSalary || 0), 0);

      res.json({
        success: true,
        data: {
          driverId,
          summary: {
            totalDays: totalAttendance,
            totalPresent: totalPresentDays,
            totalAbsent: totalAbsentDays,
            totalHalfDays: totalHalfDays,
            totalHours: parseFloat(totalHours.toFixed(2)),
            totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
            totalEarnings: parseFloat(totalEarnings.toFixed(2)),
            averageHoursPerDay: totalAttendance > 0 ? parseFloat((totalHours / totalAttendance).toFixed(2)) : 0
          },
          attendance,
          pagination: {
            page: parseInt(page),
            total: totalAttendance,
            pages: Math.ceil(totalAttendance / limit)
          }
        }
      });
    } catch (error) {
      logger.error('Driver attendance fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch driver attendance'
      });
    }
  }

  async getDailyAttendance(req, res) {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date) : new Date();
      const startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);

      const attendance = await Attendance.find({
        date: { $gte: startDate, $lte: endDate }
      })
        .populate('driver', 'name phone email')
        .populate('vehicle', 'vehicleNumber type')
        .sort({ checkIn: 1 });

      const presentCount = attendance.filter(att => att.status === 'PRESENT').length;
      const absentCount = attendance.filter(att => att.status === 'ABSENT').length;
      const halfDayCount = attendance.filter(att => att.status === 'HALF_DAY').length;
      const approvedCount = attendance.filter(att => att.approvalStatus === 'APPROVED').length;
      const pendingCount = attendance.filter(att => att.approvalStatus === 'PENDING').length;
      const rejectedCount = attendance.filter(att => att.approvalStatus === 'REJECTED').length;

      const totalHours = attendance.reduce((sum, att) => sum + (att.workHours || 0), 0);
      const totalSalary = attendance.reduce((sum, att) => sum + (att.totalSalary || 0), 0);

      res.json({
        success: true,
        data: {
          date: targetDate.toISOString().split('T')[0],
          summary: {
            totalDrivers: attendance.length,
            present: presentCount,
            absent: absentCount,
            halfDay: halfDayCount,
            approved: approvedCount,
            pending: pendingCount,
            rejected: rejectedCount,
            totalHours: parseFloat(totalHours.toFixed(2)),
            totalSalary: parseFloat(totalSalary.toFixed(2)),
            averageHours: attendance.length > 0 ? parseFloat((totalHours / attendance.length).toFixed(2)) : 0
          },
          attendance
        }
      });
    } catch (error) {
      logger.error('Daily attendance error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch daily attendance'
      });
    }
  }

  // ============================================
  // REPORTS AND ANALYTICS
  // ============================================

  async getMonthlyReport(req, res) {
    try {
      const { year, month, driverId } = req.query;

      if (!year || !month) {
        return res.status(400).json({
          success: false,
          message: 'Year and month are required'
        });
      }

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      endDate.setHours(23, 59, 59, 999);

      const filter = {
        date: { $gte: startDate, $lte: endDate }
      };

      if (driverId) {
        filter.driver = driverId;
      }

      const attendance = await Attendance.find(filter)
        .populate('driver', 'name phone email')
        .populate('vehicle', 'vehicleNumber type')
        .sort({ date: 1 });

      // Group by driver
      const driverStats = {};

      attendance.forEach(record => {
        const dId = record.driver._id.toString();
        const effectiveWorkHours = AttendanceController.getEffectiveWorkHours(record);
        if (!driverStats[dId]) {
          driverStats[dId] = {
            driver: {
              id: record.driver._id,
              name: record.driver.name,
              phone: record.driver.phone,
              email: record.driver.email
            },
            totalDays: 0,
            presentDays: 0,
            absentDays: 0,
            halfDays: 0,
            totalHours: 0,
            totalOvertimeHours: 0,
            totalSalary: 0,
            approvedRecords: 0,
            pendingRecords: 0,
            rejectedRecords: 0,
            records: []
          };
        }

        const stat = driverStats[dId];
        stat.totalDays++;
        if (record.status === 'PRESENT') stat.presentDays++;
        if (record.status === 'ABSENT') stat.absentDays++;
        if (record.status === 'HALF_DAY') stat.halfDays++;
        stat.totalHours += effectiveWorkHours;
        stat.totalOvertimeHours += record.overtimeHours || 0;
        stat.totalSalary += record.totalSalary || 0;
        if (record.approvalStatus === 'APPROVED') stat.approvedRecords++;
        if (record.approvalStatus === 'PENDING') stat.pendingRecords++;
        if (record.approvalStatus === 'REJECTED') stat.rejectedRecords++;
        stat.records.push(record);
      });

      // Convert to array and calculate percentages
      const report = Object.values(driverStats).map(stat => ({
        ...stat,
        totalHours: parseFloat(stat.totalHours.toFixed(2)),
        totalOvertimeHours: parseFloat(stat.totalOvertimeHours.toFixed(2)),
        totalSalary: parseFloat(stat.totalSalary.toFixed(2)),
        presentPercentage: stat.totalDays > 0 ? parseFloat((stat.presentDays / stat.totalDays * 100).toFixed(2)) : 0,
        averageWorkHours: stat.totalDays > 0 ? parseFloat((stat.totalHours / stat.totalDays).toFixed(2)) : 0
      }));

      const summary = report.reduce((acc, stat) => {
        acc.totalDrivers += 1;
        acc.totalPresentDays += stat.presentDays || 0;
        acc.totalAbsentDays += stat.absentDays || 0;
        acc.totalHalfDays += stat.halfDays || 0;
        acc.totalHours += stat.totalHours || 0;
        return acc;
      }, {
        totalDrivers: 0,
        totalPresentDays: 0,
        totalAbsentDays: 0,
        totalHalfDays: 0,
        totalHours: 0
      });

      summary.totalHours = parseFloat(summary.totalHours.toFixed(2));

      res.json({
        success: true,
        data: {
          period: `${year}-${String(month).padStart(2, '0')}`,
          summary,
          report
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

  async getWeeklyReport(req, res) {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required'
        });
      }

      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const attendance = await Attendance.find({
        date: { $gte: start, $lte: end }
      })
        .populate('driver', 'name phone email')
        .populate('vehicle', 'vehicleNumber type')
        .sort({ date: 1 });

      // Group by driver
      const driverStats = {};

      attendance.forEach(record => {
        const dId = record.driver._id.toString();
        const effectiveWorkHours = AttendanceController.getEffectiveWorkHours(record);
        if (!driverStats[dId]) {
          driverStats[dId] = {
            driver: record.driver,
            totalDays: 0,
            presentDays: 0,
            absentDays: 0,
            halfDays: 0,
            totalHours: 0,
            totalSalary: 0,
            dailyBreakdown: {}
          };
        }

        const stat = driverStats[dId];
        const dateKey = record.date.toISOString().split('T')[0];

        if (!stat.dailyBreakdown[dateKey]) {
          stat.dailyBreakdown[dateKey] = {
            date: dateKey,
            status: record.status,
            hours: 0,
            salary: 0,
            approvalStatus: record.approvalStatus
          };
          stat.totalDays++;
          if (record.status === 'PRESENT') stat.presentDays++;
          if (record.status === 'ABSENT') stat.absentDays++;
          if (record.status === 'HALF_DAY') stat.halfDays++;
        }

        stat.dailyBreakdown[dateKey].hours += effectiveWorkHours;
        stat.dailyBreakdown[dateKey].salary += record.totalSalary || 0;
        stat.totalHours += effectiveWorkHours;
        stat.totalSalary += record.totalSalary || 0;
      });

      // Convert to array
      const report = Object.values(driverStats).map(stat => ({
        ...stat,
        totalHours: parseFloat(stat.totalHours.toFixed(2)),
        totalSalary: parseFloat(stat.totalSalary.toFixed(2)),
        dailyBreakdown: Object.values(stat.dailyBreakdown).map(day => ({
          ...day,
          hours: parseFloat((day.hours || 0).toFixed(2)),
          salary: parseFloat((day.salary || 0).toFixed(2))
        }))
      }));

      const summary = report.reduce((acc, stat) => {
        acc.totalDrivers += 1;
        acc.totalPresentDays += stat.presentDays || 0;
        acc.totalAbsentDays += stat.absentDays || 0;
        acc.totalHalfDays += stat.halfDays || 0;
        acc.totalHours += stat.totalHours || 0;
        return acc;
      }, {
        totalDrivers: 0,
        totalPresentDays: 0,
        totalAbsentDays: 0,
        totalHalfDays: 0,
        totalHours: 0
      });

      summary.totalHours = parseFloat(summary.totalHours.toFixed(2));

      res.json({
        success: true,
        data: {
          period: `${startDate} to ${endDate}`,
          summary,
          report
        }
      });
    } catch (error) {
      logger.error('Weekly report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate weekly report'
      });
    }
  }

  async getPendingApprovals(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (page - 1) * limit;

      const pending = await Attendance.find({ approvalStatus: 'PENDING' })
        .populate('driver', 'name phone email')
        .populate('vehicle', 'vehicleNumber type')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1 });

      const total = await Attendance.countDocuments({ approvalStatus: 'PENDING' });

      res.json({
        success: true,
        data: pending,
        pagination: {
          page: parseInt(page),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Pending approvals fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending approvals'
      });
    }
  }

  async getDisputedRecords(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (page - 1) * limit;

      const disputed = await Attendance.find({ 'disputes': { $ne: [] } })
        .populate('driver', 'name phone email')
        .populate('vehicle', 'vehicleNumber type')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1 });

      const total = await Attendance.countDocuments({ 'disputes': { $ne: [] } });

      res.json({
        success: true,
        data: disputed,
        pagination: {
          page: parseInt(page),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Disputed records fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch disputed records'
      });
    }
  }

  async getAttendanceAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
      const end = endDate ? new Date(endDate) : new Date();
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const attendance = await Attendance.find({
        date: { $gte: start, $lte: end }
      }).populate('driver', 'name');

      const totalRecords = attendance.length;
      const approvedCount = attendance.filter(att => att.approvalStatus === 'APPROVED').length;
      const pendingCount = attendance.filter(att => att.approvalStatus === 'PENDING').length;
      const rejectedCount = attendance.filter(att => att.approvalStatus === 'REJECTED').length;

      const presentCount = attendance.filter(att => att.status === 'PRESENT').length;
      const absentCount = attendance.filter(att => att.status === 'ABSENT').length;
      const halfDayCount = attendance.filter(att => att.status === 'HALF_DAY').length;

      const totalHours = attendance.reduce((sum, att) => sum + (att.workHours || 0), 0);
      const totalOvertimeHours = attendance.reduce((sum, att) => sum + (att.overtimeHours || 0), 0);
      const totalSalary = attendance.reduce((sum, att) => sum + (att.totalSalary || 0), 0);

      const disputedCount = attendance.filter(att => att.disputes.length > 0).length;
      const uniqueDrivers = new Set(attendance.map(att => att.driver._id.toString())).size;

      res.json({
        success: true,
        data: {
          period: {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
          },
          overview: {
            totalRecords,
            uniqueDrivers,
            totalHours: parseFloat(totalHours.toFixed(2)),
            totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
            totalSalary: parseFloat(totalSalary.toFixed(2))
          },
          approvals: {
            approved: approvedCount,
            pending: pendingCount,
            rejected: rejectedCount,
            approvalRate: totalRecords > 0 ? parseFloat((approvedCount / totalRecords * 100).toFixed(2)) : 0
          },
          status: {
            present: presentCount,
            absent: absentCount,
            halfDay: halfDayCount,
            presentRate: totalRecords > 0 ? parseFloat((presentCount / totalRecords * 100).toFixed(2)) : 0
          },
          issues: {
            disputed: disputedCount,
            disputeRate: totalRecords > 0 ? parseFloat((disputedCount / totalRecords * 100).toFixed(2)) : 0
          }
        }
      });
    } catch (error) {
      logger.error('Analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate analytics'
      });
    }
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  async bulkAttendanceUpdate(req, res) {
    try {
      const updates = req.body;
      const results = [];

      for (const update of updates) {
        try {
          const attendance = await Attendance.findByIdAndUpdate(
            update.id,
            {
              ...update.data,
              updatedAt: new Date()
            },
            { new: true }
          );

          if (attendance) {
            attendance.auditLog.push({
              changedBy: req.user.id,
              fieldName: 'bulk_update',
              newValue: JSON.stringify(update.data),
              reason: 'Bulk update performed'
            });
            await attendance.save();
          }

          results.push({ success: true, id: update.id, data: attendance });
        } catch (error) {
          results.push({ success: false, id: update.id, error: error.message });
        }
      }

      res.json({
        success: true,
        message: 'Bulk attendance update completed',
        results
      });
    } catch (error) {
      logger.error('Bulk attendance update error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update bulk attendance'
      });
    }
  }
}

module.exports = new AttendanceController();