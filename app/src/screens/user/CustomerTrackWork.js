import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ActivityIndicator, RefreshControl, FlatList, TouchableOpacity, Image, ScrollView } from 'react-native';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const devHost = Constants.expoConfig?.hostUri?.split(':')?.[0];
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (devHost ? `http://${devHost}:3000/api` : 'http://localhost:3000/api');
const FILE_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRupees = (value) => {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const getPayableAmount = (workRequest) => {
  return toNumber(
    workRequest?.billingSummary?.payableAmount ??
    workRequest?.payableAmount ??
    (workRequest?.status === 'COMPLETED' ? workRequest?.actualCost : workRequest?.estimatedCost) ??
    0
  );
};

const CustomerTrackWork = ({ route, navigation }) => {
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if (route?.params?.workRequestId) {
              navigation.push('CustomerTrackWork');
            } else {
              navigation.goBack();
            }
          }}
          style={{ paddingHorizontal: 16 }}
        >
          <Text style={{ color: '#1976D2', fontWeight: 'bold', fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, route?.params?.workRequestId]);
  const workRequestId = route?.params?.workRequestId;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workRequest, setWorkRequest] = useState(null);
  const [workAssignments, setWorkAssignments] = useState([]);
  const [customerRequests, setCustomerRequests] = useState([]);

  const { user } = useAuth();

  const fetchWorkRequestDetails = async (id) => {
    try {
      setLoading(true);
      const response = await apiService.getWorkRequest(id);
      const wr = response?.data?.data;
      setWorkRequest(wr);

      // Customers shouldn't rely on driver-only endpoints for live updates.
      // The work request payload already contains status + populated photo proofs.
      if (wr?.liveLocation) {
        setWorkAssignments([
          {
            _id: 'live-location',
            status: wr.assignmentStatus || 'IN_PROGRESS',
            location: { address: wr.liveLocation.address || 'Location not available' },
            startTime: wr.liveLocation.timestamp || new Date().toISOString(),
            notes: 'Driver live location'
          }
        ]);
      } else {
        setWorkAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching work request details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerRequests = async () => {
    try {
      setLoading(true);
      const response = await apiService.getWorkRequestsByCustomer(user.id);
      setCustomerRequests(response.data.data || []);
    } catch (error) {
      console.error('Error fetching customer work requests:', error);
      setCustomerRequests([]);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    if (!workRequestId) {
      setWorkRequest(null);
      setWorkAssignments([]);
      fetchCustomerRequests();
      return;
    }
    fetchWorkRequestDetails(workRequestId);
  }, [workRequestId, user?.id]);

  useEffect(() => {
    if (!workRequestId) return undefined;

    const interval = setInterval(() => {
      fetchWorkRequestDetails(workRequestId);
    }, 30000);

    return () => clearInterval(interval);
  }, [workRequestId]);

  // Always refresh assigned work list when returning to main list
  useEffect(() => {
    if (!workRequestId && user?.id) {
      fetchCustomerRequests();
    }
  }, [workRequestId, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (workRequestId) {
      await fetchWorkRequestDetails(workRequestId);
    } else {
      await fetchCustomerRequests();
    }
    setRefreshing(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return '#F57C00';
      case 'ASSIGNED': return '#1976D2';
      case 'IN_PROGRESS': return '#388E3C';
      case 'COMPLETED': return '#388E3C';
      case 'CANCELLED': return '#D32F2F';
      default: return '#757575';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'PENDING': return 'Pending';
      case 'ASSIGNED': return 'Assigned';
      case 'IN_PROGRESS': return 'In Progress';
      case 'COMPLETED': return 'Completed';
      case 'CANCELLED': return 'Cancelled';
      default: return status;
    }
  };

  const getProgressSteps = () => {
    if (!workRequest) return [];

    // Keep it simple and consistent for customers.
    // Driver has more granular steps, but workRequest status is the reliable source here.
    const status = workRequest.status;
    const isCancelled = status === 'CANCELLED';

    if (isCancelled) {
      return [
        { id: 'requested', label: 'Requested', status: 'completed' },
        { id: 'cancelled', label: 'Cancelled', status: 'current' },
      ];
    }

    const order = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];
    const idx = Math.max(0, order.indexOf(status));

    return [
      { id: 'requested', label: 'Requested', status: idx >= 0 ? (idx === 0 ? 'current' : 'completed') : 'current' },
      { id: 'assigned', label: 'Assigned', status: idx >= 1 ? (idx === 1 ? 'current' : 'completed') : 'pending' },
      { id: 'progress', label: 'In Progress', status: idx >= 2 ? (idx === 2 ? 'current' : 'completed') : 'pending' },
      { id: 'done', label: 'Completed', status: idx >= 3 ? 'completed' : 'pending' },
    ];
  };

  const renderProgressSteps = () => {
    const steps = getProgressSteps();
    
    return (
      <View style={styles.progressContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepperRow}>
          {steps.map((step, index) => {
            const done = step.status === 'completed';
            const current = step.status === 'current';
            const nextDone = index < steps.length - 1 ? steps[index + 1].status === 'completed' : false;

            return (
              <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.stepperItem}>
                  <View
                    style={[
                      styles.stepperDot,
                      done && styles.stepperDotCompleted,
                      current && styles.stepperDotActive,
                      step.id === 'cancelled' && { backgroundColor: '#D32F2F' },
                    ]}
                  >
                    {done && <Text style={styles.stepperCheck}>✓</Text>}
                    {step.id === 'cancelled' && <Text style={styles.stepperCheck}>!</Text>}
                  </View>
                  <Text
                    style={[
                      styles.stepperLabel,
                      done && styles.stepperLabelCompleted,
                      current && styles.stepperLabelActive,
                      step.id === 'cancelled' && { color: '#D32F2F' },
                    ]}
                    numberOfLines={2}
                  >
                    {step.label}
                  </Text>
                </View>
                {index < steps.length - 1 && (
                  <View style={[styles.stepperConnector, nextDone && styles.stepperConnectorCompleted]} />
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };


  const sortedPhotoProofs = useMemo(() => {
    const photos = Array.isArray(workRequest?.photos) ? workRequest.photos : [];
    return photos
      .slice()
      .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
  }, [workRequest?.photos]);
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading work details...</Text>
      </View>
    );
  }

  if (!workRequestId) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { marginTop: 32 }]}>
          <Text style={styles.headerTitle}>Track Your Work</Text>
          <Text style={{ fontSize: 16, color: '#fff', textAlign: 'center', marginTop: 8 }}>
            Select a work request to view progress
          </Text>
        </View>

        <View style={{ flex: 1, padding: 16 }}>
          <FlatList
            data={customerRequests}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('CustomerTrackWork', { workRequestId: item._id })}
              >
                <Text style={styles.workRequestType}>{item.workType}</Text>
                <Text style={styles.workRequestLocation}>📍 {item.location?.address || 'Address not available'}</Text>
                <Text style={styles.workRequestDuration}>Status: {getStatusText(item.status)}</Text>
                <Text style={styles.workRequestDuration}>Payable: {formatRupees(getPayableAmount(item))}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No work requests found</Text>
              </View>
            }
          />
        </View>
      </View>
    );
  }

  if (!workRequest) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Work Details</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Work request not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 32 }]}>
        <Text style={styles.headerTitle}>Track Your Work</Text>
        <Text style={{ fontSize: 16, color: '#fff', textAlign: 'center', marginTop: 8 }}>
          Real-time progress updates
        </Text>
      </View>

      <FlatList
        data={workAssignments}
        keyExtractor={(item) => item._id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListHeaderComponent={() => (
          <View>
            <View style={[styles.card, { margin: 0, marginBottom: 12 }]}>
              <View style={styles.workRequestHeader}>
                <Text style={styles.workRequestType}>{workRequest.workType}</Text>
                <View
                  style={{
                    backgroundColor: getStatusColor(workRequest.status),
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                    {getStatusText(workRequest.status)}
                  </Text>
                </View>
              </View>

              {renderProgressSteps()}

              {/* Notification for work started */}
              {workRequest.status === 'IN_PROGRESS' && workRequest.assignedDriver && workRequest.assignedVehicle && (
                <View style={{ marginTop: 16, padding: 12, backgroundColor: '#FFF3E0', borderRadius: 8 }}>
                  <Text style={{ fontWeight: 'bold', color: '#F57C00', marginBottom: 4 }}>
                    MRS EARTHMOVERS started work
                  </Text>
                  <Text>Driver: {workRequest.assignedDriver.name}</Text>
                  <Text>Vehicle: {workRequest.assignedVehicle.vehicleNumber}</Text>
                  <Text>Site: {workRequest.location?.address || 'Site'}</Text>
                  <Text>Time: {new Date(workRequest.updatedAt).toLocaleString()}</Text>
                </View>
              )}

              <Text style={styles.workRequestLocation}>
                📍 {workRequest.location?.address || 'Address not available'}
              </Text>

              <Text style={styles.workRequestDuration}>
                ⏱️ Duration: {String(workRequest.expectedDuration)} hours
              </Text>

              <Text style={styles.workRequestDuration}>
                🗓️ Scheduled Start: {workRequest.startDate ? new Date(workRequest.startDate).toLocaleString() : 'Not scheduled'}
              </Text>

              <Text style={styles.workRequestDuration}>
                🗓️ Scheduled End: {workRequest.endDate ? new Date(workRequest.endDate).toLocaleString() : 'Not scheduled'}
              </Text>

              <Text style={styles.workRequestDuration}>
                🚦 Work Started: {workRequest.assignmentStartTime ? new Date(workRequest.assignmentStartTime).toLocaleString() : 'Not started yet'}
              </Text>

              <Text style={styles.workRequestDuration}>
                🏁 Work Ended: {workRequest.assignmentEndTime ? new Date(workRequest.assignmentEndTime).toLocaleString() : 'Not ended yet'}
              </Text>

              <Text style={styles.workRequestDuration}>
                💰 Estimated: {formatRupees(workRequest.estimatedCost ?? 0)}
              </Text>

              <Text style={styles.workRequestDuration}>
                💳 Payable: {formatRupees(getPayableAmount(workRequest))}
              </Text>

              {toNumber(workRequest?.billingSummary?.hourlyRate) > 0 ? (
                <Text style={styles.workRequestDuration}>
                  🧮 Rate: {formatRupees(workRequest.billingSummary.hourlyRate)}/hr
                </Text>
              ) : null}

              {toNumber(workRequest?.billingSummary?.actualHoursWorked) > 0 ? (
                <Text style={styles.workRequestDuration}>
                  🕒 Worked: {String(workRequest.billingSummary.actualHoursWorked)} hours
                </Text>
              ) : null}

              {workRequest.assignedVehicle ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.title}>Assigned Vehicle</Text>
                  <Text style={styles.subtitle}>
                    🚛 {workRequest.assignedVehicle.type}
                  </Text>
                  <Text style={styles.subtitle}>Vehicle No: {workRequest.assignedVehicle.vehicleNumber}</Text>
                </View>
              ) : null}

              {workRequest.assignedDriver ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.title}>Assigned Driver</Text>
                  <Text style={styles.subtitle}>👨‍💼 {workRequest.assignedDriver.name}</Text>
                  <Text style={styles.subtitle}>Phone: {workRequest.assignedDriver.phone || '—'}</Text>
                </View>
              ) : null}

              {workRequest.photos && workRequest.photos.length > 0 ? (
                <View style={{ marginTop: 14 }}>
                  <Text style={[styles.title, { marginBottom: 8 }]}>Photo Proofs</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                    {sortedPhotoProofs.map((p) => {
                      const url = p?.imageUrl ? `${FILE_BASE_URL}${p.imageUrl}` : null;
                      return (
                        <View
                          key={p._id || `${p.type}-${p.timestamp}`}
                          style={{
                            flexBasis: '50%',
                            paddingHorizontal: 6,
                            marginBottom: 12,
                          }}
                        >
                          <View
                            style={{
                              borderRadius: 14,
                              backgroundColor: PREMIUM_LIGHT.surface,
                              borderWidth: 1,
                              borderColor: 'rgba(15,23,42,0.06)',
                              overflow: 'hidden',
                            }}
                          >
                            {url ? (
                              <Image
                                source={{ uri: url }}
                                style={{ width: '100%', height: 120, backgroundColor: PREMIUM_LIGHT.bg }}
                                resizeMode="cover"
                              />
                            ) : (
                              <View
                                style={{
                                  width: '100%',
                                  height: 120,
                                  backgroundColor: PREMIUM_LIGHT.accentSoft,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={{ color: PREMIUM_LIGHT.accent, fontWeight: '900' }}>{p?.type || 'PHOTO'}</Text>
                              </View>
                            )}
                            <View style={{ padding: 10 }}>
                              <Text style={{ fontWeight: '900', color: PREMIUM_LIGHT.text }} numberOfLines={1}>
                                {p?.type || 'PHOTO'} • {p?.title || 'Photo'}
                              </Text>
                              <Text style={{ marginTop: 2, color: PREMIUM_LIGHT.muted, fontSize: 12 }} numberOfLines={1}>
                                {p?.timestamp ? new Date(p.timestamp).toLocaleString() : ''}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={{ marginTop: 10 }}>
                <Text style={styles.title}>Location Details</Text>
                <Text style={styles.subtitle}>Address: {workRequest.location?.address || '—'}</Text>
                <Text style={styles.subtitle}>Lat: {String(workRequest.location?.latitude ?? '—')} • Lng: {String(workRequest.location?.longitude ?? '—')}</Text>
              </View>

              {workRequest.status === 'COMPLETED' ? (
                <View style={{ marginTop: 16, padding: 12, backgroundColor: '#E8F5E8', borderRadius: 8 }}>
                  <Text style={styles.workRequestType}>Final Cost: {formatRupees(getPayableAmount(workRequest))}</Text>
                  <Text style={styles.workRequestDuration}>
                    Payment Status: {workRequest.paymentStatus}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, { marginTop: 8, paddingVertical: 12 }]}
                onPress={() => navigation.navigate('Payment', {
                  workRequestId,
                  dueAmount: Math.max(
                    0,
                    toNumber(getPayableAmount(workRequest))
                  ),
                  source: 'CustomerTrackWork'
                })}
              >
                <Text style={[styles.buttonText, { fontSize: 14 }]}>View Payment Status</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.title, { marginBottom: 8 }]}>Live Updates</Text>
            {workRequest?.liveLocation ? (
              <View style={[styles.card, { marginHorizontal: 0, marginBottom: 12 }]}>
                <Text style={styles.workRequestType}>Driver Live Location</Text>
                <Text style={styles.workRequestLocation}>
                  📍 {workRequest.liveLocation.address || 'Location not available'}
                </Text>
                <Text style={styles.workRequestDuration}>
                  ⏰ {workRequest.liveLocation.timestamp ? new Date(workRequest.liveLocation.timestamp).toLocaleString() : 'Just now'}
                </Text>
              </View>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.card, { marginHorizontal: 0, marginBottom: 12 }]}>
            <Text style={styles.workRequestType}>{item.status.replace('_', ' ').toUpperCase()}</Text>
            <Text style={styles.workRequestLocation}>
              📍 {item.location?.address || 'Location not available'}
            </Text>
            <Text style={styles.workRequestDuration}>⏰ {new Date(item.startTime).toLocaleString()}</Text>
            {item.notes ? <Text style={styles.workRequestLocation}>📝 {item.notes}</Text> : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={[styles.card, { marginHorizontal: 0 }]}>
            <Text style={styles.emptyStateText}>No updates available yet</Text>
          </View>
        }
      />
    </View>
  );
};

export default CustomerTrackWork;