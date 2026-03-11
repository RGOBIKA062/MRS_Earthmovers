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
  console.log('🔍 Checking if vehicle can be released:', vehicleId);
  
  const hasActiveAssignments = await WorkAssignment.exists({
    vehicle: vehicleId,
    status: { $in: ACTIVE_ASSIGNMENT_STATUSES },
  });

  if (hasActiveAssignments) {
    console.log('⚠️ Vehicle still has active assignments, keeping current status');
    return null;
  }

  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    console.log('❌ Vehicle not found');
    return null;
  }

  // Don't override emergency/maintenance states set by other workflows.
  if (['MAINTENANCE', 'BREAKDOWN', 'EMERGENCY'].includes(vehicle.status)) {
    console.log(`⚠️ Vehicle in ${vehicle.status} state, not changing to AVAILABLE`);
    return vehicle;
  }

  console.log(`✅ Releasing vehicle ${vehicle.vehicleNumber} from ${vehicle.status} to AVAILABLE`);
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
