require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');
const winston = require('winston');
const cron = require('node-cron');
const path = require('path');
const http = require('http');

const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const workRequestRoutes = require('./routes/workRequests');
const attendanceRoutes = require('./routes/attendance');
const driverRoutes = require('./routes/drivers');
const photoProofRoutes = require('./routes/photoProofs');

const adminRoutes = require('./routes/admin');
const complaintRoutes = require('./routes/complaints');
const paymentRoutes = require('./routes/payments');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console()
  ]
});

const app = express();

connectDB();

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Uploaded images (photo proofs)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/work-requests', workRequestRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/photo-proofs', photoProofRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api/complaints', complaintRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'MRS Earthmovers API is running',
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') {
    throw err;
  }

  const healthReq = http.get(
    {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/health',
      timeout: 2000,
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200 && body.includes('MRS Earthmovers API is running')) {
          logger.warn(`Port ${PORT} already has an active MRS backend instance. Exiting duplicate start.`);
          process.exit(0);
          return;
        }

        logger.error(`Port ${PORT} is already in use by another process.`);
        process.exit(1);
      });
    }
  );

  healthReq.on('error', () => {
    logger.error(`Port ${PORT} is already in use by another process.`);
    process.exit(1);
  });

  healthReq.on('timeout', () => {
    healthReq.destroy();
    logger.error(`Port ${PORT} is already in use and health check timed out.`);
    process.exit(1);
  });
});

cron.schedule('0 9 * * *', async () => {
  logger.info('Running daily maintenance tasks...');
  
  const Maintenance = require('./models/Maintenance');
  const Vehicle = require('./models/Vehicle');
  
  const overdueMaintenance = await Maintenance.find({
    scheduledDate: { $lt: new Date() },
    status: 'SCHEDULED'
  });
  
  for (const maintenance of overdueMaintenance) {
    const vehicle = await Vehicle.findById(maintenance.vehicle);
    if (vehicle) {
      vehicle.status = 'MAINTENANCE';
      await vehicle.save();
    }
    maintenance.status = 'OVERDUE';
    await maintenance.save();
    logger.warn(`Overdue maintenance for vehicle ${vehicle?.vehicleNumber}`);
  }
  
  logger.info('Daily maintenance tasks completed');
});

cron.schedule('0 0 * * *', async () => {
  logger.info('Running daily oil change reminders...');
  
  const Vehicle = require('./models/Vehicle');
  const Maintenance = require('./models/Maintenance');
  
  const vehicles = await Vehicle.find({ isActive: true });
  
  for (const vehicle of vehicles) {
    const lastMaintenance = await Maintenance.findOne({
      vehicle: vehicle._id,
      type: 'OIL_CHANGE',
      status: 'COMPLETED'
    }).sort({ completedDate: -1 });
    
    if (lastMaintenance) {
      const daysSinceLastService = Math.floor(
        (new Date() - lastMaintenance.completedDate) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceLastService >= 30) {
        logger.warn(`Oil change due for vehicle ${vehicle.vehicleNumber}`);
        const newMaintenance = new Maintenance({
          vehicle: vehicle._id,
          type: 'OIL_CHANGE',
          description: 'Scheduled oil change',
          scheduledDate: new Date(),
          status: 'SCHEDULED'
        });
        await newMaintenance.save();
      }
    }
  }
  
  logger.info('Daily oil change reminders completed');
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});