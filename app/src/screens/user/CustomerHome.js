import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, RefreshControl, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';
import AnimatedPressable from '../../components/AnimatedPressable';

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

const CustomerHome = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workRequests, setWorkRequests] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({
    totalRequests: 0,
    completedRequests: 0,
    pendingRequests: 0,
    totalSpent: 0
  });

  const { user } = useAuth();

  const fetchCustomerWorkRequests = async () => {
    try {
      setLoading(true);
      if (!user?.id) {
        setWorkRequests([]);
        return;
      }

      const response = await apiService.getWorkRequestsByCustomer(user.id);
      const items = response?.data?.data || [];
      setWorkRequests(items);
      
      const totalRequests = items.length;
      const completedRequests = items.filter(wr => wr.status === 'COMPLETED').length;
      const pendingRequests = items.filter(wr => wr.status === 'PENDING').length;
      const totalSpent = items
        .filter(wr => wr.status === 'COMPLETED')
        .reduce((sum, wr) => sum + getPayableAmount(wr), 0);

      setDashboardStats({
        totalRequests,
        completedRequests,
        pendingRequests,
        totalSpent
      });
    } catch (error) {
      console.error('Error fetching customer work requests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerWorkRequests();
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchCustomerWorkRequests();
    }, [user?.id])
  );
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCustomerWorkRequests();
    setRefreshing(false);
  };


  
  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return PREMIUM_LIGHT.accent;
      case 'ASSIGNED': return PREMIUM_LIGHT.info;
      case 'IN_PROGRESS': return PREMIUM_LIGHT.success;
      case 'COMPLETED': return PREMIUM_LIGHT.success;
      case 'CANCELLED': return PREMIUM_LIGHT.danger;
      default: return PREMIUM_LIGHT.muted;
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

  const renderWorkRequest = ({ item, index }) => (
    <Entrance delay={Math.min(60 + (index || 0) * 40, 260)}>
      <TouchableOpacity 
        style={styles.workRequestCard}
        onPress={() => navigation.navigate('CustomerTrackWork', { workRequestId: item._id })}
        activeOpacity={0.85}
      >
      <View style={styles.workRequestHeader}>
        <Text style={styles.workRequestType}>{item.workType}</Text>
        <View style={{
          backgroundColor: getStatusColor(item.status),
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 12
        }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
            {getStatusText(item.status)}
          </Text>
        </View>
      </View>
      
      <Text style={styles.workRequestLocation}>
        📍 {item.location?.address || 'Address not available'}
      </Text>
      
      <Text style={styles.workRequestDuration}>
        ⏱️ Duration: {item.expectedDuration} hours
      </Text>
      
      <Text style={styles.workRequestDuration}>
        💰 Estimated: {formatRupees(item.estimatedCost)}
      </Text>

      <Text style={styles.workRequestDuration}>
        💳 Payable: {formatRupees(getPayableAmount(item))}
      </Text>

      {toNumber(item?.billingSummary?.hourlyRate) > 0 ? (
        <Text style={styles.workRequestDuration}>
          🧮 Rate: {formatRupees(item.billingSummary.hourlyRate)}/hr
        </Text>
      ) : null}

      {item.assignedVehicle && (
        <Text style={styles.workRequestLocation}>
          🚛 {item.assignedVehicle.type} - {item.assignedVehicle.vehicleNumber}
        </Text>
      )}

      {item.assignedDriver && (
        <Text style={styles.workRequestLocation}>
          👨‍💼 {item.assignedDriver.name}
        </Text>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.muted }}>
          Created: {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        {item.paymentStatus && (
          <Text style={{ 
            fontSize: 14, 
            color: item.paymentStatus === 'COMPLETED' ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.accent,
            fontWeight: 'bold'
          }}>
            {item.paymentStatus}
          </Text>
        )}
      </View>
      </TouchableOpacity>
    </Entrance>
  );

  return (
    <View style={styles.container}>
      <Entrance>
        <View style={[styles.header, { marginTop: 24 }]}> {/* Added marginTop to move header down */}
          <Text style={styles.headerTitle}>Customer Portal</Text>
          <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
            Welcome back, {user?.name || 'Customer'}
          </Text>
        </View>
      </Entrance>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          <Text style={styles.loadingText}>Loading your work requests...</Text>
        </View>
      ) : (
        <FlatList
          data={workRequests}
          renderItem={renderWorkRequest}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <Entrance delay={90}>
              <View style={styles.card}>
                <Text style={styles.title}>Your Dashboard</Text>
                <View style={[styles.statisticsContainer, { marginBottom: 4 }]}> 
                  <View style={styles.statisticCard}>
                    <Text style={styles.statisticValue}>{dashboardStats.totalRequests}</Text>
                    <Text style={styles.statisticLabel}>Total Requests</Text>
                  </View>
                  <View style={styles.statisticCard}>
                    <Text style={styles.statisticValue}>{dashboardStats.completedRequests}</Text>
                    <Text style={styles.statisticLabel}>Completed</Text>
                  </View>
                  <View style={styles.statisticCard}>
                    <Text style={styles.statisticValue}>{dashboardStats.pendingRequests}</Text>
                    <Text style={styles.statisticLabel}>Pending</Text>
                  </View>
                  <View style={styles.statisticCard}>
                    <Text style={styles.statisticValue}>{formatRupees(dashboardStats.totalSpent)}</Text>
                    <Text style={styles.statisticLabel}>Total Spent</Text>
                  </View>
                </View>

                {/* Notification for work started (first IN_PROGRESS request) */}
                {workRequests.some(wr => wr.status === 'IN_PROGRESS' && wr.assignedDriver && wr.assignedVehicle) && (() => {
                  const wr = workRequests.find(wr => wr.status === 'IN_PROGRESS' && wr.assignedDriver && wr.assignedVehicle);
                  return (
                    <View style={{ marginTop: 16, padding: 12, backgroundColor: '#FFF3E0', borderRadius: 8 }}>
                      <Text style={{ fontWeight: 'bold', color: '#F57C00', marginBottom: 4 }}>
                        MRS EARTHMOVERS started work
                      </Text>
                      <Text>Driver: {wr.assignedDriver.name}</Text>
                      <Text>Vehicle: {wr.assignedVehicle.vehicleNumber}</Text>
                      <Text>Site: {wr.location?.address || 'Site'}</Text>
                      <Text>Time: {new Date(wr.updatedAt).toLocaleString()}</Text>
                    </View>
                  );
                })()}

                <AnimatedPressable
                  style={[styles.button, styles.buttonSecondary, { marginTop: 0 }]}
                  onPress={() => navigation.navigate('CustomerWorkRequest')}
                >
                  <Text style={styles.buttonTextOnDark}>Request New Work</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={() => navigation.navigate('CustomerTrackWork')}
                >
                  <Text style={styles.buttonTextOnDark}>Track Current Work</Text>
                </AnimatedPressable>
              </View>
            </Entrance>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No work requests found</Text>
              <Text style={styles.emptyStateText}>Click "Request New Work" to get started</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 0 }}
        />
      )}
    </View>
  );
};

export default CustomerHome;