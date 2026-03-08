import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, ScrollView } from 'react-native';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';

export default function VehicleDetails({ route, navigation }) {
  const vehicleId = route?.params?.vehicleId;
  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState(null);

  const load = async () => {
    if (!vehicleId) {
      setVehicle(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await apiService.get(`/vehicles/${vehicleId}`);
      setVehicle(res?.data?.data || null);
    } catch (e) {
      setVehicle(null);
      Alert.alert('Error', 'Failed to load vehicle details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading vehicle…</Text>
      </View>
    );
  }

  if (!vehicle) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Vehicle Details</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Vehicle not found.</Text>
          <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={() => navigation.goBack()}>
            <Text style={styles.buttonTextOnDark}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Vehicle Details</Text>
        <Text style={{ fontSize: 16, color: '#fff', textAlign: 'center', marginTop: 8 }}>
          {vehicle.vehicleNumber}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.card}>
          <Text style={styles.title}>{vehicle.type}</Text>
          <Text style={styles.subtitle}>Vehicle Number: {vehicle.vehicleNumber}</Text>
          <Text style={[styles.subtitle, { marginTop: 8 }]}>Status: {vehicle.status}</Text>
          <Text style={styles.subtitle}>Hourly Rate: ₹{vehicle.hourlyRate}/hr</Text>
          <Text style={styles.subtitle}>Capacity: {vehicle.capacity}</Text>

          {vehicle.driver ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.title}>Assigned Driver</Text>
              <Text style={styles.subtitle}>{vehicle.driver.name}</Text>
              <Text style={styles.subtitle}>{vehicle.driver.phone || vehicle.driver.email || ''}</Text>
            </View>
          ) : null}

          {vehicle.location?.address ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.title}>Last Location</Text>
              <Text style={styles.subtitle}>{vehicle.location.address}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={load}>
            <Text style={styles.buttonTextOnDark}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
