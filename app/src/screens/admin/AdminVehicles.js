import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ActivityIndicator, RefreshControl, SectionList, TouchableOpacity, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const VEHICLE_TYPE_ICON = {
  JCB: 'excavator',
  Hitachi: 'excavator',
  Rocksplitter: 'hammer-wrench',
  Tractor: 'tractor-variant',
  Tipper: 'dump-truck',
  Compressor: 'air-filter',
  default: 'truck-outline',
};

const AdminVehicles = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [filters, setFilters] = useState({ status: '', search: '' });

  const { user } = useAuth();

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const response = await apiService.getVehicles({
        ...filters,
        page: 1,
        limit: 50
      });
      setVehicles(response.data.data);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, [filters]);

  useFocusEffect(
    useCallback(() => {
      fetchVehicles();
    }, [filters])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchVehicles();
    setRefreshing(false);
  };

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'AVAILABLE': return PREMIUM_LIGHT.success;
      case 'ASSIGNED': return PREMIUM_LIGHT.info;
      case 'MAINTENANCE': return PREMIUM_LIGHT.accent;
      case 'BREAKDOWN': return PREMIUM_LIGHT.danger;
      case 'EMERGENCY': return PREMIUM_LIGHT.danger;
      default: return PREMIUM_LIGHT.muted;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'AVAILABLE': return 'Available';
      case 'ASSIGNED': return 'Assigned';
      case 'MAINTENANCE': return 'Maintenance';
      case 'BREAKDOWN': return 'Breakdown';
      case 'EMERGENCY': return 'Emergency';
      default: return status;
    }
  };

  const getVehicleIconName = (type) => VEHICLE_TYPE_ICON[type] || VEHICLE_TYPE_ICON.default;

  const groupedVehicles = useMemo(() => {
    const grouped = vehicles.reduce((acc, vehicle) => {
      const type = vehicle.type || 'Other';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(vehicle);
      return acc;
    }, {});

    return Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b))
      .map((type) => ({
        title: type,
        data: grouped[type].sort((a, b) => {
          const rateDiff = Number(a.hourlyRate || 0) - Number(b.hourlyRate || 0);
          if (rateDiff !== 0) return rateDiff;
          return String(a.vehicleNumber || '').localeCompare(String(b.vehicleNumber || ''));
        }),
      }));
  }, [vehicles]);

  const renderVehicle = ({ item }) => (
    <TouchableOpacity 
      style={styles.vehicleCard}
      onPress={() => navigation.navigate('VehicleDetails', { vehicleId: item._id })}
    >
      <View style={styles.vehicleIcon}>
        <MaterialCommunityIcons
          name={getVehicleIconName(item.type)}
          size={28}
          color={PREMIUM_LIGHT.accent}
        />
      </View>
      
      <View style={styles.vehicleInfo}>
        <Text style={styles.vehicleDetails}>
          Hourly Rate: ₹{item.hourlyRate}/hr
        </Text>
        <Text style={styles.vehicleNumber}>{item.vehicleNumber}</Text>
        <Text style={styles.vehicleDetails}>
          Status: {getStatusText(item.status)}
        </Text>
        {item.driver && (
          <Text style={styles.vehicleDetails}>
            Driver: {item.driver.name} ({item.driver.phone})
          </Text>
        )}
        {item.location && (
          <Text style={styles.vehicleDetails}>
            Location: {item.location.address}
          </Text>
        )}
      </View>

      <View style={{
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: getStatusColor(item.status),
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4
      }}>
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
          {getStatusText(item.status)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section: { title } }) => (
    <View
      style={{
        backgroundColor: PREMIUM_LIGHT.card,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: PREMIUM_LIGHT.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: 12,
        marginBottom: 6,
      }}
    >
      <Text style={{ color: PREMIUM_LIGHT.text, fontSize: 16, fontWeight: '800' }}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 24 }]}> {/* Added marginTop to move header down */}
        <Text style={styles.headerTitle}>Vehicle Management</Text>
        <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
          Manage your fleet
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search vehicles..."
            placeholderTextColor={PREMIUM_LIGHT.muted}
            value={filters.search}
            onChangeText={(text) => handleFilterChange('search', text)}
          />
        </View>

        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              filters.status === '' ? styles.filterButtonActive : styles.filterButtonInactive
            ]}
            onPress={() => handleFilterChange('status', '')}
          >
            <Text style={{ color: filters.status === '' ? '#FFFFFF' : PREMIUM_LIGHT.text, fontWeight: '800' }}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              filters.status === 'AVAILABLE' ? styles.filterButtonActive : styles.filterButtonInactive
            ]}
            onPress={() => handleFilterChange('status', 'AVAILABLE')}
          >
            <Text style={{ color: filters.status === 'AVAILABLE' ? '#FFFFFF' : PREMIUM_LIGHT.text, fontWeight: '800' }}>Available</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              filters.status === 'ASSIGNED' ? styles.filterButtonActive : styles.filterButtonInactive
            ]}
            onPress={() => handleFilterChange('status', 'ASSIGNED')}
          >
            <Text style={{ color: filters.status === 'ASSIGNED' ? '#FFFFFF' : PREMIUM_LIGHT.text, fontWeight: '800' }}>Assigned</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterButton,
              filters.status === 'EMERGENCY' ? styles.filterButtonActive : styles.filterButtonInactive
            ]}
            onPress={() => handleFilterChange('status', 'EMERGENCY')}
          >
            <Text style={{ color: filters.status === 'EMERGENCY' ? '#FFFFFF' : PREMIUM_LIGHT.text, fontWeight: '800' }}>Emergency</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => navigation.navigate('AddVehicle')}
        >
          <Text style={styles.buttonTextOnDark}>Add New Vehicle</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          <Text style={styles.loadingText}>Loading vehicles...</Text>
        </View>
      ) : (
        <View style={{ flex: 1, padding: 16 }}>
          <SectionList
            sections={groupedVehicles}
            renderItem={renderVehicle}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No vehicles found</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
};

export default AdminVehicles;