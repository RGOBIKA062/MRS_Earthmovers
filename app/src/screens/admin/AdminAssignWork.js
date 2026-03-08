import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const AdminAssignWork = ({ route, navigation }) => {
  const workRequestId = route?.params?.workRequestId;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [workRequest, setWorkRequest] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);

  const canSubmit = useMemo(() => {
    return !!workRequestId && !!selectedDriverId && !!selectedVehicleId && !submitting;
  }, [workRequestId, selectedDriverId, selectedVehicleId, submitting]);

  const load = async () => {
    if (!workRequestId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [wrRes, driversRes, vehiclesRes] = await Promise.all([
        apiService.getWorkRequest(workRequestId),
        apiService.getDrivers({ page: 1, limit: 100 }),
        apiService.getAvailableVehicles(),
      ]);

      setWorkRequest(wrRes?.data?.data || null);
      setDrivers(Array.isArray(driversRes?.data?.data) ? driversRes.data.data : []);
      setVehicles(Array.isArray(vehiclesRes?.data?.data) ? vehiclesRes.data.data : []);
    } catch (error) {
      console.error('Error loading assignment data:', error);
      Alert.alert('Error', 'Failed to load assignment data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workRequestId]);

  const assign = async () => {
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      await apiService.assignWork(workRequestId, {
        vehicleId: selectedVehicleId,
        driverId: selectedDriverId,
      });

      Alert.alert('Assigned', 'Work has been assigned successfully.');
      navigation.goBack();
    } catch (error) {
      console.error('Assign work error:', error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to assign work. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!workRequestId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Assign Work</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.subtitle}>Missing work request id.</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
        <Text style={styles.loadingText}>Loading assignment data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Assign Work</Text>
        <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
          Select a driver and available vehicle
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <View style={styles.card}>
          <Text style={styles.title}>Request Details</Text>
          {!!workRequest?.workType && (
            <Text style={styles.subtitle}>Type: {workRequest.workType}</Text>
          )}
          {!!workRequest?.location?.address && (
            <Text style={styles.subtitle}>📍 {workRequest.location.address}</Text>
          )}
          {!!workRequest?.customer && (
            <Text style={styles.subtitle}>
              👤 {workRequest.customer.name} • {workRequest.customer.phone}
            </Text>
          )}
          {!!workRequest?.expectedDuration && (
            <Text style={styles.subtitle}>
              ⏱️ Expected: {workRequest.expectedDuration} hours
            </Text>
          )}
        </View>

        {workRequest?.preferredVehicleType && (
          <View style={{
            ...styles.card,
            backgroundColor: '#FFF3E0',
            borderLeftWidth: 4,
            borderLeftColor: '#FF9800'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 18, marginRight: 8 }}>⭐</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FF6F00' }}>Customer's Preferred Vehicle</Text>
            </View>
            <View style={{
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              marginTop: 8
            }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#FF6F00' }}>
                {workRequest.preferredVehicleType}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: '#FF6F00', marginTop: 8 }}>
              💡 Try to assign a {workRequest.preferredVehicleType} to match customer's preference
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.title}>Choose Driver</Text>
          {drivers.length === 0 ? (
            <Text style={styles.subtitle}>No drivers found.</Text>
          ) : (
            drivers.map((d) => (
              <TouchableOpacity
                key={d._id}
                onPress={() => setSelectedDriverId(d._id)}
                activeOpacity={0.8}
                style={[
                  styles.row,
                  {
                    paddingVertical: 12,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor:
                      selectedDriverId === d._id
                        ? 'rgba(255,138,0,0.40)'
                        : 'transparent',
                    backgroundColor:
                      selectedDriverId === d._id
                        ? PREMIUM_LIGHT.accentSoft
                        : 'transparent',
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{d.name}</Text>
                  <Text style={styles.subtitle}>{d.phone || d.email || '—'}</Text>
                </View>
                <Text style={styles.subtitle}>
                  {selectedDriverId === d._id ? 'Selected' : 'Select'}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Choose Vehicle</Text>
          {vehicles.length === 0 ? (
            <Text style={styles.subtitle}>No available vehicles.</Text>
          ) : (
            vehicles.map((v) => {
              const isMatching = workRequest?.preferredVehicleType && v.type === workRequest.preferredVehicleType;
              return (
                <TouchableOpacity
                  key={v._id}
                  onPress={() => setSelectedVehicleId(v._id)}
                  activeOpacity={0.8}
                  style={[
                    styles.row,
                    {
                      paddingVertical: 12,
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      marginTop: 8,
                      borderWidth: 2,
                      borderColor: isMatching ? '#4CAF50' : (selectedVehicleId === v._id ? 'rgba(255,138,0,0.40)' : '#E0E0E0'),
                      backgroundColor: isMatching ? '#F1F8F4' : (selectedVehicleId === v._id ? PREMIUM_LIGHT.accentSoft : 'transparent'),
                    },
                  ]}
                >
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={styles.title}>{v.vehicleNumber}</Text>
                      {isMatching && <Text style={{ marginLeft: 8, color: '#4CAF50', fontWeight: '700' }}>✓</Text>}
                    </View>
                    <Text style={styles.subtitle}>
                      {v.type} • ₹{v.hourlyRate || 0}/hr
                    </Text>
                    {v.status && (
                      <Text style={{ fontSize: 11, color: PREMIUM_LIGHT.muted, marginTop: 4 }}>
                        Status: {v.status}
                      </Text>
                    )}
                    {isMatching && (
                      <Text style={{ fontSize: 11, color: '#4CAF50', marginTop: 6, fontWeight: '600' }}>
                        ✓ Matches customer preference
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <View style={{
                      backgroundColor: isMatching ? '#4CAF50' : PREMIUM_LIGHT.accentSoft,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6
                    }}>
                      <Text style={[styles.subtitle, { fontSize: 11, fontWeight: '600', color: isMatching ? '#fff' : PREMIUM_LIGHT.accent }]}>
                        {v.type}
                      </Text>
                    </View>
                    <Text style={[styles.subtitle, { marginTop: 8 }]}>
                      {selectedVehicleId === v._id ? 'Selected' : 'Select'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={[styles.button, !canSubmit && { opacity: 0.6 }]}
          onPress={assign}
          disabled={!canSubmit}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Assigning…' : 'Assign Work'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default AdminAssignWork;
