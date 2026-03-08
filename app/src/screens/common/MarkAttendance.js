import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';

const MarkAttendance = ({ navigation }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [driverId, setDriverId] = useState(isAdmin ? null : user?.id || null);
  const [vehicleId, setVehicleId] = useState(null);
  const [siteName, setSiteName] = useState('');
  const [checkInTime, setCheckInTime] = useState(new Date().toISOString());

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!driverId || !vehicleId) return false;
    return true;
  }, [driverId, vehicleId, submitting]);

  const load = async () => {
    try {
      setLoading(true);

      if (!isAdmin) {
        setDriverId(user?.id || null);
      } else {
        setDriverId(null);
      }

      if (isAdmin) {
        const [driversRes, vehiclesRes] = await Promise.all([
          apiService.getDrivers({ page: 1, limit: 200 }),
          apiService.getVehicles({ page: 1, limit: 200 }),
        ]);
        setDrivers(Array.isArray(driversRes?.data?.data) ? driversRes.data.data : []);
        setVehicles(Array.isArray(vehiclesRes?.data?.data) ? vehiclesRes.data.data : []);
      } else {
        const vehiclesRes = await apiService.getDriverVehicles(user?.id);
        setVehicles(Array.isArray(vehiclesRes?.data?.data) ? vehiclesRes.data.data : []);
      }
    } catch (error) {
      console.error('Load mark attendance error:', error);
      Alert.alert('Error', 'Failed to load attendance options.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!canSubmit) {
      Alert.alert('Missing info', 'Please select driver and vehicle.');
      return;
    }

    try {
      setSubmitting(true);
      await apiService.markAttendance({
        driverId,
        vehicleId,
        siteName: siteName?.trim() || undefined,
        checkInTime,
      });

      Alert.alert('Success', 'Attendance marked successfully.');
      navigation.goBack();
    } catch (error) {
      console.error('Mark attendance error:', error);
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Failed to mark attendance.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const markAsAbsent = async () => {
    if (!canSubmit) {
      Alert.alert('Missing info', 'Please select driver and vehicle.');
      return;
    }
    try {
      setSubmitting(true);
      await apiService.markAttendance({
        driverId,
        vehicleId,
        siteName: siteName?.trim() || undefined,
        checkInTime,
        status: 'ABSENT',
      });
      Alert.alert('Marked as Absent', 'Attendance marked as absent.');
      navigation.goBack();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Failed to mark absent.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading attendance...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 24 }]}> {/* Added marginTop to move header down */}
        <Text style={styles.headerTitle}>Mark Attendance</Text>
        <Text style={{ fontSize: 16, color: '#fff', textAlign: 'center', marginTop: 8 }}>
          {isAdmin ? 'Select driver and vehicle' : 'Confirm your attendance'}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {isAdmin ? (
              <>
                <Text style={styles.label}>Driver *</Text>
                {drivers.length === 0 ? (
                  <Text style={styles.subtitle}>No drivers found.</Text>
                ) : (
                  drivers.map((d) => (
                    <TouchableOpacity
                      key={d._id}
                      onPress={() => setDriverId(d._id)}
                      style={[
                        styles.row,
                        {
                          paddingVertical: 16,
                          paddingHorizontal: 12,
                          backgroundColor: driverId === d._id ? '#E8F5E9' : '#F7F7F7',
                          borderRadius: 12,
                          marginBottom: 12,
                          borderWidth: driverId === d._id ? 2 : 1,
                          borderColor: driverId === d._id ? '#43A047' : '#E0E0E0',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.12,
                          shadowRadius: 4,
                          elevation: 3,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: '#1976D2', fontWeight: 'bold' }]}>{d.name}</Text>
                        <Text style={styles.subtitle}>{d.phone || d.email || '—'}</Text>
                      </View>
                      <Text style={styles.subtitle}>{driverId === d._id ? 'Selected' : 'Select'}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </>
            ) : null}

            <Text style={[styles.label, { marginTop: 12 }]}>Vehicle *</Text>
            {vehicles.length === 0 ? (
              <Text style={styles.subtitle}>
                {isAdmin ? 'No vehicles found.' : 'No vehicle assigned to you yet.'}
              </Text>
            ) : (
              vehicles.map((v) => (
                <TouchableOpacity
                  key={v._id}
                  onPress={() => setVehicleId(v._id)}
                  style={[
                    styles.row,
                    {
                      paddingVertical: 16,
                      paddingHorizontal: 12,
                      backgroundColor: vehicleId === v._id ? '#FFF3E0' : '#F7F7F7',
                      borderRadius: 12,
                      marginBottom: 12,
                      borderWidth: vehicleId === v._id ? 2 : 1,
                      borderColor: vehicleId === v._id ? '#F57C00' : '#E0E0E0',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.12,
                      shadowRadius: 4,
                      elevation: 3,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: '#F57C00', fontWeight: 'bold' }]}>{v.vehicleNumber}</Text>
                    <Text style={styles.subtitle}>
                      {v.type} • ₹{v.hourlyRate || 0}/hr
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={styles.subtitle}>{vehicleId === v._id ? 'Selected' : 'Select'}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            <Text style={[styles.label, { marginTop: 12 }]}>Site Name (optional)</Text>
            <TextInput
              style={styles.input}
              value={siteName}
              onChangeText={setSiteName}
              placeholder="e.g. Anna Nagar site"
            />

            <Text style={styles.subtitle}>
              Check-in time: {new Date(checkInTime).toLocaleString()}
            </Text>


            <TouchableOpacity
              style={[styles.button, !canSubmit && { opacity: 0.6 }]}
              onPress={submit}
              disabled={!canSubmit}
            >
              <Text style={styles.buttonText}>{submitting ? 'Saving…' : 'Mark Attendance'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#e53935', marginTop: 8 }]}
              onPress={markAsAbsent}
              disabled={submitting}
            >
              <Text style={styles.buttonText}>Mark as Absent</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => navigation.goBack()}
              disabled={submitting}
            >
              <Text style={styles.buttonTextOnDark}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default MarkAttendance;
