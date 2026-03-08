import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, Alert, TouchableOpacity, TextInput, ScrollView, Modal } from 'react-native';
import WebView from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/styles';
import apiService from '../services/apiService';
import { PREMIUM_LIGHT } from '../styles/tokens';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRupees = (value) => {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDatePart = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatTimePart = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// Installment preset percentages
const INSTALLMENT_OPTIONS = [
  { label: 'Pay Full Amount', percentage: 100 },
  { label: 'Pay 50% (Half)', percentage: 50 },
  { label: 'Pay 25% (Quarter)', percentage: 25 },
  { label: 'Pay 10% (Advance)', percentage: 10 }
];

const RAZORPAY_KEY_ID = 'rzp_test_SNxVl3bVPmBlzI';

export default function PaymentScreen({ route, navigation }) {
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [dueWorkRequests, setDueWorkRequests] = useState([]);
  const [selectedWorkRequestId, setSelectedWorkRequestId] = useState(route?.params?.workRequestId || null);
  const [amount, setAmount] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showInstallmentOptions, setShowInstallmentOptions] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentHtml, setPaymentHtml] = useState('');
  const [currentPaymentId, setCurrentPaymentId] = useState(null);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const webViewRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchPaymentData();
  }, [route?.params?.workRequestId, route?.params?.dueAmount]);

  const fetchPaymentData = async () => {
    setLoading(true);
    try {
      const [paymentsRes, dueRes] = await Promise.all([
        apiService.getPaymentsByCustomer(),
        apiService.getDueWorkRequests()
      ]);

      const paymentRows = paymentsRes?.data?.data || [];
      const dueRows = dueRes?.data?.data || [];

      setPayments(paymentRows);
      setDueWorkRequests(dueRows);

      const requestedWorkRequestId = route?.params?.workRequestId || null;
      if (requestedWorkRequestId) {
        const requestedDue = dueRows.find((row) => String(row.workRequestId) === String(requestedWorkRequestId));
        setSelectedWorkRequestId(requestedWorkRequestId);
        if (requestedDue?.dueAmount > 0) {
          setAmount(String(requestedDue.dueAmount));
        } else if (route?.params?.dueAmount) {
          setAmount(String(toNumber(route.params.dueAmount)));
        }
      }
    } catch (e) {
      console.error('Fetch payment data error:', e);
    }
    setLoading(false);
  };

  const selectedDue = dueWorkRequests.find((row) => String(row.workRequestId) === String(selectedWorkRequestId));
  const maxPayable = selectedDue ? toNumber(selectedDue.dueAmount) : 0;

  const onSelectWorkRequest = (workRequestId) => {
    setSelectedWorkRequestId(workRequestId);
    const due = dueWorkRequests.find((row) => String(row.workRequestId) === String(workRequestId));
    if (due?.dueAmount > 0) {
      setAmount(String(due.dueAmount));
      setShowInstallmentOptions(true);
    } else {
      setAmount('');
      setShowInstallmentOptions(false);
    }
  };

  const selectInstallmentAmount = (percentage) => {
    if (maxPayable > 0) {
      const installmentAmount = Math.round((maxPayable * percentage) / 100);
      setAmount(String(installmentAmount));
    }
  };

  const handlePayment = async () => {
    const payableAmount = toNumber(amount);
    if (!payableAmount || payableAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (selectedWorkRequestId && maxPayable > 0 && payableAmount > maxPayable) {
      Alert.alert('Error', `Amount cannot exceed due amount (${formatRupees(maxPayable)})`);
      return;
    }

    const paymentDescription = selectedDue
      ? `Payment for ${selectedDue.workType} (${selectedDue.workRequestId})`
      : `Payment for MRS Earthmovers - ${user.name}`;

    setProcessingPayment(true);

    try {
      console.log('Creating Razorpay order for amount:', payableAmount);
      
      // Create Razorpay order
      const orderResponse = await apiService.createRazorpayOrder(
        payableAmount,
        selectedWorkRequestId,
        paymentDescription
      );

      console.log('Order response:', orderResponse);

      const orderPayload = orderResponse?.data?.data || orderResponse?.data || {};
      const orderId = orderPayload.orderId || orderPayload.id;
      const paymentId = orderPayload.paymentId || orderPayload._id;
      const currency = String(orderPayload.currency || 'INR').toUpperCase();

      console.log('Extracted orderId:', orderId, 'paymentId:', paymentId);

      if (!orderId || !paymentId) {
        setProcessingPayment(false);
        Alert.alert('Error', 'Failed to create order. Please try again.');
        return;
      }
      
      setCurrentOrderId(orderId);
      setCurrentPaymentId(paymentId);

      // Create HTML for Razorpay payment
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://checkout.razorpay.com/v1/checkout.js"><\/script>
          <style>
            body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
            .container { max-width: 500px; margin: 0 auto; text-align: center; }
            .spinner { display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .info { margin-top: 20px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <div class="info">Opening Razorpay Checkout...</div>
          </div>
          <script>
            try {
              const options = {
                key: '${RAZORPAY_KEY_ID}',
                amount: ${Math.round(payableAmount * 100)},
                currency: '${currency}',
                name: 'MRS Earthmovers',
                description: '${paymentDescription}',
                order_id: '${orderId}',
                prefill: {
                  name: '${user.name || ''}',
                  email: '${user.email || ''}',
                  contact: '${user.phone || ''}'
                },
                handler: function(response) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'payment_success',
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_signature: response.razorpay_signature
                  }));
                },
                modal: {
                  ondismiss: function() {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'payment_cancelled'
                    }));
                  }
                }
              };
              
              if (typeof Razorpay === 'undefined') {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'error',
                  message: 'Razorpay not loaded'
                }));
              } else {
                const rzp = new Razorpay(options);
                rzp.open();
              }
            } catch (e) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: e.message
              }));
            }
          </script>
        </body>
        </html>
      `;

      setPaymentHtml(htmlContent);
      setShowPaymentModal(true);
      
      // Safety timeout: if no response in 60 seconds, reset processing state
      setTimeout(() => {
        if (processingPayment) {
          console.log('Payment timeout - resetting state');
          setProcessingPayment(false);
        }
      }, 60000);
    } catch (error) {
      console.error('Order creation error:', error?.response || error);
      setProcessingPayment(false);
      const msg = error?.response?.data?.message || error?.message || 'Failed to create payment order. Please try again.';
      Alert.alert('Error', msg);
    }
  };

  const handleWebViewMessage = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      console.log('WebView message:', message);

      if (message.type === 'error') {
        setShowPaymentModal(false);
        setProcessingPayment(false);
        Alert.alert('Error', message.message || 'Something went wrong with the payment');
        return;
      }
      
      if (message.type === 'payment_success') {
        // Verify payment on backend
        try {
          await apiService.verifyRazorpayPayment(
            message.razorpay_order_id,
            message.razorpay_payment_id,
            message.razorpay_signature,
            currentPaymentId
          );

          setShowPaymentModal(false);
          setProcessingPayment(false);
          Alert.alert(
            '✓ Payment Successful',
            `${formatRupees(toNumber(amount))} paid successfully`,
            [{
              text: 'OK',
              onPress: () => {
                setAmount('');
                fetchPaymentData();
              }
            }]
          );
        } catch (verifyError) {
          console.error('Verification error:', verifyError);
          setShowPaymentModal(false);
          setProcessingPayment(false);
          Alert.alert(
            'Payment Received',
            'Your payment was received. It may take a few moments to reflect.',
            [{
              text: 'OK',
              onPress: () => {
                setAmount('');
                fetchPaymentData();
              }
            }]
          );
        }
      } else if (message.type === 'payment_cancelled') {
        setShowPaymentModal(false);
        setProcessingPayment(false);
        Alert.alert('Payment Cancelled', 'You cancelled the payment');
      }
    } catch (error) {
      console.error('WebView message error:', error);
      setShowPaymentModal(false);
      setProcessingPayment(false);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const buildPaymentReportHtml = () => {
    const generatedAt = new Date();
    const tableRows = payments.map((item, index) => {
      const workId = item.workRequest ? String(item.workRequest).slice(-8).toUpperCase() : '-';
      const amountPaid = formatRupees(item.amount);
      const status = item.status || '-';
      const method = item.paymentMethod || 'UPI';
      const date = formatDatePart(item.createdAt);
      const time = formatTimePart(item.createdAt);

      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(workId)}</td>
          <td class="amount">${escapeHtml(amountPaid)}</td>
          <td class="center">${escapeHtml(status)}</td>
          <td class="center">${escapeHtml(method)}</td>
          <td class="center">${escapeHtml(date)}</td>
          <td class="center">${escapeHtml(time)}</td>
        </tr>
      `;
    }).join('');

    const totalAmount = payments.reduce((sum, item) => sum + toNumber(item.amount), 0);

    // Work Request Status Section
    const workRequestRows = dueWorkRequests.map((item, index) => {
      const workId = String(item.workRequestId).slice(-8).toUpperCase();
      const totalAmt = formatRupees(item.payableAmount);
      const paidAmt = formatRupees(item.paidAmount);
      const dueAmt = formatRupees(item.dueAmount);
      const paymentProgress = ((toNumber(item.paidAmount) / toNumber(item.payableAmount)) * 100).toFixed(1);
      const progressColor = paymentProgress >= 75 ? '#4CAF50' : paymentProgress >= 50 ? '#FF9800' : '#F44336';

      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(workId)}</td>
          <td>${escapeHtml(item.workType)}</td>
          <td class="amount">${escapeHtml(totalAmt)}</td>
          <td class="amount" style="color: #2E7D32; font-weight: 600;">${escapeHtml(paidAmt)}</td>
          <td class="amount" style="color: ${toNumber(item.dueAmount) > 0 ? '#D32F2F' : '#2E7D32'}; font-weight: 700;">${escapeHtml(dueAmt)}</td>
          <td class="center" style="color: ${progressColor}; font-weight: 600;">${paymentProgress}%</td>
        </tr>
      `;
    }).join('');

    const totalDueAmount = dueWorkRequests.reduce((sum, item) => sum + toNumber(item.dueAmount), 0);
    const totalPayableAmount = dueWorkRequests.reduce((sum, item) => sum + toNumber(item.payableAmount), 0);
    const totalPaidAmount = dueWorkRequests.reduce((sum, item) => sum + toNumber(item.paidAmount), 0);

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
            margin: 24px;
            color: #1F2937;
          }
          .header {
            border-bottom: 2px solid #0F766E;
            padding-bottom: 12px;
            margin-bottom: 18px;
          }
          .title {
            margin: 0;
            font-size: 24px;
            color: #0F766E;
            letter-spacing: 0.4px;
            text-align: center;
            font-weight: 700;
          }
          .subtitle {
            margin: 6px 0 0;
            text-align: center;
            color: #4B5563;
            font-size: 12px;
          }
          .meta {
            display: table;
            width: 100%;
            margin: 14px 0 18px;
            border: 1px solid #D1D5DB;
            border-collapse: collapse;
          }
          .meta-row {
            display: table-row;
          }
          .meta-cell {
            display: table-cell;
            border: 1px solid #D1D5DB;
            padding: 8px 10px;
            font-size: 12px;
          }
          .meta-label {
            color: #374151;
            font-weight: 700;
            width: 22%;
            background: #F9FAFB;
          }
          .meta-value {
            color: #111827;
            width: 28%;
          }
          .summary {
            margin: 0 0 14px;
            font-size: 13px;
            color: #374151;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 11px;
          }
          th, td {
            border: 1px solid #D1D5DB;
            padding: 8px 6px;
            vertical-align: middle;
            word-wrap: break-word;
          }
          th {
            background: #0F766E;
            color: #FFFFFF;
            text-transform: uppercase;
            letter-spacing: 0.2px;
            font-size: 10px;
          }
          .center { text-align: center; }
          .amount { text-align: right; font-weight: 700; }
          .section-title {
            margin: 20px 0 10px;
            font-size: 15px;
            font-weight: 700;
            color: #0F766E;
            border-bottom: 2px solid #0F766E;
            padding-bottom: 6px;
          }
          .summary-box {
            background: #F0FDFA;
            border: 2px solid #0F766E;
            border-radius: 8px;
            padding: 12px;
            margin: 12px 0;
            display: table;
            width: 100%;
          }
          .summary-row {
            display: table-row;
          }
          .summary-label {
            display: table-cell;
            padding: 6px 8px;
            font-size: 12px;
            color: #374151;
            font-weight: 600;
          }
          .summary-value {
            display: table-cell;
            padding: 6px 8px;
            font-size: 12px;
            text-align: right;
            font-weight: 700;
          }
          .footer {
            margin-top: 16px;
            font-size: 11px;
            color: #6B7280;
            text-align: right;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">MRS Earthmovers</h1>
          <p class="subtitle">Customer Payment Report</p>
        </div>

        <div class="meta">
          <div class="meta-row">
            <div class="meta-cell meta-label">Customer Name</div>
            <div class="meta-cell meta-value">${escapeHtml(user?.name || '-')}</div>
            <div class="meta-cell meta-label">Generated Date</div>
            <div class="meta-cell meta-value">${escapeHtml(formatDatePart(generatedAt))}</div>
          </div>
          <div class="meta-row">
            <div class="meta-cell meta-label">Customer Email</div>
            <div class="meta-cell meta-value">${escapeHtml(user?.email || '-')}</div>
            <div class="meta-cell meta-label">Generated Time</div>
            <div class="meta-cell meta-value">${escapeHtml(formatTimePart(generatedAt))}</div>
          </div>
          <div class="meta-row">
            <div class="meta-cell meta-label">Total Payments</div>
            <div class="meta-cell meta-value">${escapeHtml(String(payments.length))}</div>
            <div class="meta-cell meta-label">Total Amount Sent</div>
            <div class="meta-cell meta-value">${escapeHtml(formatRupees(totalAmount))}</div>
          </div>
        </div>

        <h2 class="section-title">📋 Work Requests & Pending Amounts</h2>

        ${dueWorkRequests.length > 0 ? `
          <div class="summary-box">
            <div class="summary-row">
              <div class="summary-label">Total Payable Amount:</div>
              <div class="summary-value">${escapeHtml(formatRupees(totalPayableAmount))}</div>
            </div>
            <div class="summary-row">
              <div class="summary-label">Total Amount Paid:</div>
              <div class="summary-value" style="color: #2E7D32;">${escapeHtml(formatRupees(totalPaidAmount))}</div>
            </div>
            <div class="summary-row">
              <div class="summary-label">Total Pending Amount:</div>
              <div class="summary-value" style="color: ${totalDueAmount > 0 ? '#D32F2F' : '#2E7D32'}; font-size: 14px;">${escapeHtml(formatRupees(totalDueAmount))}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 6%;">S.No</th>
                <th style="width: 12%;">Work ID</th>
                <th style="width: 24%;">Work Type</th>
                <th style="width: 16%;">Total Amount</th>
                <th style="width: 16%;">Paid</th>
                <th style="width: 16%;">Pending</th>
                <th style="width: 10%;">Progress</th>
              </tr>
            </thead>
            <tbody>
              ${workRequestRows}
            </tbody>
          </table>
        ` : `
          <p style="text-align: center; color: #2E7D32; padding: 16px; background: #E8F5E9; border-radius: 8px; font-weight: 600;">
            ✓ No pending work requests. All payments cleared!
          </p>
        `}

        <h2 class="section-title">📜 Payment Transaction History</h2>

        <p class="summary">The following table lists all sent amounts with proper date and time details.</p>

        <table>
          <thead>
            <tr>
              <th style="width: 8%;">S.No</th>
              <th style="width: 14%;">Work ID</th>
              <th style="width: 18%;">Amount Sent</th>
              <th style="width: 14%;">Status</th>
              <th style="width: 14%;">Method</th>
              <th style="width: 16%;">Date</th>
              <th style="width: 16%;">Time</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="7" class="center">No payment data available</td></tr>'}
          </tbody>
        </table>

        <div class="footer">Generated by MRS Earthmovers Payment System</div>
      </body>
      </html>
    `;
  };

  const handleDownloadPdf = async () => {
    if (!payments.length) {
      Alert.alert('Info', 'No payment history available to export');
      return;
    }

    try {
      const html = buildPaymentReportHtml();
      const generated = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(generated.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Download Payment Report'
        });
      } else {
        Alert.alert('Success', `PDF generated at:\n${generated.uri}`);
      }
    } catch (error) {
      console.error('PDF export error:', error);
      Alert.alert('Error', 'Unable to generate PDF right now. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 24 }]}>
        <Text style={styles.headerTitle}>💳 Make a Payment</Text>
        <Text style={{ fontSize: 12, color: '#ffffff90', textAlign: 'center', marginTop: 4 }}>
          Secure payments powered by Razorpay
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24, padding: 16 }}
      >
        {/* Work Requests Section */}
        <View style={styles.card}>
          <Text style={[styles.title, { marginBottom: 16 }]}>📋 Work Requests</Text>

          {loading ? (
            <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          ) : dueWorkRequests.length === 0 ? (
            <View style={{ backgroundColor: '#E8F5E9', padding: 16, borderRadius: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>✓</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2E7D32', marginBottom: 4 }}>All Cleared!</Text>
              <Text style={{ fontSize: 13, color: '#558B2F', textAlign: 'center' }}>
                No pending dues at the moment.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {dueWorkRequests.map((item) => {
                const selected = String(item.workRequestId) === String(selectedWorkRequestId);
                const paymentProgress = (toNumber(item.paidAmount) / toNumber(item.payableAmount)) * 100;
                const progressColor = paymentProgress >= 75 ? '#4CAF50' : paymentProgress >= 50 ? '#FF9800' : '#F44336';

                return (
                  <TouchableOpacity
                    key={String(item.workRequestId)}
                    style={{
                      borderWidth: 2,
                      borderColor: selected ? PREMIUM_LIGHT.accent : '#E0E0E0',
                      borderRadius: 16,
                      padding: 16,
                      backgroundColor: '#FAFAFA'
                    }}
                    onPress={() => onSelectWorkRequest(item.workRequestId)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: PREMIUM_LIGHT.text, marginBottom: 4 }}>
                          {item.workType}
                        </Text>
                        <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>
                          ID: {String(item.workRequestId).slice(-8).toUpperCase()}
                        </Text>
                      </View>
                      {selected && (
                        <View style={{ backgroundColor: PREMIUM_LIGHT.accent, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>✓</Text>
                        </View>
                      )}
                    </View>

                    {/* Payment Progress Bar */}
                    <View style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>Payment Progress</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: progressColor }}>
                          {paymentProgress.toFixed(0)}%
                        </Text>
                      </View>
                      <View style={{ height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${paymentProgress}%`, backgroundColor: progressColor }} />
                      </View>
                    </View>

                    {/* Payment Breakdown */}
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted }}>Total Amount:</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: PREMIUM_LIGHT.text }}>
                          {formatRupees(item.payableAmount)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: '#2E7D32' }}>✓ Paid:</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#2E7D32' }}>
                          {formatRupees(item.paidAmount)}
                        </Text>
                      </View>
                      <View style={{ height: 1, backgroundColor: '#E0E0E0' }} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#D32F2F' }}>Due Amount:</Text>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#D32F2F' }}>
                          {formatRupees(item.dueAmount)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Installment Options */}
        {showInstallmentOptions && selectedDue && maxPayable > 0 && (
          <View style={styles.card}>
            <Text style={[styles.title, { marginBottom: 12 }]}>💰 Quick Payment Options</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {INSTALLMENT_OPTIONS.map((option) => {
                const installmentAmt = Math.round((maxPayable * option.percentage) / 100);
                const isSelected = String(amount) === String(installmentAmt);
                return (
                  <TouchableOpacity
                    key={option.percentage}
                    style={{
                      flex: option.percentage === 100 ? 1 : 0,
                      minWidth: option.percentage === 100 ? '100%' : '48%',
                      backgroundColor: isSelected ? PREMIUM_LIGHT.accent : (option.percentage === 100 ? PREMIUM_LIGHT.accent : '#F5F5F5'),
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? PREMIUM_LIGHT.accent : (option.percentage === 100 ? PREMIUM_LIGHT.accent : '#E0E0E0'),
                      alignItems: 'center'
                    }}
                    onPress={() => {
                      selectInstallmentAmount(option.percentage);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ 
                      fontSize: option.percentage === 100 ? 14 : 12,
                      fontWeight: option.percentage === 100 ? '700' : '600',
                      color: isSelected || option.percentage === 100 ? '#fff' : PREMIUM_LIGHT.text,
                      marginBottom: 4
                    }}>
                      {option.label}
                    </Text>
                    <Text style={{ 
                      fontSize: 16, 
                      fontWeight: '700', 
                      color: isSelected || option.percentage === 100 ? '#fff' : PREMIUM_LIGHT.accent
                    }}>
                      {formatRupees(installmentAmt)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginTop: 12, textAlign: 'center', fontStyle: 'italic' }}>
              💡 Tip: Click any option to set the amount quickly
            </Text>
          </View>
        )}

        {/* Payment Amount Input */}
        <View style={styles.card}>
          <Text style={[styles.title, { marginBottom: 12 }]}>💵 Enter Payment Amount</Text>
          
          <View style={{ position: 'relative' }}>
            <TextInput
              style={[styles.input, { 
                fontSize: 18,
                fontWeight: '600',
                textAlign: 'center',
                paddingVertical: 12,
                borderWidth: 2,
                borderColor: amount ? PREMIUM_LIGHT.accent : '#E0E0E0'
              }]}
              placeholder="₹ 0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholderTextColor={PREMIUM_LIGHT.muted}
            />
          </View>

          {selectedDue && toNumber(selectedDue.dueAmount) > 0 && (
            <View style={{ marginTop: 12, backgroundColor: '#FFF3E0', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#FF9800' }}>
              <Text style={{ fontSize: 12, color: '#E65100', fontWeight: '600' }}>
                ⚠️ Maximum payable for this work: {formatRupees(selectedDue.dueAmount)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.button, 
              { 
                marginTop: 16,
                paddingVertical: 14,
                backgroundColor: (!amount || processingPayment) ? '#CCCCCC' : PREMIUM_LIGHT.accent,
                shadowColor: PREMIUM_LIGHT.accent,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 6
              }
            ]}
            onPress={handlePayment}
            disabled={processingPayment || !amount}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, { fontSize: 15, fontWeight: '700' }]}>
              {processingPayment ? 'Processing...' : 'Pay with Razorpay'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Payment History */}
        <View style={styles.card}>
          <Text style={[styles.title, { marginBottom: 16 }]}>📜 Recent Payment History</Text>
          {loading ? (
            <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          ) : payments.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>📋</Text>
              <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.muted, textAlign: 'center' }}>
                No payment history found.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {payments.slice(currentPage * 5, (currentPage * 5) + 5).map((item, index) => {
                const statusColor = 
                  item.status === 'SUCCESS' || item.status === 'COMPLETED' ? '#4CAF50' :
                  item.status === 'PENDING' ? '#FF9800' : '#F44336';
                
                return (
                  <View 
                    key={item._id}
                    style={{ 
                      backgroundColor: '#FAFAFA',
                      borderRadius: 12,
                      padding: 14,
                      borderLeftWidth: 4,
                      borderLeftColor: statusColor
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: PREMIUM_LIGHT.text }}>
                        {formatRupees(item.amount)}
                      </Text>
                      <View style={{ 
                        backgroundColor: statusColor, 
                        paddingHorizontal: 10, 
                        paddingVertical: 4, 
                        borderRadius: 12 
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>
                          {item.status}
                        </Text>
                      </View>
                    </View>
                    
                    {item.workRequest && (
                      <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>
                        Work ID: {String(item.workRequest).slice(-8).toUpperCase()}
                      </Text>
                    )}
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>
                        {new Date(item.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </Text>
                      <Text style={{ fontSize: 10, color: PREMIUM_LIGHT.muted, fontStyle: 'italic' }}>
                        {item.paymentMethod || 'UPI'}
                      </Text>
                    </View>
                  </View>
                );
              })}
              
              {payments.length > 5 && (
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  marginTop: 12,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  backgroundColor: '#F5F5F5',
                  borderRadius: 8
                }}>
                  <TouchableOpacity 
                    onPress={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                    style={{ 
                      padding: 8,
                      opacity: currentPage === 0 ? 0.3 : 1
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 20, color: PREMIUM_LIGHT.accent, fontWeight: 'bold' }}>
                      ◀
                    </Text>
                  </TouchableOpacity>
                  
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.text, fontWeight: '600' }}>
                    Showing {currentPage * 5 + 1}-{Math.min((currentPage + 1) * 5, payments.length)} of {payments.length} payments
                  </Text>
                  
                  <TouchableOpacity 
                    onPress={() => setCurrentPage(Math.min(Math.floor((payments.length - 1) / 5), currentPage + 1))}
                    disabled={currentPage >= Math.floor((payments.length - 1) / 5)}
                    style={{ 
                      padding: 8,
                      opacity: currentPage >= Math.floor((payments.length - 1) / 5) ? 0.3 : 1
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 20, color: PREMIUM_LIGHT.accent, fontWeight: 'bold' }}>
                      ▶
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <View style={{ marginTop: 16, alignItems: 'flex-end' }}>
            <TouchableOpacity
              onPress={handleDownloadPdf}
              disabled={loading || !payments.length}
              style={{
                backgroundColor: loading || !payments.length ? '#D1D5DB' : '#0F766E',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                minWidth: 134,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12, marginRight: 6 }}>⬇</Text>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>Download PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Help Section */}
      </ScrollView>

      {/* Razorpay Payment Modal */}
      <Modal
        visible={showPaymentModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowPaymentModal(false);
          setProcessingPayment(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: PREMIUM_LIGHT.text }}>Complete Payment</Text>
            <TouchableOpacity onPress={() => {
              setShowPaymentModal(false);
              setProcessingPayment(false);
              Alert.alert('Cancelled', 'Payment was cancelled');
            }}>
              <Text style={{ fontSize: 24, color: PREMIUM_LIGHT.muted }}>×</Text>
            </TouchableOpacity>
          </View>
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: paymentHtml }}
            onMessage={handleWebViewMessage}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('WebView error:', nativeEvent);
              setShowPaymentModal(false);
              setProcessingPayment(false);
              Alert.alert('Error', 'Failed to load payment page. Please try again.');
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('WebView HTTP error:', nativeEvent.statusCode);
            }}
            style={{ flex: 1 }}
            startInLoadingState={true}
            renderLoading={() => <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            scalesPageToFit={true}
          />
        </View>
      </Modal>
    </View>
  );
}
