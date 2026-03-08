const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { auth, roleAuth } = require('../middleware/auth');
const { attendanceValidation } = require('../middleware/validation');

// Core attendance operations
router.post('/', auth, roleAuth(['ADMIN', 'DRIVER']), attendanceController.markAttendance);
router.post('/checkout', auth, roleAuth(['ADMIN', 'DRIVER']), attendanceController.checkOut);
router.put('/:id', auth, roleAuth(['ADMIN', 'DRIVER']), attendanceController.updateAttendance);

// Approvals and workflow
router.post('/approve/:attendanceId', auth, roleAuth(['ADMIN']), attendanceController.approveAttendance);
router.post('/reject/:attendanceId', auth, roleAuth(['ADMIN']), attendanceController.rejectAttendance);
router.post('/dispute/:attendanceId', auth, attendanceController.raiseDispute);
router.post('/dispute/:attendanceId/resolve', auth, roleAuth(['ADMIN']), attendanceController.resolveDispute);

// Retrieval operations
router.get('/', auth, attendanceController.getAttendance);
router.get('/driver/:driverId', auth, attendanceController.getDriverAttendance);
router.get('/daily', auth, roleAuth(['ADMIN']), attendanceController.getDailyAttendance);
router.get('/approvals/pending', auth, roleAuth(['ADMIN']), attendanceController.getPendingApprovals);
router.get('/issues/disputed', auth, roleAuth(['ADMIN']), attendanceController.getDisputedRecords);

// Reports and analytics
router.get('/report/monthly', auth, roleAuth(['ADMIN']), attendanceController.getMonthlyReport);
router.get('/report/weekly', auth, roleAuth(['ADMIN']), attendanceController.getWeeklyReport);
router.get('/report/analytics', auth, roleAuth(['ADMIN']), attendanceController.getAttendanceAnalytics);

// Bulk operations
router.put('/bulk', auth, roleAuth(['ADMIN']), attendanceController.bulkAttendanceUpdate);

module.exports = router;
