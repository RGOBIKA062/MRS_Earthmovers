const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { auth, roleAuth } = require('../middleware/auth');
const { vehicleValidation } = require('../middleware/validation');

router.post('/', auth, roleAuth(['ADMIN']), vehicleValidation, vehicleController.createVehicle);
router.get('/', auth, vehicleController.getVehicles);
router.get('/available', auth, vehicleController.getAvailableVehicles);
router.get('/emergency', auth, roleAuth(['ADMIN']), vehicleController.getEmergencyVehicles);
router.get('/availability-calendar', auth, vehicleController.getAvailabilityCalendar);
router.get('/available-for-dates', auth, vehicleController.getAvailableForDates);
router.post('/check-availability', auth, vehicleController.checkAvailability);
router.post('/suggest-dates', auth, vehicleController.suggestDates);
router.get('/:id', auth, vehicleController.getVehicle);
router.put('/:id', auth, roleAuth(['ADMIN']), vehicleController.updateVehicle);
router.delete('/:id', auth, roleAuth(['ADMIN']), vehicleController.deleteVehicle);
router.put('/:id/location', auth, roleAuth(['ADMIN', 'DRIVER']), vehicleController.updateVehicleLocation);

module.exports = router;