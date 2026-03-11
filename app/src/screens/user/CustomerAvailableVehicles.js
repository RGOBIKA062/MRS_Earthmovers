import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const VEHICLE_TYPES = ['JCB', 'Hitachi', 'Rocksplitter', 'Tractor', 'Tipper', 'Compressor'];

const formatDateTime = (dateStr) => {
  const date = new Date(dateStr);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const formatDateOnly = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString();
};

const CustomerAvailableVehicles = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availabilityData, setAvailabilityData] = useState([]);
  const [selectedType, setSelectedType] = useState('JCB');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [expandedVehicle, setExpandedVehicle] = useState(null);

  const fetchAvailabilityCalendar = async () => {
    try {
      setLoading(true);
      
      // Validate dates
      if (!startDate || !endDate) {
        console.error('Missing dates:', { startDate, endDate });
        setAvailabilityData([]);
        return;
      }

      const startDateTime = new Date(startDate + 'T00:00:00').toISOString();
      const endDateTime = new Date(endDate + 'T23:59:59').toISOString();

      console.log('Fetching availability calendar for ALL vehicle types with:', {
        startDateTime,
        endDateTime
      });

      // Fetch ALL vehicles (no type filter) so we can show counts for all types
      const response = await apiService.getVehicleAvailabilityCalendar(
        startDateTime,
        endDateTime,
        null  // Don't filter by type - get all vehicles
      );
      
      console.log('Availability calendar response:', response?.data);
      
      const vehicles = response?.data?.data || [];
      console.log(`Loaded ${vehicles.length} total vehicles across all types`);
      setAvailabilityData(vehicles);
    } catch (error) {
      console.error('Error fetching availability calendar:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Show error to user
      Alert.alert(
        'Error Loading Availability',
        error.response?.data?.message || 'Failed to load vehicle availability. Please try again.',
        [{ text: 'OK' }]
      );
      
      setAvailabilityData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailabilityCalendar();
  }, [startDate, endDate]);  // Only refetch when dates change, not when type changes

  useFocusEffect(
    useCallback(() => {
      fetchAvailabilityCalendar();
    }, [startDate, endDate])  // Only refetch when dates change, not when type changes
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAvailabilityCalendar();
    setRefreshing(false);
  };

  const getVehicleCountByType = (type) => {
    const count = availabilityData.filter(v => v.type === type).length;
    console.log(`Type ${type}: ${count} vehicles found`);
    return count;
  };

  const getAvailableCountByType = (type) => {
    const count = availabilityData.filter(v => v.type === type && v.isCurrentlyAvailable).length;
    console.log(`Type ${type}: ${count} available now`);
    return count;
  };

  const renderTypeButton = (type) => {
    const isSelected = selectedType === type;
    const totalCount = getVehicleCountByType(type);
    const availableCount = getAvailableCountByType(type);
    
    return (
      <TouchableOpacity
        key={type}
        style={[
          styles.card,
          { 
            marginHorizontal: 16, 
            marginBottom: 8, 
            paddingVertical: 14,
            borderLeftWidth: 4,
            borderLeftColor: isSelected ? PREMIUM_LIGHT.accent : (availableCount > 0 ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.danger),
            backgroundColor: isSelected ? PREMIUM_LIGHT.accent + '10' : PREMIUM_LIGHT.surface
          }
        ]}
        onPress={() => {
          setSelectedType(type);
          setExpandedVehicle(null);
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.label, { fontWeight: isSelected ? '700' : '600' }]}>
            {type}
          </Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 14, color: availableCount > 0 ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.danger, fontWeight: '600' }}>
              {availableCount}/{totalCount} available
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderVehicleCard = (vehicle) => {
    const isExpanded = expandedVehicle === vehicle.vehicleId;
    const hasBookings = vehicle.totalBookings > 0;

    // Log vehicle data for debugging
    console.log(`Vehicle ${vehicle.vehicleNumber}:`, {
      type: vehicle.type,
      isCurrentlyAvailable: vehicle.isCurrentlyAvailable,
      totalBookings: vehicle.totalBookings,
      status: vehicle.currentStatus
    });

    return (
      <View
        key={vehicle.vehicleId}
        style={[
          styles.card,
          { 
            marginHorizontal: 16, 
            marginBottom: 12,
            borderLeftWidth: 4,
            borderLeftColor: vehicle.isCurrentlyAvailable ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.warning
          }
        ]}
      >
        <TouchableOpacity 
          onPress={() => setExpandedVehicle(isExpanded ? null : vehicle.vehicleId)}
          activeOpacity={0.7}
        >
          {/* Vehicle Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { fontSize: 16, marginBottom: 4 }]}>
                {vehicle.vehicleNumber}
              </Text>
              <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.muted }}>
                {vehicle.type} • ₹{vehicle.hourlyRate}/hr
              </Text>
            </View>
            <View style={{ 
              paddingHorizontal: 12, 
              paddingVertical: 6, 
              borderRadius: 16,
              backgroundColor: vehicle.isCurrentlyAvailable ? PREMIUM_LIGHT.success + '20' : PREMIUM_LIGHT.warning + '20'
            }}>
              <Text style={{ 
                fontSize: 12, 
                fontWeight: '600',
                color: vehicle.isCurrentlyAvailable ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.warning
              }}>
                {vehicle.isCurrentlyAvailable ? '✓ Available' : `${vehicle.totalBookings} Booking${vehicle.totalBookings > 1 ? 's' : ''}`}
              </Text>
            </View>
          </View>

          {/* Current Status */}
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center',
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: PREMIUM_LIGHT.background,
            borderRadius: 8,
            marginBottom: hasBookings ? 8 : 0
          }}>
            <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.muted, flex: 1 }}>
              {vehicle.isCurrentlyAvailable 
                ? `🎉 Available now! ${hasBookings ? `(${vehicle.totalBookings} future booking${vehicle.totalBookings > 1 ? 's' : ''})` : ''}` 
                : `🔴 Currently booked`
              }
            </Text>
            {hasBookings && (
              <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.accent, fontWeight: '600' }}>
                {isExpanded ? 'Hide ▲' : `${vehicle.totalBookings} Detail${vehicle.totalBookings > 1 ? 's' : ''} ▼`}
              </Text>
            )}
          </View>

          {/* Expanded Bookings View */}
          {isExpanded && hasBookings && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: PREMIUM_LIGHT.border }}>
              <Text style={[styles.label, { fontSize: 14, marginBottom: 8 }]}>
                Bookings in Selected Period:
              </Text>
              {vehicle.bookings.map((booking, index) => (
                <View 
                  key={index}
                  style={{
                    padding: 12,
                    backgroundColor: PREMIUM_LIGHT.background,
                    borderRadius: 8,
                    marginBottom: 8,
                    borderLeftWidth: 3,
                    borderLeftColor: booking.status === 'IN_PROGRESS' ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.info
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: PREMIUM_LIGHT.text }}>
                      {booking.workType}
                    </Text>
                    <Text style={{ 
                      fontSize: 11, 
                      fontWeight: '600',
                      color: booking.status === 'IN_PROGRESS' ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.info,
                      textTransform: 'uppercase'
                    }}>
                      {booking.status.replace('_', ' ')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 2 }}>
                    📅 Start: {formatDateTime(booking.startDate)}
                  </Text>
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted }}>
                    🏁 End: {formatDateTime(booking.endDate)}
                  </Text>
                  {booking.customerName && (
                    <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginTop: 4, fontStyle: 'italic' }}>
                      Customer: {booking.customerName}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 48 }]}>
        <Text style={styles.headerTitle}>Vehicle Availability</Text>
        <Text style={{ fontSize: 14, color: '#fff', textAlign: 'center', marginTop: 8 }}>
          Real-time availability and bookings
        </Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          <Text style={styles.loadingText}>Loading availability...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Date Range Selector */}
          <View style={[styles.card, { margin: 16 }]}>
            <Text style={[styles.label, { marginBottom: 8 }]}>Select Date Range</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>From</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 0 }]}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 4 }}>To</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 0 }]}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </View>
            <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginTop: 8 }}>
              💡 Showing availability for the selected date range
            </Text>
          </View>

          {/* Overall Availability Summary */}
          {availabilityData.length > 0 && (
            <View style={[styles.card, { marginHorizontal: 16, marginBottom: 8 }]}>
              <Text style={[styles.label, { marginBottom: 12 }]}>Fleet Overview</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: PREMIUM_LIGHT.text }}>
                    {availabilityData.length}
                  </Text>
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginTop: 4 }}>
                    Total Vehicles
                  </Text>
                </View>
                <View style={{ width: 1, backgroundColor: PREMIUM_LIGHT.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: PREMIUM_LIGHT.success }}>
                    {availabilityData.filter(v => v.isCurrentlyAvailable).length}
                  </Text>
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginTop: 4 }}>
                    Available Now
                  </Text>
                </View>
                <View style={{ width: 1, backgroundColor: PREMIUM_LIGHT.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: PREMIUM_LIGHT.warning }}>
                    {availabilityData.filter(v => !v.isCurrentlyAvailable).length}
                  </Text>
                  <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginTop: 4 }}>
                    Currently Booked
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Vehicle Type Selector */}
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.label, { marginHorizontal: 16, marginBottom: 4 }]}>
              Select Vehicle Type
            </Text>
            {VEHICLE_TYPES.map((type) => renderTypeButton(type))}
          </View>

          {/* Vehicle List */}
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.label, { marginHorizontal: 16, marginBottom: 8 }]}>
              {selectedType} Vehicles
            </Text>
            {availabilityData.filter(v => v.type === selectedType).length === 0 ? (
              <View style={[styles.card, { marginHorizontal: 16, padding: 24, alignItems: 'center' }]}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>🚫</Text>
                <Text style={[styles.subtitle, { textAlign: 'center' }]}>
                  No {selectedType} vehicles found
                </Text>
              </View>
            ) : (
              availabilityData
                .filter(vehicle => vehicle.type === selectedType)
                .map(renderVehicleCard)
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

export default CustomerAvailableVehicles;
