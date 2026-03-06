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
        📍 {item.location.address}
      </Text>
      
      <Text style={styles.workRequestDuration}>
        ⏱️ Duration: {item.expectedDuration} hours
      </Text>
      
      {item.customer && (
        <Text style={styles.workRequestLocation}>
          👤 {item.customer.name} - {item.customer.phone}
        </Text>
      )}
      
      {item.assignedVehicle && (
        <Text style={styles.workRequestLocation}>
          🚛 {item.assignedVehicle.make} {item.assignedVehicle.model} ({item.assignedVehicle.vehicleNumber})
        </Text>
      )}
      
      {item.assignedDriver && (
        <Text style={styles.workRequestLocation}>
          👨‍💼 {item.assignedDriver.name}
        </Text>
      )}

      {item.status === 'PENDING' && (
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <TouchableOpacity
            style={[styles.button, { flex: 1, marginRight: 8 }]}
            onPress={() => navigation.navigate('AdminAssignWork', { workRequestId: item._id })}
          >
            <Text style={styles.buttonText}>Assign</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { flex: 1 }]}
            onPress={() => navigation.navigate('CustomerTrackWork', { workRequestId: item._id })}
          >
            <Text style={styles.buttonTextOnDark}>View</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.muted }}>
          Created: {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.accent, fontWeight: 'bold' }}>
          ₹{item.estimatedCost}
        </Text>
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
        <View style={{ flex: 1, padding: 16 }}>
          <FlatList
            data={workRequests}
            renderItem={renderWorkRequest}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No work requests found</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
};

export default AdminWorkRequests;