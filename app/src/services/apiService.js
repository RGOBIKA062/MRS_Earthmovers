

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const devHost = Constants.expoConfig?.hostUri?.split(':')?.[0];
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (devHost ? `http://${devHost}:3000/api` : 'http://localhost:3000/api');

class ApiService {
  // Payment APIs
  async getPaymentsByCustomer() {
    return this.api.get('/payments/customer');
  }

  async getDueWorkRequests() {
    return this.api.get('/payments/due-work-requests');
  }

  async createPaymentOrder(amount, workRequestId, description) {
    return this.api.post('/payments/create-order', {
      amount,
      workRequestId,
      description
    });
  }

  async verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId) {
    return this.api.post('/payments/verify', {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      paymentId
    });
  }

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 15000,
    });
    
    this.api.interceptors.request.use(async (config) => {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await AsyncStorage.removeItem('token');
        }
        return Promise.reject(error);
      }
    );
  }

  // Vehicle APIs
  async getVehicles(params = {}) {
    return this.api.get('/vehicles', { params });
  }

  async createVehicle(vehicleData) {
    return this.api.post('/vehicles', vehicleData);
  }

  async getAvailableVehicles() {
    return this.api.get('/vehicles/available');
  }

  async getEmergencyVehicles() {
    return this.api.get('/vehicles/emergency');
  }

  async updateVehicle(id, vehicleData) {
    return this.api.put(`/vehicles/${id}`, vehicleData);
  }

  async updateVehicleLocation(id, locationData) {
    return this.api.put(`/vehicles/${id}/location`, locationData);
  }

  // Work Request APIs
  async createWorkRequest(workData) {
    return this.api.post('/work-requests', workData);
  }

  async getWorkRequests(params = {}) {
    return this.api.get('/work-requests', { params });
  }

  async getWorkRequestsByCustomer(customerId) {
    return this.api.get('/work-requests/customer', { params: { customerId } });
  }

  async getWorkRequest(id) {
    return this.api.get(`/work-requests/${id}`);
  }

  async assignWork(id, assignmentData) {
    return this.api.put(`/work-requests/${id}/assign`, assignmentData);
  }

  async updateWorkRequestStatus(id, statusData) {
    return this.api.put(`/work-requests/${id}/status`, statusData);
  }

  async updatePaymentStatus(id, paymentData) {
    return this.api.put(`/work-requests/${id}/payment`, paymentData);
  }

  // Driver APIs
  async getDrivers(params = {}) {
    return this.api.get('/drivers', { params });
  }

  async getDriverWorkList(driverId, params = {}) {
    return this.api.get(`/drivers/work-list/${driverId}`, { params });
  }

  async updateWorkAssignmentStatus(id, statusData) {
    return this.api.put(`/drivers/work-assignments/${id}/status`, statusData);
  }

  async getDriverProgress(driverId) {
    return this.api.get(`/drivers/progress/${driverId}`);
  }

  async reportComplaint(complaintData) {
    return this.api.post('/complaints', complaintData);
  }

  async getComplaints(params = {}) {
    return this.api.get('/complaints', { params });
  }

  async getComplaint(id) {
    return this.api.get(`/complaints/${id}`);
  }

  async getDriverComplaints(driverId) {
    return this.api.get(`/complaints/driver/${driverId}`);
  }

  async updateComplaintStatus(id, statusData) {
    return this.api.put(`/complaints/${id}/status`, statusData);
  }

  async getComplaintStatistics() {
    return this.api.get('/complaints/statistics');
  }

  async getDriverVehicles(driverId) {
    return this.api.get(`/drivers/vehicles/${driverId}`);
  }

  async getLiveLocation(driverId) {
    return this.api.get(`/drivers/live-location/${driverId}`);
  }

  async getDriverDashboard(driverId) {
    return this.api.get(`/drivers/dashboard/${driverId}`);
  }

  async getWorkAssignmentsStats(driverId) {
    return this.api.get(`/drivers/${driverId}/work-assignments-stats`);
  }

  async getDailyStats(driverId, params = {}) {
    return this.api.get(`/drivers/${driverId}/daily-stats`, { params });
  }

  // Report APIs
  async getDailyReport(date) {
    return this.api.get('/work-requests/daily-report', { params: { date } });
  }

  async getWorkRequestMonthlyReport(year, month) {
    return this.api.get('/work-requests/monthly-report', { params: { year, month } });
  }

  // Admin APIs
  async getDashboardSummary() {
    return this.api.get('/admin/dashboard-summary');
  }

  async getDailyMetrics(date) {
    return this.api.get('/admin/daily-metrics', { params: { date } });
  }

  // Attendance APIs
  async getAttendance(params = {}) {
    return this.api.get('/attendance', { params });
  }

  async markAttendance(attendanceData) {
    return this.api.post('/attendance', attendanceData);
  }

  async checkOut(checkOutData) {
    return this.api.post('/attendance/checkout', checkOutData);
  }

  async updateAttendanceStatus(attendanceId, status) {
    return this.api.put(`/attendance/${attendanceId}`, { status });
  }

  async approveAttendance(attendanceId, notes) {
    return this.api.post(`/attendance/approve/${attendanceId}`, { attendanceId, notes });
  }

  async rejectAttendance(attendanceId, reason) {
    return this.api.post(`/attendance/reject/${attendanceId}`, { attendanceId, reason });
  }

  async raiseDispute(attendanceId, description) {
    return this.api.post(`/attendance/dispute/${attendanceId}`, { attendanceId, description });
  }

  async resolveDispute(attendanceId, disputeIndex, resolution) {
    return this.api.post(`/attendance/dispute/${attendanceId}/resolve`, { attendanceId, disputeIndex, resolution });
  }

  async getDriverAttendance(driverId, params = {}) {
    return this.api.get(`/attendance/driver/${driverId}`, { params });
  }

  async getDailyAttendance(params = {}) {
    return this.api.get('/attendance/daily', { params });
  }

  async getPendingApprovals(params = {}) {
    return this.api.get('/attendance/approvals/pending', { params });
  }

  async getDisputedRecords(params = {}) {
    return this.api.get('/attendance/issues/disputed', { params });
  }

  async getAttendanceMonthlyReport(year, month, driverId = null) {
    return this.api.get('/attendance/report/monthly', { params: { year, month, driverId } });
  }

  async getWeeklyReport(startDate, endDate) {
    return this.api.get('/attendance/report/weekly', { params: { startDate, endDate } });
  }

  async getAttendanceAnalytics(startDate = null, endDate = null) {
    return this.api.get('/attendance/report/analytics', { params: { startDate, endDate } });
  }

  // Payment APIs
  async createRazorpayOrder(amount, workRequestId, description) {
    return this.api.post('/payments/create-order', {
      amount,
      workRequestId,
      description
    });
  }

  async recordUpiPayment(amount, workRequestId, description, app = 'UPI') {
    return this.api.post('/payments/record-upi', {
      amount,
      workRequestId,
      description,
      app
    });
  }

  async verifyRazorpayPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId) {
    return this.api.post('/payments/verify', {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      paymentId
    });
  }

  // Vehicle Availability APIs
  async checkVehicleAvailability(vehicleId, startDate, endDate) {
    return this.api.post('/vehicles/check-availability', {
      vehicleId,
      startDate,
      endDate
    });
  }

  async getVehicleAvailabilityCalendar(startDate, endDate, vehicleType = null) {
    const params = { startDate, endDate };
    if (vehicleType) {
      params.vehicleType = vehicleType;
    }
    return this.api.get('/vehicles/availability-calendar', { params });
  }

  async getAvailableVehiclesForDates(startDate, endDate, vehicleType = null) {
    const params = { startDate, endDate };
    if (vehicleType) {
      params.vehicleType = vehicleType;
    }
    return this.api.get('/vehicles/available-for-dates', { params });
  }

  async suggestAlternativeDates(vehicleId, requestedStartDate, durationHours) {
    return this.api.post('/vehicles/suggest-dates', {
      vehicleId,
      requestedStartDate,
      durationHours
    });
  }

  // Generic API methods
  async get(url, params = {}, config = {}) {
    return this.api.get(url, { ...config, params });
  }

  async post(url, data = {}, config = {}) {
    return this.api.post(url, data, config);
  }

  async put(url, data = {}, config = {}) {
    return this.api.put(url, data, config);
  }

  async delete(url, config = {}) {
    return this.api.delete(url, config);
  }
}

export default new ApiService();