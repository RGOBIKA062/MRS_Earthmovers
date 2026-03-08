const nodemailer = require('nodemailer');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class NotificationService {
    async sendWhatsAppNotification(mobile, message) {
      // Example using Twilio WhatsApp API
      // Replace with your Twilio credentials and logic
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const client = require('twilio')(accountSid, authToken);
      try {
        await client.messages.create({
          from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_FROM,
          to: 'whatsapp:' + mobile,
          body: message
        });
        logger.info(`WhatsApp sent to ${mobile}: ${message}`);
      } catch (error) {
        logger.error('WhatsApp sending error:', error);
        throw error;
      }
    }
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async sendEmailNotification(to, subject, htmlContent) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@mrsearthmovers.com',
        to,
        subject,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}: ${subject}`);
      return result;
    } catch (error) {
      logger.error('Email sending error:', error);
      throw error;
    }
  }

  async sendWorkAssignmentNotification(driver, workAssignment) {
    const subject = 'New Work Assignment - MRS Earthmovers';
    const html = `
      <h2>New Work Assignment</h2>
      <p>Hi ${driver.name},</p>
      <p>You have been assigned a new work order:</p>
      <ul>
        <li><strong>Work Type:</strong> ${workAssignment.workRequest.workType}</li>
        <li><strong>Vehicle:</strong> ${workAssignment.vehicle.type} - ${workAssignment.vehicle.vehicleNumber}</li>
        <li><strong>Start Time:</strong> ${new Date(workAssignment.startTime).toLocaleString()}</li>
        <li><strong>Location:</strong> ${workAssignment.workRequest.location.address}</li>
        <li><strong>Estimated Duration:</strong> ${workAssignment.workRequest.expectedDuration} hours</li>
      </ul>
      <p>Please reach the site on time and update your progress through the app.</p>
      <p>Regards,<br>MRS Earthmovers Team</p>
    `;

    await this.sendEmailNotification(driver.email, subject, html);
  }

  async sendWorkCompletionNotification(customer, workRequest) {
    const subject = 'Work Completed - MRS Earthmovers';
    const html = `
      <h2>Work Completed Successfully</h2>
      <p>Hi ${customer.name},</p>
      <p>Your work order has been completed:</p>
      <ul>
        <li><strong>Work Type:</strong> ${workRequest.workType}</li>
        <li><strong>Assigned Vehicle:</strong> ${workRequest.assignedVehicle.type} - ${workRequest.assignedVehicle.vehicleNumber}</li>
        <li><strong>Driver:</strong> ${workRequest.assignedDriver.name}</li>
        <li><strong>Start Date:</strong> ${new Date(workRequest.startDate).toLocaleDateString()}</li>
        <li><strong>End Date:</strong> ${new Date(workRequest.endDate).toLocaleDateString()}</li>
        <li><strong>Total Cost:</strong> ₹${workRequest.actualCost}</li>
      </ul>
      <p>Please check the app for photo proofs and invoice details.</p>
      <p>Regards,<br>MRS Earthmovers Team</p>
    `;

    await this.sendEmailNotification(customer.email, subject, html);
  }

  async sendPaymentReminder(customer, payment) {
    const subject = 'Payment Reminder - MRS Earthmovers';
    const html = `
      <h2>Payment Reminder</h2>
      <p>Hi ${customer.name},</p>
      <p>This is a reminder for your payment:</p>
      <ul>
        <li><strong>Invoice Number:</strong> ${payment.invoiceNumber}</li>
        <li><strong>Amount Due:</strong> ₹${payment.amount}</li>
        <li><strong>Due Date:</strong> ${new Date(payment.dueDate).toLocaleDateString()}</li>
        <li><strong>Payment Method:</strong> ${payment.paymentMethod}</li>
      </ul>
      <p>Please complete the payment at your earliest convenience.</p>
      <p>Regards,<br>MRS Earthmovers Team</p>
    `;

    await this.sendEmailNotification(customer.email, subject, html);
  }

  async sendMaintenanceAlert(vehicle, maintenance) {
    const subject = `Maintenance Alert - ${vehicle.vehicleNumber}`;
    const html = `
      <h2>Maintenance Alert</h2>
      <p>Vehicle ${vehicle.vehicleNumber} requires maintenance:</p>
      <ul>
        <li><strong>Maintenance Type:</strong> ${maintenance.type}</li>
        <li><strong>Scheduled Date:</strong> ${new Date(maintenance.scheduledDate).toLocaleDateString()}</li>
        <li><strong>Description:</strong> ${maintenance.description}</li>
        <li><strong>Estimated Cost:</strong> ₹${maintenance.cost}</li>
      </ul>
      <p>Please schedule the maintenance before the due date.</p>
      <p>Regards,<br>MRS Earthmovers Team</p>
    `;

    await this.sendEmailNotification('admin@mrsearthmovers.com', subject, html);
  }

  async sendEmergencyAlert(driver, complaint) {
    const subject = `Emergency Alert - ${complaint.vehicle.vehicleNumber}`;
    const html = `
      <h2>Emergency Alert - CRITICAL</h2>
      <p>Emergency situation reported:</p>
      <ul>
        <li><strong>Vehicle:</strong> ${complaint.vehicle.vehicleNumber}</li>
        <li><strong>Driver:</strong> ${driver.name}</li>
        <li><strong>Complaint Type:</strong> ${complaint.type}</li>
        <li><strong>Severity:</strong> ${complaint.severity}</li>
        <li><strong>Location:</strong> ${complaint.location.address}</li>
        <li><strong>Description:</strong> ${complaint.description}</li>
      </ul>
      <p><strong>IMMEDIATE ACTION REQUIRED!</strong></p>
      <p>Regards,<br>MRS Earthmovers Team</p>
    `;

    await this.sendEmailNotification('emergency@mrsearthmovers.com', subject, html);
  }

  async generateInvoiceNotification(invoice) {
    const subject = `Invoice #${invoice.invoiceNumber} - MRS Earthmovers`;
    const html = `
      <h2>Invoice #${invoice.invoiceNumber}</h2>
      <p>Dear ${invoice.customer.name},</p>
      <p>Your invoice is ready for payment:</p>
      <ul>
        <li><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</li>
        <li><strong>Work Period:</strong> ${new Date(invoice.startDate).toLocaleDateString()} to ${new Date(invoice.endDate).toLocaleDateString()}</li>
        <li><strong>Hours Worked:</strong> ${invoice.hoursWorked} hours</li>
        <li><strong>Hourly Rate:</strong> ₹${invoice.hourlyRate}</li>
        <li><strong>Subtotal:</strong> ₹${invoice.subtotal}</li>
        <li><strong>Tax (18%):</strong> ₹${invoice.taxAmount}</li>
        <li><strong>Total Amount:</strong> ₹${invoice.totalAmount}</li>
        <li><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</li>
      </ul>
      <p>Please find the attached invoice for your records.</p>
      <p>Regards,<br>MRS Earthmovers Team</p>
    `;

    await this.sendEmailNotification(invoice.customer.email, subject, html);
  }
}

module.exports = new NotificationService();