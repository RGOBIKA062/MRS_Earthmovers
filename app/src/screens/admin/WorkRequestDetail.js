import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const WorkRequestDetail = ({ route, navigation }) => {
  const workRequestId = route?.params?.workRequestId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [workRequest, setWorkRequest] = useState(null);
  const [updateUI, setUpdateUI] = useState(0);

  const fetchWorkRequest = async () => {
    if (!workRequestId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await apiService.getWorkRequest(workRequestId);
      setWorkRequest(response?.data?.data || null);
    } catch (error) {
      console.error('Error fetching work request:', error);
      Alert.alert('Error', 'Failed to load work request details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkRequest();
  }, [workRequestId]);

  useFocusEffect(
    useCallback(() => {
      if (updateUI) {
        fetchWorkRequest();
        setUpdateUI(0);
      }
    }, [updateUI])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWorkRequest();
    setRefreshing(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING':
        return PREMIUM_LIGHT.accent;
      case 'ASSIGNED':
        return PREMIUM_LIGHT.info;
      case 'IN_PROGRESS':
        return '#4CAF50';
      case 'COMPLETED':
        return '#4CAF50';
      case 'CANCELLED':
        return '#F44336';
      default:
        return PREMIUM_LIGHT.muted;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'ASSIGNED':
        return 'Assigned';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!workRequest) return;

    Alert.alert(
      'Confirm Status Update',
      `Are you sure you want to change status to ${newStatus}?`,
      [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              setSubmitting(true);
              await apiService.updateWorkRequestStatus(workRequestId, {
                status: newStatus,
              });
              Alert.alert('Success', 'Work status updated successfully');
              setUpdateUI(1);
            } catch (error) {
              Alert.alert('Error', error?.response?.data?.message || 'Failed to update status');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const openPhoneCall = (phone) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Error', 'Could not open phone call');
    });
  };

  const openEmail = (email) => {
    Linking.openURL(`mailto:${email}`).catch(() => {
      Alert.alert('Error', 'Could not open email');
    });
  };

  if (!workRequestId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Work Request</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.subtitle}>Invalid work request ID</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
        <Text style={styles.loadingText}>Loading work request details...</Text>
      </View>
    );
  }

  if (!workRequest) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Work Request</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.subtitle}>Work request not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Work Request Details</Text>
        <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 4 }}>
          ID: {workRequest._id?.substring(0, 8)}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Status Card */}
        <View style={[styles.card, { backgroundColor: getStatusColor(workRequest.status) + '15' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 6 }}>Current Status</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: getStatusColor(workRequest.status) }}>
                {getStatusText(workRequest.status)}
              </Text>
            </View>
            <View style={{
              backgroundColor: getStatusColor(workRequest.status),
              width: 50,
              height: 50,
              borderRadius: 25,
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <Text style={{ fontSize: 24 }}>
                {workRequest.status === 'COMPLETED' ? '✓' :
                 workRequest.status === 'IN_PROGRESS' ? '⚙️' :
                 workRequest.status === 'ASSIGNED' ? '📋' :
                 workRequest.status === 'PENDING' ? '⏳' : '✗'}
              </Text>
            </View>
          </View>
        </View>

        {/* Work Information */}
        <View style={styles.card}>
          <Text style={styles.title}>📍 Work Information</Text>
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Type</Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: PREMIUM_LIGHT.text }}>
              {workRequest.workType}
            </Text>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Location</Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: PREMIUM_LIGHT.text }}>
              {workRequest.location.address}
            </Text>
            {workRequest.location.pincode && (
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginTop: 4 }}>
                📮 Pincode: {workRequest.location.pincode}
              </Text>
            )}
          </View>

          {workRequest.description && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Description</Text>
              <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text, lineHeight: 18 }}>
                {workRequest.description}
              </Text>
            </View>
          )}
        </View>

        {/* Schedule */}
        <View style={styles.card}>
          <Text style={styles.title}>⏱️ Schedule</Text>
          
          {/* Scheduled Times */}
          <View style={{ marginTop: 12, backgroundColor: PREMIUM_LIGHT.accentSoft, padding: 12, borderRadius: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: PREMIUM_LIGHT.accent, marginBottom: 8 }}>
              📅 Scheduled Timeline
            </Text>
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Start Date & Time</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: PREMIUM_LIGHT.text }}>
                {new Date(workRequest.startDate).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginTop: 2 }}>
                🕐 {new Date(workRequest.startDate).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
              </Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>End Date & Time</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: PREMIUM_LIGHT.text }}>
                {new Date(workRequest.endDate).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginTop: 2 }}>
                🕐 {new Date(workRequest.endDate).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
              </Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Expected Duration</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: PREMIUM_LIGHT.text }}>
                {workRequest.expectedDuration} hours
              </Text>
            </View>
          </View>

          {/* Actual Work Times - Only show if work has started */}
          {(workRequest.assignmentStartTime || workRequest.assignmentEndTime || workRequest.actualHoursWorked > 0) && (
            <View style={{ marginTop: 12, backgroundColor: '#4CAF5015', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#4CAF50' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#4CAF50', marginBottom: 8 }}>
                ✓ Actual Work Timeline
              </Text>
              
              {workRequest.assignmentStartTime && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Actual Start Time</Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: PREMIUM_LIGHT.text }}>
                    {new Date(workRequest.assignmentStartTime).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#4CAF50', marginTop: 2 }}>
                    🕐 {new Date(workRequest.assignmentStartTime).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </View>
              )}

              {workRequest.assignmentEndTime && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Actual End Time</Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: PREMIUM_LIGHT.text }}>
                    {new Date(workRequest.assignmentEndTime).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#4CAF50', marginTop: 2 }}>
                    🕐 {new Date(workRequest.assignmentEndTime).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </View>
              )}

              {workRequest.actualHoursWorked > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Actual Duration</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#4CAF50' }}>
                    {workRequest.actualHoursWorked} hours
                  </Text>
                </View>
              )}

              {workRequest.status === 'IN_PROGRESS' && !workRequest.assignmentEndTime && (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E0E0E0' }}>
                  <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, fontStyle: 'italic' }}>
                    ⏳ Work in progress - Duration is being tracked in real-time
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Customer Information */}
        {workRequest.customer && (
          <View style={styles.card}>
            <Text style={styles.title}>👤 Customer Information</Text>
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: PREMIUM_LIGHT.text }}>
                {workRequest.customer.name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: PREMIUM_LIGHT.accentSoft,
                    borderRadius: 8,
                  }}
                  onPress={() => openPhoneCall(workRequest.customer.phone)}
                >
                  <Text style={{ fontSize: 16, marginRight: 8 }}>📞</Text>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: PREMIUM_LIGHT.text }}>
                    {workRequest.customer.phone}
                  </Text>
                </TouchableOpacity>
              </View>
              {workRequest.customer.email && (
                <TouchableOpacity
                  style={{
                    marginTop: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: PREMIUM_LIGHT.accentSoft,
                    borderRadius: 8,
                  }}
                  onPress={() => openEmail(workRequest.customer.email)}
                >
                  <Text style={{ fontSize: 16, marginRight: 8 }}>📧</Text>
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.text, flex: 1 }}>
                    {workRequest.customer.email}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Vehicle Assignment */}
        {(workRequest.assignedVehicle || workRequest.preferredVehicleType) && (
          <View style={styles.card}>
            <Text style={styles.title}>🚛 Vehicle Information</Text>

            {workRequest.preferredVehicleType && !workRequest.assignedVehicle && (
              <View style={{
                marginTop: 12,
                backgroundColor: '#FFF3E0',
                borderRadius: 12,
                padding: 14,
                borderLeftWidth: 4,
                borderLeftColor: '#FF9800'
              }}>
                <Text style={{ fontSize: 12, color: '#FF6F00', marginBottom: 8 }}>⭐ CUSTOMER'S PREFERENCE</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#FF6F00' }}>
                  {workRequest.preferredVehicleType}
                </Text>
                <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginTop: 6 }}>
                  The customer requested this vehicle type, but hasn't been assigned yet.
                </Text>
              </View>
            )}

            {workRequest.assignedVehicle && (
              <View style={{
                marginTop: 12,
                backgroundColor: PREMIUM_LIGHT.accentSoft,
                borderRadius: 12,
                padding: 14,
                borderLeftWidth: 4,
                borderLeftColor: PREMIUM_LIGHT.accent
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: PREMIUM_LIGHT.accent }}>
                      {workRequest.assignedVehicle.type}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: PREMIUM_LIGHT.text, marginTop: 8 }}>
                      📋 Vehicle Number
                    </Text>
                    <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text, marginTop: 2 }}>
                      {workRequest.assignedVehicle.vehicleNumber}
                    </Text>

                    <Text style={{ fontSize: 12, fontWeight: '500', color: PREMIUM_LIGHT.text, marginTop: 10 }}>
                      💰 Hourly Rate
                    </Text>
                    <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.accent, fontWeight: '600', marginTop: 2 }}>
                      ₹{workRequest.assignedVehicle.hourlyRate}/hour
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{
                      backgroundColor: workRequest.assignedVehicle.status === 'AVAILABLE' ? '#4CAF50' : '#FF9800',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>
                        {workRequest.assignedVehicle.status}
                      </Text>
                    </View>

                    {workRequest.preferredVehicleType && workRequest.assignedVehicle.type === workRequest.preferredVehicleType && (
                      <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 11, color: '#4CAF50', fontWeight: '600' }}>
                          ✓ Preferred Type
                        </Text>
                      </View>
                    )}

                    {workRequest.assignedVehicle.lastOdometer && (
                      <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>Last Odometer</Text>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: PREMIUM_LIGHT.text, marginTop: 2 }}>
                          {workRequest.assignedVehicle.lastOdometer} km
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Driver Assignment */}
        {workRequest.assignedDriver && (
          <View style={styles.card}>
            <Text style={styles.title}>👨‍💼 Driver Assignment</Text>
            <View style={{
              marginTop: 12,
              backgroundColor: PREMIUM_LIGHT.accentSoft,
              borderRadius: 12,
              padding: 14,
              borderLeftWidth: 4,
              borderLeftColor: PREMIUM_LIGHT.info
            }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: PREMIUM_LIGHT.info }}>
                {workRequest.assignedDriver.name}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    backgroundColor: '#fff',
                    borderRadius: 8,
                  }}
                  onPress={() => openPhoneCall(workRequest.assignedDriver.phone)}
                >
                  <Text style={{ fontSize: 14, marginRight: 6 }}>📞</Text>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: PREMIUM_LIGHT.text }}>
                    {workRequest.assignedDriver.phone}
                  </Text>
                </TouchableOpacity>
              </View>

              {workRequest.assignedDriver.email && (
                <TouchableOpacity
                  style={{
                    marginTop: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    backgroundColor: '#fff',
                    borderRadius: 8,
                  }}
                  onPress={() => openEmail(workRequest.assignedDriver.email)}
                >
                  <Text style={{ fontSize: 14, marginRight: 6 }}>📧</Text>
                  <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.text, flex: 1 }}>
                    {workRequest.assignedDriver.email}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Cost Information */}
        <View style={styles.card}>
          <Text style={styles.title}>💰 Cost Information</Text>
          <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted }}>Estimated Cost</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: PREMIUM_LIGHT.accent }}>
                ₹{workRequest.estimatedCost || 0}
              </Text>
            </View>
            {workRequest.actualCost && workRequest.actualCost > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted }}>Actual Cost</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#4CAF50' }}>
                  ₹{workRequest.actualCost}
                </Text>
              </View>
            )}
          </View>

          {workRequest.paymentStatus && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: PREMIUM_LIGHT.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted }}>Payment Status</Text>
                <View style={{
                  backgroundColor:
                    workRequest.paymentStatus === 'COMPLETED' ? '#4CAF50' :
                    workRequest.paymentStatus === 'PARTIAL' ? '#FF9800' :
                    'rgba(244, 67, 54, 0.2)',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8
                }}>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: workRequest.paymentStatus === 'COMPLETED' ? '#fff' :
                           workRequest.paymentStatus === 'PARTIAL' ? '#fff' :
                           '#F44336'
                  }}>
                    {workRequest.paymentStatus}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Status Update Buttons - Cancel Option */}
        {(workRequest.status === 'PENDING' || workRequest.status === 'ASSIGNED' || workRequest.status === 'IN_PROGRESS') && (
          <View style={styles.card}>
            <Text style={styles.title}>Actions</Text>
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: '#F44336' }]}
                onPress={() => handleUpdateStatus('CANCELLED')}
                disabled={submitting}
              >
                <Text style={styles.buttonText}>
                  {submitting ? 'Cancelling...' : 'Cancel Request'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Completion Details */}
        {workRequest.status === 'COMPLETED' && (
          <View style={[styles.card, { backgroundColor: '#4CAF5015' }]}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#4CAF50' }}>✓ Work Completed</Text>
            {(workRequest.completedAt || workRequest.assignmentEndTime) && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Completed on</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#4CAF50' }}>
                  {new Date(workRequest.completedAt || workRequest.assignmentEndTime).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
                <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text, marginTop: 4 }}>
                  🕐 {new Date(workRequest.completedAt || workRequest.assignmentEndTime).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </Text>
              </View>
            )}
            {workRequest.actualHoursWorked > 0 && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E0E0E0' }}>
                <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Total Work Duration</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#4CAF50' }}>
                  {workRequest.actualHoursWorked} hours
                </Text>
              </View>
            )}
            {workRequest.notes && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E0E0E0' }}>
                <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Notes</Text>
                <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text, lineHeight: 18 }}>
                  {workRequest.notes}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Cancelled Details */}
        {workRequest.status === 'CANCELLED' && (
          <View style={[styles.card, { backgroundColor: '#F4433515' }]}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#F44336' }}>✗ Request Cancelled</Text>
            {workRequest.notes && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>Reason</Text>
                <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text, lineHeight: 18 }}>
                  {workRequest.notes}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default WorkRequestDetail;
