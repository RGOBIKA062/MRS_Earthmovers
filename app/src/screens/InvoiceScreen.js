import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import styles from '../styles/styles';
import apiService from '../services/apiService';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRupees = (value) => {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

export default function InvoiceScreen({ route, navigation }) {
  const workRequestId = route?.params?.workRequestId;
  const [loading, setLoading] = useState(true);
  const [workRequest, setWorkRequest] = useState(null);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    const fetchInvoiceDetails = async () => {
      if (!workRequestId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [wrRes, payRes] = await Promise.all([
          apiService.getWorkRequest(workRequestId),
          apiService.getPaymentsByCustomer()
        ]);

        const wr = wrRes?.data?.data || null;
        const allPayments = Array.isArray(payRes?.data?.data) ? payRes.data.data : [];
        const wrPayments = allPayments.filter((p) => String(p.workRequest) === String(workRequestId));

        setWorkRequest(wr);
        setPayments(wrPayments);
      } catch (error) {
        console.error('Invoice load error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoiceDetails();
  }, [workRequestId]);

  const invoiceSummary = useMemo(() => {
    if (!workRequest) {
      return {
        hourlyRate: 0,
        expectedHours: 0,
        actualHoursWorked: 0,
        estimatedCost: 0,
        payableAmount: 0,
        paidAmount: 0,
        dueAmount: 0
      };
    }

    const billed = workRequest.billingSummary || {};
    const payableAmount = toNumber(
      billed.payableAmount ?? workRequest.payableAmount ?? workRequest.actualCost ?? workRequest.estimatedCost
    );
    const paidAmount = payments
      .filter((p) => ['SUCCESS', 'COMPLETED'].includes(String(p.status || '').toUpperCase()))
      .reduce((sum, p) => sum + toNumber(p.amount), 0);
    const dueAmount = Math.max(0, payableAmount - paidAmount);

    return {
      hourlyRate: toNumber(billed.hourlyRate),
      expectedHours: toNumber(billed.expectedHours ?? workRequest.expectedDuration),
      actualHoursWorked: toNumber(billed.actualHoursWorked),
      estimatedCost: toNumber(billed.estimatedCost ?? workRequest.estimatedCost),
      payableAmount,
      paidAmount,
      dueAmount
    };
  }, [workRequest, payments]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading invoice...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Invoice</Text>
        <Text style={{ fontSize: 16, color: '#fff', textAlign: 'center', marginTop: 8 }}>
          {workRequestId ? `Work Request: ${workRequestId}` : 'Work Request not provided'}
        </Text>
      </View>

      {!workRequest ? (
        <View style={styles.card}>
          <Text style={styles.title}>Invoice unavailable</Text>
          <Text style={styles.subtitle}>Unable to load work details for this invoice.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.card}>
            <Text style={styles.title}>Work & Timeline</Text>
            <Text style={styles.subtitle}>Work Type: {workRequest.workType}</Text>
            <Text style={styles.subtitle}>Address: {workRequest.location?.address || 'N/A'}</Text>
            <Text style={styles.subtitle}>Scheduled Start: {workRequest.startDate ? new Date(workRequest.startDate).toLocaleString() : 'N/A'}</Text>
            <Text style={styles.subtitle}>Scheduled End: {workRequest.endDate ? new Date(workRequest.endDate).toLocaleString() : 'N/A'}</Text>
            <Text style={styles.subtitle}>Work Started: {workRequest.assignmentStartTime ? new Date(workRequest.assignmentStartTime).toLocaleString() : 'N/A'}</Text>
            <Text style={styles.subtitle}>Work Ended: {workRequest.assignmentEndTime ? new Date(workRequest.assignmentEndTime).toLocaleString() : 'N/A'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Billing Details</Text>
            <Text style={styles.subtitle}>Hourly Rate: {formatRupees(invoiceSummary.hourlyRate)}/hr</Text>
            <Text style={styles.subtitle}>Expected Hours: {invoiceSummary.expectedHours}</Text>
            <Text style={styles.subtitle}>Worked Hours: {invoiceSummary.actualHoursWorked || invoiceSummary.expectedHours}</Text>
            <Text style={styles.subtitle}>Estimated Cost: {formatRupees(invoiceSummary.estimatedCost)}</Text>
            <Text style={[styles.subtitle, { fontWeight: '700' }]}>Payable Amount: {formatRupees(invoiceSummary.payableAmount)}</Text>
            <Text style={styles.subtitle}>Paid Amount: {formatRupees(invoiceSummary.paidAmount)}</Text>
            <Text style={[styles.subtitle, { fontWeight: '900', color: invoiceSummary.dueAmount > 0 ? '#D32F2F' : '#2E7D32' }]}>
              Due Amount: {formatRupees(invoiceSummary.dueAmount)}
            </Text>
            <Text style={styles.subtitle}>Payment Status: {workRequest.paymentStatus || 'PENDING'}</Text>
          </View>

          {invoiceSummary.dueAmount > 0 ? (
            <TouchableOpacity
              style={[styles.button, { marginHorizontal: 16 }]}
              onPress={() => navigation.navigate('Payment', {
                workRequestId,
                dueAmount: invoiceSummary.dueAmount,
                source: 'Invoice'
              })}
            >
              <Text style={styles.buttonText}>Pay Due Amount</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.card, { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }]}>
              <Text style={[styles.title, { color: '#2E7D32' }]}>Payment Complete</Text>
              <Text style={styles.subtitle}>This invoice is fully paid.</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.button, styles.buttonSecondary, { marginHorizontal: 16 }]} onPress={() => navigation.goBack()}>
            <Text style={styles.buttonTextOnDark}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}
