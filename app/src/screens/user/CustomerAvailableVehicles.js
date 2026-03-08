import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const VEHICLE_TYPES = ['JCB', 'Hitachi', 'Rocksplitter', 'Tractor', 'Tipper', 'Compressor'];

const CustomerAvailableVehicles = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allVehicles, setAllVehicles] = useState([]);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [selectedType, setSelectedType] = useState('JCB');

  const fetchAvailableVehicles = async () => {
    try {
      setLoading(true);
      const response = await apiService.getAvailableVehicles();
      const vehicles = response?.data?.data || [];
      
      // Filter valid vehicles - exclude only those marked as ASSIGNED
      const validVehicles = vehicles.filter(v => 
        v.type && 
        v.vehicleNumber && 
        v.status !== 'ASSIGNED'
      );
      setAllVehicles(validVehicles);
      
      // Group by type
      const grouped = {};
      validVehicles.forEach(vehicle => {
        const key = vehicle.type;
        if (!grouped[key]) {
          grouped[key] = {
            id: key,
            name: vehicle.type,
            type: vehicle.type,
            count: 0,
            vehicles: []
          };
        }
        grouped[key].count += 1;
        grouped[key].vehicles.push(vehicle);
      });
      
      const groupedArray = Object.values(grouped).sort((a, b) => b.count - a.count);
      setFilteredVehicles(groupedArray);
    } catch (error) {
      console.error('Error fetching available vehicles:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableVehicles();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAvailableVehicles();
    }, [])
  );

  useEffect(() => {
    // Filter by selected type
    const grouped = {};
    allVehicles
      .filter(v => v.type === selectedType)
      .forEach(vehicle => {
        const key = vehicle.vehicleNumber;
        if (!grouped[key]) {
          grouped[key] = {
            id: key,
            name: `${vehicle.type} - ${vehicle.vehicleNumber}`,
            type: vehicle.type,
            vehicleNumber: vehicle.vehicleNumber,
            count: 1,
            vehicles: [vehicle]
          };
        }
      });
    const groupedArray = Object.values(grouped).sort((a, b) => b.count - a.count);
    setFilteredVehicles(groupedArray);
  }, [selectedType, allVehicles]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAvailableVehicles();
    setRefreshing(false);
  };

  const getVehicleCountByType = (type) => {
    return allVehicles.filter(v => v.type === type).length;
  };

  const renderTypeButton = (type) => {
    const isSelected = selectedType === type;
    const count = getVehicleCountByType(type);
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
            borderLeftColor: count >= 1 ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.danger
          }
        ]}
        onPress={() => setSelectedType(type)}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.label]}>
            {type}
          </Text>
          <Text style={{ fontSize: 14, color: count >= 1 ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.danger, fontWeight: '600' }}>
            <Text>{count}</Text> available
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 48 }]}>
        <Text style={styles.headerTitle}>Available Vehicles</Text>
        <Text style={{ fontSize: 14, color: '#fff', textAlign: 'center', marginTop: 8 }}>
          Browse our fleet of equipment
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          <Text style={styles.loadingText}>Loading vehicles...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.label, { marginHorizontal: 16, marginBottom: 4, marginTop: 4 }]}>
              Available Vehicles
            </Text>
            {VEHICLE_TYPES.map((type) => renderTypeButton(type))}
          </View>


        </ScrollView>
      )}
    </View>
  );
};

export default CustomerAvailableVehicles;
