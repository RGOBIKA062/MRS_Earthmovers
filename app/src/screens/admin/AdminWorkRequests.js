import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, FlatList, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const AdminWorkRequests = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workRequests, setWorkRequests] = useState([]);
  const [filters, setFilters] = useState({ status: '', search: '' });
  const [currentPage, setCurrentPage] = useState(0);

  const { user } = useAuth();

  const fetchWorkRequests = async () => {
    try {
      setLoading(true);
      const params = {
        page: 1,
        limit: 50
      };
      if (filters.status) params.status = filters.status;
      const search = (filters.search || '').trim();
      if (search) params.search = search;

      const response = await apiService.getWorkRequests(params);
      setWorkRequests(response.data.data);
    } catch (error) {
      console.error('Error fetching work requests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkRequests();
  }, [filters]);

  useFocusEffect(
    useCallback(() => {
      fetchWorkRequests();
    }, [filters])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWorkRequests();
    setRefreshing(false);
  };

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
    setCurrentPage(0); // Reset to first page when filter changes
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

  const renderWorkRequest = ({ item }) => (
    <View style={styles.workRequestCard}>
      {/* Header with Type and Status */}
      <View style={styles.workRequestHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.workRequestType}>{item.workType}</Text>
          <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginTop: 4 }}>
            ID: {item._id?.substring(0, 8) || 'N/A'}
          </Text>
        </View>
        <View style={{
          backgroundColor: getStatusColor(item.status),
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 12
        }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
            {getStatusText(item.status)}
          </Text>
        </View>
      </View>

      {/* Location Details */}
      <View style={{ marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: PREMIUM_LIGHT.border }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: PREMIUM_LIGHT.text, marginBottom: 6 }}>
          📍 Location
        </Text>
        <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.text }}>{item.location.address}</Text>
        {item.location.pincode && (
          <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginTop: 4 }}>
            Pincode: {item.location.pincode}
          </Text>
        )}
      </View>

      {/* Customer Details */}
      {item.customer && (
        <View style={{ marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: PREMIUM_LIGHT.border }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: PREMIUM_LIGHT.text, marginBottom: 6 }}>
            👤 Customer
          </Text>
          <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.text, fontWeight: '500' }}>{item.customer.name}</Text>
          <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginTop: 2 }}>📞 {item.customer.phone}</Text>
          {item.customer.email && (
            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginTop: 2 }}>📧 {item.customer.email}</Text>
          )}
        </View>
      )}

      {/* Work Details */}
      <View style={{ marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: PREMIUM_LIGHT.border }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: PREMIUM_LIGHT.text, marginBottom: 8 }}>
          🔧 Work Details
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>Duration</Text>
            <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.text, fontWeight: '500', marginTop: 2 }}>
              {item.expectedDuration} hours
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>Estimated Cost</Text>
            <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.accent, fontWeight: '600', marginTop: 2 }}>
              ₹{item.estimatedCost || 0}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>Start Date</Text>
            <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.text, marginTop: 2 }}>
              {new Date(item.startDate).toLocaleDateString('en-IN', { 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>End Date</Text>
            <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.text, marginTop: 2 }}>
              {new Date(item.endDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          </View>
        </View>
        {item.description && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted }}>Description</Text>
            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.text, marginTop: 4, lineHeight: 16 }}>
              {item.description}
            </Text>
          </View>
        )}
      </View>

      {/* Vehicle & Driver Assignment (if assigned) */}
      {(item.assignedVehicle || item.assignedDriver || item.preferredVehicleType) && (
        <View style={{ marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: PREMIUM_LIGHT.border }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: PREMIUM_LIGHT.text, marginBottom: 8 }}>
            🚛 Assigned Resources & Preferences
          </Text>

          {item.preferredVehicleType && !item.assignedVehicle && (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: PREMIUM_LIGHT.text, marginBottom: 6 }}>Preferred Vehicle Type</Text>
              <View style={{
                backgroundColor: '#FFF3E0',
                borderRadius: 8,
                padding: 10,
                borderLeftWidth: 4,
                borderLeftColor: '#FF9800'
              }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FF6F00' }}>
                  ⭐ {item.preferredVehicleType}
                </Text>
                <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginTop: 4 }}>
                  Customer's preferred vehicle type (not yet assigned)
                </Text>
              </View>
            </View>
          )}

          {item.assignedVehicle && (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: PREMIUM_LIGHT.text }}>Vehicle</Text>
              <View style={{ 
                backgroundColor: PREMIUM_LIGHT.accentSoft, 
                borderRadius: 8, 
                padding: 10, 
                marginTop: 6,
                borderLeftWidth: 4,
                borderLeftColor: PREMIUM_LIGHT.accent
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: PREMIUM_LIGHT.accent }}>
                      {item.assignedVehicle.type}
                    </Text>
                    <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.text, marginTop: 4 }}>
                      📋 {item.assignedVehicle.vehicleNumber}
                    </Text>
                    <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.text, marginTop: 2 }}>
                      💰 ₹{item.assignedVehicle.hourlyRate}/hour
                    </Text>
                    {item.preferredVehicleType && item.assignedVehicle.type === item.preferredVehicleType && (
                      <Text style={{ fontSize: 10, color: '#4CAF50', marginTop: 4, fontWeight: '600' }}>
                        ✓ Matches preferred type
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{
                      backgroundColor: item.assignedVehicle.status === 'AVAILABLE' ? '#4CAF50' : '#FF9800',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6
                    }}>
                      <Text style={{ fontSize: 10, color: '#fff', fontWeight: '600' }}>
                        {item.assignedVehicle.status}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}
          {item.assignedDriver && (
            <View>
              <Text style={{ fontSize: 12, fontWeight: '500', color: PREMIUM_LIGHT.text }}>Driver</Text>
              <View style={{
                backgroundColor: PREMIUM_LIGHT.accentSoft,
                borderRadius: 8,
                padding: 10,
                marginTop: 6,
                borderLeftWidth: 4,
                borderLeftColor: PREMIUM_LIGHT.info
              }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: PREMIUM_LIGHT.info }}>
                  {item.assignedDriver.name}
                </Text>
                <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.text, marginTop: 4 }}>
                  📞 {item.assignedDriver.phone}
                </Text>
                {item.assignedDriver.email && (
                  <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.text, marginTop: 2 }}>
                    📧 {item.assignedDriver.email}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Payment Status */}
      {item.paymentStatus && (
        <View style={{ marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: PREMIUM_LIGHT.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: PREMIUM_LIGHT.text }}>Payment Status</Text>
            <View style={{
              backgroundColor: item.paymentStatus === 'COMPLETED' ? '#4CAF50' : 
                               item.paymentStatus === 'PARTIAL' ? '#FF9800' : 
                               '#F44336',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8
            }}>
              <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>
                {item.paymentStatus}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={{ marginTop: 10, flexDirection: 'row', gap: 6 }}>
        {item.status === 'PENDING' && (
          <>
            <TouchableOpacity
              style={[styles.button, { flex: 1, paddingVertical: 10, paddingHorizontal: 10 }]}
              onPress={() => navigation.navigate('AdminAssignWork', { workRequestId: item._id })}
            >
              <Text style={[styles.buttonText, { fontSize: 14 }]}>Assign</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary, { flex: 1, paddingVertical: 10, paddingHorizontal: 10 }]}
              onPress={() => navigation.navigate('WorkRequestDetail', { workRequestId: item._id })}
            >
              <Text style={[styles.buttonTextOnDark, { fontSize: 14 }]}>View Details</Text>
            </TouchableOpacity>
          </>
        )}
        {(item.status === 'ASSIGNED' || item.status === 'IN_PROGRESS') && (
          <TouchableOpacity
            style={[styles.button, { flex: 1, paddingVertical: 10, paddingHorizontal: 10 }]}
            onPress={() => navigation.navigate('WorkRequestDetail', { workRequestId: item._id })}
          >
            <Text style={[styles.buttonText, { fontSize: 14 }]}>View & Update</Text>
          </TouchableOpacity>
        )}
        {item.status === 'COMPLETED' && (
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { flex: 1, paddingVertical: 10, paddingHorizontal: 10 }]}
            onPress={() => navigation.navigate('WorkRequestDetail', { workRequestId: item._id })}
          >
            <Text style={[styles.buttonTextOnDark, { fontSize: 14 }]}>View Summary</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 32 }]}> 
        <Text style={styles.headerTitle}>Work Requests</Text>
        <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
          Manage all work orders
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search work requests..."
            placeholderTextColor={PREMIUM_LIGHT.muted}
            value={filters.search}
            onChangeText={(text) => handleFilterChange('search', text)}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
          <View style={[styles.filterContainer, { marginVertical: 0 }]}>
            {[
              { key: '', label: 'All' },
              { key: 'PENDING', label: 'Pending' },
              { key: 'ASSIGNED', label: 'Assigned' },
              { key: 'IN_PROGRESS', label: 'In Progress' },
              { key: 'COMPLETED', label: 'Completed' },
              { key: 'CANCELLED', label: 'Cancelled' },
            ].map((f) => {
              const active = filters.status === f.key;
              return (
                <TouchableOpacity
                  key={f.key || 'ALL'}
                  style={[
                    styles.filterButton,
                    active ? styles.filterButtonActive : styles.filterButtonInactive,
                    { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
                  ]}
                  onPress={() => handleFilterChange('status', f.key)}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: active ? '#FFFFFF' : PREMIUM_LIGHT.text, fontWeight: '800' }}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          <Text style={styles.loadingText}>Loading work requests...</Text>
        </View>
      ) : (
        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {workRequests.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No work requests found</Text>
            </View>
          ) : (
            <View>
              {workRequests.slice(currentPage * 4, (currentPage * 4) + 4).map((item) => (
                <View key={item._id}>
                  {renderWorkRequest({ item })}
                </View>
              ))}
              
              {workRequests.length > 4 && (
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  marginTop: 16,
                  paddingVertical: 10,
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
                    Showing {currentPage * 4 + 1}-{Math.min((currentPage + 1) * 4, workRequests.length)} of {workRequests.length} requests
                  </Text>
                  
                  <TouchableOpacity 
                    onPress={() => setCurrentPage(Math.min(Math.floor((workRequests.length - 1) / 4), currentPage + 1))}
                    disabled={currentPage >= Math.floor((workRequests.length - 1) / 4)}
                    style={{ 
                      padding: 8,
                      opacity: currentPage >= Math.floor((workRequests.length - 1) / 4) ? 0.3 : 1
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
        </ScrollView>
      )}
    </View>
  );
};

export default AdminWorkRequests;