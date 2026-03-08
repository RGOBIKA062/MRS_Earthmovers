const Vehicle = require('../models/Vehicle');
const WorkAssignment = require('../models/WorkAssignment');

const ACTIVE_ASSIGNMENT_STATUSES = ['ASSIGNED', 'STARTED', 'REACHED_SITE', 'IN_PROGRESS'];

const reserveVehicleForAssignment = async (vehicleId, driverId) => {
  return Vehicle.findOneAndUpdate(
    { _id: vehicleId, isActive: true, status: 'AVAILABLE' },
    {
      $set: {
        status: 'ASSIGNED',
        driver: driverId,
        updatedAt: new Date(),
      },
    },
    { new: true }
  );
};

const releaseVehicleIfNoActiveAssignments = async (vehicleId) => {
  const hasActiveAssignments = await WorkAssignment.exists({
    vehicle: vehicleId,
    status: { $in: ACTIVE_ASSIGNMENT_STATUSES },
  });

  if (hasActiveAssignments) {
    return null;
  }

  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    return null;
  }

  // Don't override emergency/maintenance states set by other workflows.
  if (['MAINTENANCE', 'BREAKDOWN', 'EMERGENCY'].includes(vehicle.status)) {
    return vehicle;
  }

  vehicle.status = 'AVAILABLE';
  vehicle.updatedAt = new Date();
  await vehicle.save();
  return vehicle;
};

module.exports = {
  ACTIVE_ASSIGNMENT_STATUSES,
  reserveVehicleForAssignment,
  releaseVehicleIfNoActiveAssignments,
};
