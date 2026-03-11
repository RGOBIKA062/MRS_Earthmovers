import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ActivityIndicator, 
  RefreshControl, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  StyleSheet,
  Modal,
  Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRupees = (value) => {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDateDisplay = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatTimeDisplay = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const AdminReports = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportType, setReportType] = useState('daily'); // daily, monthly, annual
  const [dailyReport, setDailyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    loadReports();
  }, [reportType, selectedDate, selectedMonth, selectedYear]);

  const loadReports = async () => {
    setLoading(true);
    try {
      if (reportType === 'daily') {
        await fetchDailyReport();
      } else if (reportType === 'monthly') {
        await fetchMonthlyReport();
      }
    } catch (error) {
      console.error('Load reports error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyReport = async () => {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const response = await apiService.getDailyReport(dateStr);
      setDailyReport(response.data.data);
    } catch (error) {
      console.error('Error fetching daily report:', error);
    }
  };

  const fetchMonthlyReport = async () => {
    try {
      const response = await apiService.getWorkRequestMonthlyReport(selectedYear, selectedMonth);
      setMonthlyReport(response.data.data);
    } catch (error) {
      console.error('Error fetching monthly report:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const onDateChange = (event, date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
    }
  };

  const buildDailyReportPDF = () => {
    if (!dailyReport) return '';

    const generatedAt = new Date();
    const reportDate = formatDateDisplay(dailyReport.date);
    
    // Work Requests Table
    const workRequestRows = (dailyReport.workRequests || []).map((wr, index) => {
      const customerName = wr.customer?.name || '-';
      const customerPhone = wr.customer?.phone || '-';
      const workType = wr.workType || '-';
      const status = wr.status || '-';
      const payableCost = formatRupees(wr.totalPayableAmount || wr.actualCost || wr.estimatedCost || 0);
      const paidCost = formatRupees(wr.paidAmount || 0);
      const pendingCost = formatRupees(wr.pendingAmount || 0);
      
      const statusColor = 
        status === 'COMPLETED' ? '#4CAF50' :
        status === 'IN_PROGRESS' ? '#FF9800' :
        status === 'ASSIGNED' ? '#2196F3' : '#9E9E9E';

      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(customerName)}</td>
          <td class="center">${escapeHtml(customerPhone)}</td>
          <td>${escapeHtml(workType)}</td>
          <td class="center">
            <span style="background: ${statusColor}; color: #fff; padding: 4px 8px; border-radius: 8px; font-size: 9px; font-weight: 700;">
              ${escapeHtml(status)}
            </span>
          </td>
          <td class="amount">${escapeHtml(payableCost)}</td>
          <td class="amount">${escapeHtml(paidCost)}</td>
          <td class="amount">${escapeHtml(pendingCost)}</td>
        </tr>
      `;
    }).join('');

    const dailyUserRows = (dailyReport.userBreakdown || []).map((userRow, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(userRow.userName || '-')}</td>
        <td class="center">${escapeHtml(userRow.phone || '-')}</td>
        <td class="center">${escapeHtml(String(userRow.totalWorks || 0))}</td>
        <td class="center">${escapeHtml(String((userRow.utilizationRate || 0).toFixed(1)))}%</td>
        <td class="amount">${escapeHtml(formatRupees(userRow.totalPaidAmount || 0))}</td>
        <td class="amount">${escapeHtml(formatRupees(userRow.pendingAmount || 0))}</td>
      </tr>
    `).join('');

    // Completed Work Table
    const completedWorkRows = (dailyReport.completedWork || []).map((wr, index) => {
      const customerName = wr.customer?.name || '-';
      const workType = wr.workType || '-';
      const vehicleNumber = wr.assignedVehicle?.vehicleNumber || '-';
      const vehicleType = wr.assignedVehicle?.type || '-';
      const actualCost = formatRupees(wr.actualCost || 0);
      const completedTime = formatTimeDisplay(wr.completedAt);

      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(customerName)}</td>
          <td>${escapeHtml(workType)}</td>
          <td class="center">${escapeHtml(vehicleNumber)}</td>
          <td class="center">${escapeHtml(vehicleType)}</td>
          <td class="amount" style="color: #2E7D32; font-weight: 700;">${escapeHtml(actualCost)}</td>
          <td class="center">${escapeHtml(completedTime)}</td>
        </tr>
      `;
    }).join('');

    const completionRate = dailyReport.totalWorkRequests > 0 
      ? ((toNumber(dailyReport.completedWork) / dailyReport.totalWorkRequests) * 100).toFixed(1) 
      : '0.0';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 20px;
            color: #1F2937;
            font-size: 11px;
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #0F766E;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .company-name {
            margin: 0;
            font-size: 28px;
            color: #0F766E;
            letter-spacing: 1px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .report-title {
            margin: 8px 0 4px;
            font-size: 18px;
            color: #374151;
            font-weight: 600;
          }
          .report-date {
            margin: 4px 0;
            font-size: 14px;
            color: #6B7280;
            font-weight: 500;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin: 16px 0;
            background: #F9FAFB;
            border: 1px solid #D1D5DB;
            border-radius: 8px;
            padding: 12px;
          }
          .meta-item {
            display: flex;
            justify-content: space-between;
            padding: 6px 8px;
            background: #fff;
            border-radius: 6px;
            border: 1px solid #E5E7EB;
          }
          .meta-label {
            color: #6B7280;
            font-weight: 600;
            font-size: 10px;
          }
          .meta-value {
            color: #111827;
            font-weight: 700;
            font-size: 11px;
          }
          .summary-box {
            background: linear-gradient(135deg, #0F766E 0%, #14B8A6 100%);
            border-radius: 12px;
            padding: 16px;
            margin: 16px 0;
            color: #fff;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-top: 12px;
          }
          .summary-card {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            padding: 12px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          .summary-value {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .summary-label {
            font-size: 9px;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .section-title {
            margin: 24px 0 12px;
            font-size: 14px;
            font-weight: 700;
            color: #0F766E;
            border-bottom: 2px solid #0F766E;
            padding-bottom: 6px;
            display: flex;
            align-items: center;
          }
          .section-icon {
            margin-right: 8px;
            font-size: 16px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 10px;
          }
          th, td {
            border: 1px solid #D1D5DB;
            padding: 8px 6px;
            vertical-align: middle;
          }
          th {
            background: #0F766E;
            color: #FFFFFF;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            font-size: 9px;
            font-weight: 700;
          }
          tr:nth-child(even) {
            background: #F9FAFB;
          }
          .center { text-align: center; }
          .amount { text-align: right; font-weight: 600; }
          .footer {
            margin-top: 24px;
            padding-top: 12px;
            border-top: 2px solid #E5E7EB;
            text-align: center;
            font-size: 9px;
            color: #6B7280;
          }
          .footer-line {
            margin: 4px 0;
          }
          .no-data {
            text-align: center;
            padding: 24px;
            background: #FEF3C7;
            border: 1px solid #FCD34D;
            border-radius: 8px;
            color: #92400E;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="company-name">MRS Earthmovers</h1>
          <p class="report-title">📊 Daily Business Report</p>
          <p class="report-date">${escapeHtml(reportDate)}</p>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Generated By:</span>
            <span class="meta-value">${escapeHtml(user?.name || 'Admin')}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Generated On:</span>
            <span class="meta-value">${escapeHtml(formatDateDisplay(generatedAt))}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Report Type:</span>
            <span class="meta-value">Daily Operations</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Time:</span>
            <span class="meta-value">${escapeHtml(formatTimeDisplay(generatedAt))}</span>
          </div>
        </div>

        <div class="summary-box">
          <div style="text-align: center; font-size: 13px; font-weight: 700; margin-bottom: 4px;">
            📈 DAILY PERFORMANCE SUMMARY
          </div>
          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-value">${dailyReport.totalWorkRequests || 0}</div>
              <div class="summary-label">Total Requests</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${toNumber(dailyReport.completedWork) || 0}</div>
              <div class="summary-label">Completed</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${dailyReport.totalVehicles || 0}</div>
              <div class="summary-label">Vehicles Used</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${escapeHtml(formatRupees(dailyReport.totalRevenue || 0))}</div>
              <div class="summary-label">Collected Revenue</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${escapeHtml(formatRupees(dailyReport.totalPaidAmount || 0))}</div>
              <div class="summary-label">Total Paid</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${escapeHtml(formatRupees(dailyReport.totalPendingAmount || 0))}</div>
              <div class="summary-label">Pending Amount</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${escapeHtml(String(dailyReport.totalUsersUtilized || 0))}</div>
              <div class="summary-label">Users Utilized</div>
            </div>
          </div>
          <div style="text-align: center; margin-top: 12px; font-size: 11px; opacity: 0.9;">
            Completion Rate: <strong>${completionRate}%</strong>
          </div>
        </div>

        <h2 class="section-title">
          All Work Requests Received Today
        </h2>
        ${dailyReport.workRequests && dailyReport.workRequests.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th style="width: 5%;">S.No</th>
                <th style="width: 18%;">Customer Name</th>
                <th style="width: 12%;">Phone</th>
                <th style="width: 20%;">Work Type</th>
                <th style="width: 12%;">Status</th>
                <th style="width: 15%;">Payable</th>
                <th style="width: 15%;">Paid</th>
                <th style="width: 15%;">Pending</th>
              </tr>
            </thead>
            <tbody>
              ${workRequestRows}
            </tbody>
          </table>
        ` : `
          <div class="no-data">📭 No work requests received on this day</div>
        `}

        <h2 class="section-title">
          User-wise Utilization & Pending Amount
        </h2>
        ${(dailyReport.userBreakdown || []).length > 0 ? `
          <table>
            <thead>
              <tr>
                <th style="width: 6%;">S.No</th>
                <th style="width: 22%;">User</th>
                <th style="width: 14%;">Phone</th>
                <th style="width: 10%;">Works</th>
                <th style="width: 12%;">Utilization</th>
                <th style="width: 18%;">Paid</th>
                <th style="width: 18%;">Pending</th>
              </tr>
            </thead>
            <tbody>
              ${dailyUserRows}
            </tbody>
          </table>
        ` : `
          <div class="no-data">📭 No user analytics for this day</div>
        `}

        <h2 class="section-title">
          Completed Work Details
        </h2>
        ${dailyReport.completedWork && dailyReport.completedWork.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th style="width: 5%;">S.No</th>
                <th style="width: 20%;">Customer Name</th>
                <th style="width: 22%;">Work Type</th>
                <th style="width: 13%;">Vehicle No.</th>
                <th style="width: 15%;">Vehicle Type</th>
                <th style="width: 15%;">Revenue</th>
                <th style="width: 10%;">Time</th>
              </tr>
            </thead>
            <tbody>
              ${completedWorkRows}
            </tbody>
          </table>
        ` : `
          <div class="no-data">📭 No work completed on this day</div>
        `}

        <div class="footer">
          <div class="footer-line"><strong>MRS Earthmovers Management System</strong></div>
          <div class="footer-line">Comprehensive Daily Business Report</div>
          <div class="footer-line">Generated on ${escapeHtml(formatDateDisplay(generatedAt))} at ${escapeHtml(formatTimeDisplay(generatedAt))}</div>
          <div class="footer-line" style="margin-top: 8px; font-style: italic;">
            This is a computer-generated report. For queries, contact administration.
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const buildMonthlyReportPDF = () => {
    if (!monthlyReport) return '';

    const generatedAt = new Date();
    const monthName = MONTH_NAMES[monthlyReport.month - 1];
    
    // Revenue by Day Chart
    const revenueEntries = Object.entries(monthlyReport.revenueByDay || {}).sort((a, b) => 
      new Date(a[0]) - new Date(b[0])
    );

    const maxRevenue = Math.max(...revenueEntries.map(([_, rev]) => toNumber(rev)), 1);

    const revenueByDayRows = revenueEntries.map(([date, revenue], index) => {
      const percentage = (toNumber(revenue) / maxRevenue) * 100;
      const barColor = percentage > 75 ? '#4CAF50' : percentage > 50 ? '#FF9800' : '#2196F3';
      
      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(formatDateDisplay(date))}</td>
          <td>
            <div style="background: #E5E7EB; border-radius: 4px; overflow: hidden; height: 20px; position: relative;">
              <div style="background: ${barColor}; height: 100%; width: ${percentage}%;"></div>
              <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px; color: #1F2937;">
                ${escapeHtml(formatRupees(revenue))}
              </div>
            </div>
          </td>
          <td class="amount" style="color: #2E7D32; font-weight: 700;">${escapeHtml(formatRupees(revenue))}</td>
        </tr>
      `;
    }).join('');

    const monthlyUserRows = (monthlyReport.userBreakdown || []).map((userRow, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(userRow.userName || '-')}</td>
        <td class="center">${escapeHtml(userRow.phone || '-')}</td>
        <td class="center">${escapeHtml(String(userRow.totalWorks || 0))}</td>
        <td class="center">${escapeHtml(String((userRow.utilizationRate || 0).toFixed(1)))}%</td>
        <td class="amount">${escapeHtml(formatRupees(userRow.totalPaidAmount || 0))}</td>
        <td class="amount">${escapeHtml(formatRupees(userRow.pendingAmount || 0))}</td>
      </tr>
    `).join('');

    // Work summary
    const completionRate = monthlyReport.totalWorkRequests > 0 
      ? ((toNumber(monthlyReport.completedWork) / monthlyReport.totalWorkRequests) * 100).toFixed(1) 
      : '0.0';

    const avgDailyRevenue = revenueEntries.length > 0
      ? toNumber(monthlyReport.totalRevenue) / revenueEntries.length
      : 0;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 20px;
            color: #1F2937;
            font-size: 11px;
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #0F766E;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .company-name {
            margin: 0;
            font-size: 28px;
            color: #0F766E;
            letter-spacing: 1px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .report-title {
            margin: 8px 0 4px;
            font-size: 18px;
            color: #374151;
            font-weight: 600;
          }
          .report-period {
            margin: 4px 0;
            font-size: 16px;
            color: #0F766E;
            font-weight: 700;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin: 16px 0;
            background: #F9FAFB;
            border: 1px solid #D1D5DB;
            border-radius: 8px;
            padding: 12px;
          }
          .meta-item {
            display: flex;
            justify-content: space-between;
            padding: 6px 8px;
            background: #fff;
            border-radius: 6px;
            border: 1px solid #E5E7EB;
          }
          .meta-label {
            color: #6B7280;
            font-weight: 600;
            font-size: 10px;
          }
          .meta-value {
            color: #111827;
            font-weight: 700;
            font-size: 11px;
          }
          .summary-box {
            background: linear-gradient(135deg, #0F766E 0%, #14B8A6 100%);
            border-radius: 12px;
            padding: 18px;
            margin: 16px 0;
            color: #fff;
          }
          .summary-title {
            text-align: center;
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 12px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 12px;
          }
          .summary-card {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            padding: 12px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          .summary-value {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .summary-label {
            font-size: 9px;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .insights-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
          }
          .insight-item {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 8px;
            font-size: 10px;
            text-align: center;
          }
          .insight-value {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 2px;
          }
          .section-title {
            margin: 24px 0 12px;
            font-size: 14px;
            font-weight: 700;
            color: #0F766E;
            border-bottom: 2px solid #0F766E;
            padding-bottom: 6px;
            display: flex;
            align-items: center;
          }
          .section-icon {
            margin-right: 8px;
            font-size: 16px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 10px;
          }
          th, td {
            border: 1px solid #D1D5DB;
            padding: 8px 6px;
            vertical-align: middle;
          }
          th {
            background: #0F766E;
            color: #FFFFFF;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            font-size: 9px;
            font-weight: 700;
          }
          tr:nth-child(even) {
            background: #F9FAFB;
          }
          .center { text-align: center; }
          .amount { text-align: right; font-weight: 600; }
          .footer {
            margin-top: 24px;
            padding-top: 12px;
            border-top: 2px solid #E5E7EB;
            text-align: center;
            font-size: 9px;
            color: #6B7280;
          }
          .footer-line {
            margin: 4px 0;
          }
          .no-data {
            text-align: center;
            padding: 24px;
            background: #FEF3C7;
            border: 1px solid #FCD34D;
            border-radius: 8px;
            color: #92400E;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="company-name">MRS Earthmovers</h1>
          <p class="report-title">📊 Monthly Business Report</p>
          <p class="report-period">${escapeHtml(monthName)} ${monthlyReport.year}</p>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Generated By:</span>
            <span class="meta-value">${escapeHtml(user?.name || 'Admin')}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Generated On:</span>
            <span class="meta-value">${escapeHtml(formatDateDisplay(generatedAt))}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Report Type:</span>
            <span class="meta-value">Monthly Operations</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Time:</span>
            <span class="meta-value">${escapeHtml(formatTimeDisplay(generatedAt))}</span>
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-title">
            📈 MONTHLY PERFORMANCE SUMMARY
          </div>
          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-value">${monthlyReport.totalWorkRequests || 0}</div>
              <div class="summary-label">Total Requests</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${toNumber(monthlyReport.completedWork) || 0}</div>
              <div class="summary-label">Completed</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${monthlyReport.totalVehicles || 0}</div>
              <div class="summary-label">Vehicles Used</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${escapeHtml(formatRupees(monthlyReport.totalRevenue || 0))}</div>
              <div class="summary-label">Total Revenue</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${escapeHtml(formatRupees(monthlyReport.totalPaidAmount || 0))}</div>
              <div class="summary-label">Total Paid</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${escapeHtml(formatRupees(monthlyReport.totalPendingAmount || 0))}</div>
              <div class="summary-label">Pending Amount</div>
            </div>
            <div class="summary-card">
              <div class="summary-value">${escapeHtml(String(monthlyReport.totalUsersUtilized || 0))}</div>
              <div class="summary-label">Users Utilized</div>
            </div>
          </div>
          <div class="insights-grid">
            <div class="insight-item">
              <div class="insight-value">${completionRate}%</div>
              <div>Completion Rate</div>
            </div>
            <div class="insight-item">
              <div class="insight-value">${escapeHtml(formatRupees(avgDailyRevenue))}</div>
              <div>Avg Daily Revenue</div>
            </div>
          </div>
        </div>

        <h2 class="section-title">
          <span class="section-icon">📈</span>
          Daily Revenue Breakdown
        </h2>
        ${revenueEntries.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th style="width: 8%;">Day</th>
                <th style="width: 18%;">Date</th>
                <th style="width: 54%;">Revenue Chart</th>
                <th style="width: 20%;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${revenueByDayRows}
            </tbody>
          </table>
          <div style="margin-top: 12px; padding: 12px; background: #F0FDFA; border-radius: 8px; border-left: 4px solid #14B8A6;">
            <div style="font-weight: 700; color: #0F766E; margin-bottom: 6px;">💡 Revenue Insights</div>
            <div style="font-size: 10px; color: #374151; line-height: 1.5;">
              • Total Revenue Days: <strong>${revenueEntries.length}</strong><br/>
              • Highest Daily Revenue: <strong>${escapeHtml(formatRupees(maxRevenue))}</strong><br/>
              • Average Daily Revenue: <strong>${escapeHtml(formatRupees(avgDailyRevenue))}</strong>
            </div>
          </div>
        ` : `
          <div class="no-data">📭 No revenue data available for this month</div>
        `}

        <h2 class="section-title">
          <span class="section-icon">👥</span>
          User-wise Utilization & Pending Amount
        </h2>
        ${(monthlyReport.userBreakdown || []).length > 0 ? `
          <table>
            <thead>
              <tr>
                <th style="width: 6%;">S.No</th>
                <th style="width: 22%;">User</th>
                <th style="width: 14%;">Phone</th>
                <th style="width: 10%;">Works</th>
                <th style="width: 12%;">Utilization</th>
                <th style="width: 18%;">Paid</th>
                <th style="width: 18%;">Pending</th>
              </tr>
            </thead>
            <tbody>
              ${monthlyUserRows}
            </tbody>
          </table>
        ` : `
          <div class="no-data">📭 No user analytics for this month</div>
        `}

        <div class="footer">
          <div class="footer-line"><strong>MRS Earthmovers Management System</strong></div>
          <div class="footer-line">Comprehensive Monthly Business Report</div>
          <div class="footer-line">Generated on ${escapeHtml(formatDateDisplay(generatedAt))} at ${escapeHtml(formatTimeDisplay(generatedAt))}</div>
          <div class="footer-line" style="margin-top: 8px; font-style: italic;">
            This is a computer-generated report. For queries, contact administration.
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handleDownloadPDF = async () => {
    if (reportType === 'daily' && !dailyReport) {
      Alert.alert('Error', 'No daily report data available');
      return;
    }
    if (reportType === 'monthly' && !monthlyReport) {
      Alert.alert('Error', 'No monthly report data available');
      return;
    }

    setGenerating(true);
    try {
      const html = reportType === 'daily' ? buildDailyReportPDF() : buildMonthlyReportPDF();
      const generated = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(generated.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `MRS ${reportType === 'daily' ? 'Daily' : 'Monthly'} Report`
        });
      } else {
        Alert.alert('Success', `PDF generated at:\n${generated.uri}`);
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      Alert.alert('Error', 'Unable to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 24 }]}>
        <Text style={styles.headerTitle}>📊 Reports & Analytics</Text>
        <Text style={{ fontSize: 12, color: '#ffffff90', textAlign: 'center', marginTop: 4 }}>
          Comprehensive business insights and reports
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24, padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Report Type Selector */}
        <View style={localStyles.card}>
          <Text style={[styles.title, { marginBottom: 12 }]}>📑 Select Report Type</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[
                localStyles.reportTypeBtn,
                reportType === 'daily' && localStyles.reportTypeBtnActive
              ]}
              onPress={() => setReportType('daily')}
              activeOpacity={0.7}
            >
              <Text style={[
                localStyles.reportTypeBtnText,
                reportType === 'daily' && localStyles.reportTypeBtnTextActive
              ]}>
                📅 Daily
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                localStyles.reportTypeBtn,
                reportType === 'monthly' && localStyles.reportTypeBtnActive
              ]}
              onPress={() => setReportType('monthly')}
              activeOpacity={0.7}
            >
              <Text style={[
                localStyles.reportTypeBtnText,
                reportType === 'monthly' && localStyles.reportTypeBtnTextActive
              ]}>
                📆 Monthly
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date/Month Selector */}
        {reportType === 'daily' && (
          <View style={localStyles.card}>
            <Text style={[styles.title, { marginBottom: 12 }]}>📅 Select Date</Text>
            <TouchableOpacity
              style={localStyles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={localStyles.datePickerText}>
                {selectedDate.toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </Text>
              <Text style={{ fontSize: 18, color: '#fff' }}>📅</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
                maximumDate={new Date()}
              />
            )}
          </View>
        )}

        {reportType === 'monthly' && (
          <View style={localStyles.card}>
            <Text style={[styles.title, { marginBottom: 12 }]}>📆 Select Month & Year</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {MONTH_NAMES.map((month, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    localStyles.monthBtn,
                    selectedMonth === index + 1 && localStyles.monthBtnActive
                  ]}
                  onPress={() => setSelectedMonth(index + 1)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    localStyles.monthBtnText,
                    selectedMonth === index + 1 && localStyles.monthBtnTextActive
                  ]}>
                    {month.substring(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {[2026, 2025, 2024].map(year => (
                <TouchableOpacity
                  key={year}
                  style={[
                    localStyles.yearBtn,
                    selectedYear === year && localStyles.yearBtnActive
                  ]}
                  onPress={() => setSelectedYear(year)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    localStyles.yearBtnText,
                    selectedYear === year && localStyles.yearBtnTextActive
                  ]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Report Display */}
        {loading ? (
          <View style={localStyles.card}>
            <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
            <Text style={{ textAlign: 'center', marginTop: 12, color: PREMIUM_LIGHT.muted }}>
              Loading report data...
            </Text>
          </View>
        ) : reportType === 'daily' && dailyReport ? (
          <>
            {/* Daily Report Summary */}
            <View style={localStyles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={[styles.title, { marginBottom: 0 }]}>📊 Daily Summary</Text>
                <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, fontStyle: 'italic' }}>
                  {formatDateDisplay(dailyReport.date)}
                </Text>
              </View>
              
              <View style={localStyles.summaryGrid}>
                <View style={localStyles.summaryCard}>
                  <Text style={localStyles.summaryValue}>{dailyReport.totalWorkRequests || 0}</Text>
                  <Text style={localStyles.summaryLabel}>Total Requests</Text>
                </View>
                <View style={localStyles.summaryCard}>
                  <Text style={[localStyles.summaryValue, { color: '#4CAF50' }]}>
                    {toNumber(dailyReport.completedWork) || 0}
                  </Text>
                  <Text style={localStyles.summaryLabel}>Completed</Text>
                </View>
                <View style={localStyles.summaryCard}>
                  <Text style={localStyles.summaryValue}>{dailyReport.totalVehicles || 0}</Text>
                  <Text style={localStyles.summaryLabel}>Vehicles Used</Text>
                </View>
                <View style={localStyles.summaryCard}>
                  <Text style={[localStyles.summaryValue, { color: '#FF9800', fontSize: 16 }]}>
                    {formatRupees(dailyReport.totalRevenue || 0)}
                  </Text>
                  <Text style={localStyles.summaryLabel}>Collected Revenue</Text>
                </View>
              </View>

              <View style={localStyles.insightBox}>
                <Text style={{ fontSize: 11, color: '#0F766E', fontWeight: '700', marginBottom: 4 }}>
                  💡 Performance Insight
                </Text>
                <Text style={{ fontSize: 10, color: '#374151', lineHeight: 16 }}>
                  Completion Rate: <Text style={{ fontWeight: '700' }}>
                    {dailyReport.totalWorkRequests > 0 
                      ? ((toNumber(dailyReport.completedWork) / dailyReport.totalWorkRequests) * 100).toFixed(1) 
                      : '0.0'}%
                  </Text>
                  {'\n'}Billed (Completed Work): <Text style={{ fontWeight: '700' }}>
                    {formatRupees(dailyReport.billedRevenue || 0)}
                  </Text>
                </Text>
              </View>
              <View style={localStyles.summaryCard}>
                <Text style={[localStyles.summaryValue, { color: '#0EA5E9', fontSize: 16 }]}>
                  {formatRupees(dailyReport.totalPaidAmount || 0)}
                </Text>
                <Text style={localStyles.summaryLabel}>Paid Amount</Text>
              </View>
              <View style={localStyles.summaryCard}>
                <Text style={[localStyles.summaryValue, { color: '#EF4444', fontSize: 16 }]}> 
                  {formatRupees(dailyReport.totalPendingAmount || 0)}
                </Text>
                <Text style={localStyles.summaryLabel}>Pending Amount</Text>
              </View>
              <View style={localStyles.summaryCard}>
                <Text style={[localStyles.summaryValue, { color: '#7C3AED' }]}>
                  {toNumber(dailyReport.totalUsersUtilized) || 0}
                </Text>
                <Text style={localStyles.summaryLabel}>Users Utilized</Text>
              </View>
            </View>

            {/* User-wise Analytics */}
            <View style={localStyles.card}>
              <Text style={[styles.title, { marginBottom: 12 }]}>User-wise Analytics</Text>
              {dailyReport.userBreakdown && dailyReport.userBreakdown.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {dailyReport.userBreakdown.map((userRow, index) => (
                    <View key={userRow.userId || index} style={localStyles.workRequestItem}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: PREMIUM_LIGHT.text }}>
                          {userRow.userName || 'Unknown User'}
                        </Text>
                        <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>
                          Works: {toNumber(userRow.totalWorks)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.muted, marginBottom: 6 }}>
                        {userRow.phone || 'No phone'}
                      </Text>
                      <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.text }}>
                        Paid: <Text style={{ fontWeight: '700', color: '#0EA5E9' }}>{formatRupees(userRow.totalPaidAmount || 0)}</Text>
                        {'  '}Pending: <Text style={{ fontWeight: '700', color: '#EF4444' }}>{formatRupees(userRow.pendingAmount || 0)}</Text>
                      </Text>
                      <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.text, marginTop: 4 }}>
                        Completion: <Text style={{ fontWeight: '700' }}>{toNumber(userRow.utilizationRate || 0).toFixed(1)}%</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ textAlign: 'center', color: PREMIUM_LIGHT.muted, padding: 16 }}>
                  No user utilization data for this day
                </Text>
              )}
            </View>

            {/* Work Requests Details */}
            <View style={localStyles.card}>
              <Text style={[styles.title, { marginBottom: 12 }]}>📋 Work Requests</Text>
              {dailyReport.workRequests && dailyReport.workRequests.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {dailyReport.workRequests.map((wr, index) => {
                    const statusColor = 
                      wr.status === 'COMPLETED' ? '#4CAF50' :
                      wr.status === 'IN_PROGRESS' ? '#FF9800' :
                      wr.status === 'ASSIGNED' ? '#2196F3' : '#9E9E9E';
                    
                    return (
                      <View key={index} style={localStyles.workRequestItem}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: PREMIUM_LIGHT.text }}>
                            {wr.customer?.name || 'Unknown'}
                          </Text>
                          <View style={{ backgroundColor: statusColor, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>
                              {wr.status}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>
                          {wr.workType}
                        </Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.muted, flex: 1 }}>
                            Payable: {formatRupees(wr.totalPayableAmount || wr.actualCost || wr.estimatedCost || 0)}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#0EA5E9', fontWeight: '600', flex: 1, textAlign: 'center' }}>
                            Paid: {formatRupees(wr.paidAmount || 0)}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600', flex: 1, textAlign: 'right' }}>
                            Pending: {formatRupees(wr.pendingAmount || 0)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ textAlign: 'center', color: PREMIUM_LIGHT.muted, padding: 16 }}>
                  No work requests on this day
                </Text>
              )}
            </View>
          </>
        ) : reportType === 'monthly' && monthlyReport ? (
          <>
            {/* Monthly Report Summary */}
            <View style={localStyles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={[styles.title, { marginBottom: 0 }]}>📊 Monthly Summary</Text>
                <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.accent, fontWeight: '700' }}>
                  {MONTH_NAMES[monthlyReport.month - 1]} {monthlyReport.year}
                </Text>
              </View>
              
              <View style={localStyles.summaryGrid}>
                <View style={localStyles.summaryCard}>
                  <Text style={localStyles.summaryValue}>{monthlyReport.totalWorkRequests || 0}</Text>
                  <Text style={localStyles.summaryLabel}>Total Requests</Text>
                </View>
                <View style={localStyles.summaryCard}>
                  <Text style={[localStyles.summaryValue, { color: '#4CAF50' }]}>
                    {toNumber(monthlyReport.completedWork) || 0}
                  </Text>
                  <Text style={localStyles.summaryLabel}>Completed</Text>
                </View>
                <View style={localStyles.summaryCard}>
                  <Text style={localStyles.summaryValue}>{monthlyReport.totalVehicles || 0}</Text>
                  <Text style={localStyles.summaryLabel}>Vehicles Used</Text>
                </View>
                <View style={localStyles.summaryCard}>
                  <Text style={[localStyles.summaryValue, { color: '#FF9800', fontSize: 16 }]}>
                    {formatRupees(monthlyReport.totalRevenue || 0)}
                  </Text>
                  <Text style={localStyles.summaryLabel}>Revenue</Text>
                </View>
              </View>

              <View style={localStyles.insightBox}>
                <Text style={{ fontSize: 11, color: '#0F766E', fontWeight: '700', marginBottom: 4 }}>
                  💡 Monthly Insights
                </Text>
                <Text style={{ fontSize: 10, color: '#374151', lineHeight: 16 }}>
                  Completion Rate: <Text style={{ fontWeight: '700' }}>
                    {monthlyReport.totalWorkRequests > 0 
                      ? ((toNumber(monthlyReport.completedWork) / monthlyReport.totalWorkRequests) * 100).toFixed(1) 
                      : '0.0'}%
                  </Text>{'\n'}
                  Avg Daily Revenue: <Text style={{ fontWeight: '700' }}>
                    {formatRupees(
                      Object.keys(monthlyReport.revenueByDay || {}).length > 0
                        ? toNumber(monthlyReport.totalRevenue) / Object.keys(monthlyReport.revenueByDay).length
                        : 0
                    )}
                  </Text>
                </Text>
              </View>
              <View style={localStyles.summaryCard}>
                <Text style={[localStyles.summaryValue, { color: '#0EA5E9', fontSize: 16 }]}>
                  {formatRupees(monthlyReport.totalPaidAmount || 0)}
                </Text>
                <Text style={localStyles.summaryLabel}>Paid Amount</Text>
              </View>
              <View style={localStyles.summaryCard}>
                <Text style={[localStyles.summaryValue, { color: '#EF4444', fontSize: 16 }]}> 
                  {formatRupees(monthlyReport.totalPendingAmount || 0)}
                </Text>
                <Text style={localStyles.summaryLabel}>Pending Amount</Text>
              </View>
              <View style={localStyles.summaryCard}>
                <Text style={[localStyles.summaryValue, { color: '#7C3AED' }]}>
                  {toNumber(monthlyReport.totalUsersUtilized) || 0}
                </Text>
                <Text style={localStyles.summaryLabel}>Users Utilized</Text>
              </View>
            </View>

            {/* Revenue by Day */}
            <View style={localStyles.card}>
              <Text style={[styles.title, { marginBottom: 12 }]}>📈 Daily Revenue Breakdown</Text>
              {monthlyReport.revenueByDay && Object.keys(monthlyReport.revenueByDay).length > 0 ? (
                <View style={{ gap: 8 }}>
                  {Object.entries(monthlyReport.revenueByDay)
                    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
                    .map(([date, revenue]) => {
                      const maxRev = Math.max(...Object.values(monthlyReport.revenueByDay));
                      const percentage = (toNumber(revenue) / maxRev) * 100;
                      const barColor = percentage > 75 ? '#4CAF50' : percentage > 50 ? '#FF9800' : '#2196F3';
                      
                      return (
                        <View key={date} style={localStyles.revenueItem}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.text, fontWeight: '600' }}>
                              {formatDateDisplay(date)}
                            </Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2E7D32' }}>
                              {formatRupees(revenue)}
                            </Text>
                          </View>
                          <View style={{ height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                            <View style={{ height: '100%', width: `${percentage}%`, backgroundColor: barColor }} />
                          </View>
                        </View>
                      );
                    })}
                </View>
              ) : (
                <Text style={{ textAlign: 'center', color: PREMIUM_LIGHT.muted, padding: 16 }}>
                  No revenue data for this month
                </Text>
              )}
            </View>

            {/* Monthly User-wise Analytics */}
            <View style={localStyles.card}>
              <Text style={[styles.title, { marginBottom: 12 }]}>👥 User-wise Analytics</Text>
              {monthlyReport.userBreakdown && monthlyReport.userBreakdown.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {monthlyReport.userBreakdown.map((userRow, index) => (
                    <View key={userRow.userId || index} style={localStyles.workRequestItem}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: PREMIUM_LIGHT.text }}>
                          {userRow.userName || 'Unknown User'}
                        </Text>
                        <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>
                          Works: {toNumber(userRow.totalWorks)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.muted, marginBottom: 6 }}>
                        {userRow.phone || 'No phone'}
                      </Text>
                      <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.text }}>
                        Paid: <Text style={{ fontWeight: '700', color: '#0EA5E9' }}>{formatRupees(userRow.totalPaidAmount || 0)}</Text>
                        {'  '}Pending: <Text style={{ fontWeight: '700', color: '#EF4444' }}>{formatRupees(userRow.pendingAmount || 0)}</Text>
                      </Text>
                      <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.text, marginTop: 4 }}>
                        Completion: <Text style={{ fontWeight: '700' }}>{toNumber(userRow.utilizationRate || 0).toFixed(1)}%</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ textAlign: 'center', color: PREMIUM_LIGHT.muted, padding: 16 }}>
                  No user utilization data for this month
                </Text>
              )}
            </View>

            {/* Monthly Work Financials */}
            <View style={localStyles.card}>
              <Text style={[styles.title, { marginBottom: 12 }]}>💰 Work Financial Details</Text>
              {monthlyReport.workRequests && monthlyReport.workRequests.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {monthlyReport.workRequests.map((wr, index) => (
                    <View key={wr._id || index} style={localStyles.workRequestItem}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: PREMIUM_LIGHT.text, flex: 1 }} numberOfLines={1}>
                          {wr.customer?.name || 'Unknown'}
                        </Text>
                        <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.muted }}>
                          {formatDateDisplay(wr.createdAt)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginBottom: 6 }} numberOfLines={1}>
                        {wr.workType || '-'}
                      </Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.muted, flex: 1 }}>
                          Payable: {formatRupees(wr.totalPayableAmount || wr.actualCost || wr.estimatedCost || 0)}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#0EA5E9', fontWeight: '600', flex: 1, textAlign: 'center' }}>
                          Paid: {formatRupees(wr.paidAmount || 0)}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600', flex: 1, textAlign: 'right' }}>
                          Pending: {formatRupees(wr.pendingAmount || 0)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ textAlign: 'center', color: PREMIUM_LIGHT.muted, padding: 16 }}>
                  No work requests for this month
                </Text>
              )}
            </View>
          </>
        ) : (
          <View style={localStyles.card}>
            <Text style={{ textAlign: 'center', color: PREMIUM_LIGHT.muted, padding: 24 }}>
              No report data available
            </Text>
          </View>
        )}

        {/* Download PDF Button */}
        {((reportType === 'daily' && dailyReport) || (reportType === 'monthly' && monthlyReport)) && (
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: generating ? '#CCCCCC' : PREMIUM_LIGHT.accent,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 8
              }
            ]}
            onPress={handleDownloadPDF}
            disabled={generating}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#fff', fontSize: 18, marginRight: 8 }}>📄</Text>
            <Text style={[styles.buttonText, { fontSize: 15, fontWeight: '700' }]}>
              {generating ? 'Generating PDF...' : 'Download PDF Report'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: PREMIUM_LIGHT.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  reportTypeBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
    alignItems: 'center'
  },
  reportTypeBtnActive: {
    borderColor: PREMIUM_LIGHT.accent,
    backgroundColor: PREMIUM_LIGHT.accent
  },
  reportTypeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: PREMIUM_LIGHT.text
  },
  reportTypeBtnTextActive: {
    color: '#fff'
  },
  datePickerButton: {
    backgroundColor: PREMIUM_LIGHT.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  datePickerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  },
  monthBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
    minWidth: 55
  },
  monthBtnActive: {
    borderColor: PREMIUM_LIGHT.accent,
    backgroundColor: PREMIUM_LIGHT.accent
  },
  monthBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: PREMIUM_LIGHT.text,
    textAlign: 'center'
  },
  monthBtnTextActive: {
    color: '#fff'
  },
  yearBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5'
  },
  yearBtnActive: {
    borderColor: PREMIUM_LIGHT.accent,
    backgroundColor: PREMIUM_LIGHT.accent
  },
  yearBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: PREMIUM_LIGHT.text,
    textAlign: 'center'
  },
  yearBtnTextActive: {
    color: '#fff'
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  summaryCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CCFBF1'
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: PREMIUM_LIGHT.accent,
    marginBottom: 4
  },
  summaryLabel: {
    fontSize: 10,
    color: PREMIUM_LIGHT.muted,
    textAlign: 'center'
  },
  insightBox: {
    backgroundColor: '#F0FDFA',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#14B8A6'
  },
  workRequestItem: {
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: PREMIUM_LIGHT.accent
  },
  revenueItem: {
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 12
  }
});

export default AdminReports;