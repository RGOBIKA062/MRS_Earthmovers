import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useLocationSelection } from '../../context/LocationContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';

const WORK_TYPES = [
  { key: 'EARTHWORK', label: 'Earthwork' },
  { key: 'PIPELINE', label: 'Pipeline' },
  { key: 'DEMOLITION', label: 'Demolition' },
  { key: 'ROAD_CONSTRUCTION', label: 'Road Construction' },
  { key: 'FOUNDATIONS', label: 'Foundations' },
  { key: 'LANDSCAPING', label: 'Landscaping' },
  { key: 'OTHERS', label: 'Others' },
];

const VEHICLE_TYPE_HOURLY_RATE = {
  JCB: 1000,
  Hitachi: 1200,
  Rocksplitter: 1500,
  Tractor: 800,
  Compressor: 800,
  Tipper: 1000,
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRupees = (value) => {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const parseDateInput = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed;
};

const CustomerWorkRequest = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [startDateInput, setStartDateInput] = useState(new Date().toISOString().slice(0, 16));
  const [endDateInput, setEndDateInput] = useState(new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [formData, setFormData] = useState({
    workType: 'EARTHWORK',
    customWorkType: '',
    vehiclesWanted: '',
    customerMobile: '',
    description: '',
    latitude: 0,
    longitude: 0,
    address: '',
    expectedDuration: 8,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
  });
  const [showCustomWorkType, setShowCustomWorkType] = useState(false);

  const { user } = useAuth();
  const { selectedLocation, clearSelectedLocation } = useLocationSelection();

  const selectedVehicleRate = VEHICLE_TYPE_HOURLY_RATE[formData.vehiclesWanted] || 0;
  const estimatedPayable = toNumber(formData.expectedDuration) * selectedVehicleRate;

  useEffect(() => {
    fetchAvailableVehicles();
  }, []);

  useEffect(() => {
    const start = parseDateInput(startDateInput);
    if (!start) return;

    const durationHours = Number(formData.expectedDuration) || 0;
    if (durationHours >= 1) {
      const computedEnd = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      const computedEndText = computedEnd.toISOString().slice(0, 16);
      
      // Always ensure end date/time is after start date/time
      if (computedEnd > start && computedEndText !== endDateInput) {
        setEndDateInput(computedEndText);
      }
    }
  }, [startDateInput, formData.expectedDuration]);

  const fetchAvailableVehicles = async () => {
    try {
      const response = await apiService.getAvailableVehicles();
      setVehicles(response.data.data);
    } catch (error) {
      console.error('Error fetching available vehicles:', error);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomerMobileChange = (value) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
    handleInputChange('customerMobile', digitsOnly);
  };

  const handleWorkTypeSelect = (key) => {
    handleInputChange('workType', key);
    if (key === 'OTHERS') {
      setShowCustomWorkType(true);
    } else {
      setShowCustomWorkType(false);
      handleInputChange('customWorkType', '');
    }
  };

  const handleStartDateChange = (text) => {
    const newStartDateInput = text.replace(' ', 'T');
    setStartDateInput(newStartDateInput);
    
    // Validate against end date
    const newStart = parseDateInput(newStartDateInput);
    const currentEnd = parseDateInput(endDateInput);
    
    if (newStart && currentEnd && newStart >= currentEnd) {
      // Auto-adjust end date to be at least 1 hour after start
      const adjustedEnd = new Date(newStart.getTime() + (formData.expectedDuration || 1) * 60 * 60 * 1000);
      setEndDateInput(adjustedEnd.toISOString().slice(0, 16));
    }
  };

  const handleEndDateChange = (text) => {
    const newEndDateInput = text.replace(' ', 'T');
    const newEnd = parseDateInput(newEndDateInput);
    const currentStart = parseDateInput(startDateInput);
    
    // Only allow end date if it's after start date
    if (newEnd && currentStart && newEnd <= currentStart) {
      Alert.alert('Invalid Date', 'End date must be after start date');
      return;
    }
    
    setEndDateInput(newEndDateInput);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (!selectedLocation) return;
      setFormData((prev) => ({
        ...prev,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        address: selectedLocation.address,
      }));
      clearSelectedLocation();
    }, [selectedLocation, clearSelectedLocation])
  );

  const handleSubmit = async () => {
    const start = parseDateInput(startDateInput);
    const end = parseDateInput(endDateInput);

    if (!start) {
      Alert.alert('Error', 'Please provide a valid Start Date');
      return;
    }

    if (!end) {
      Alert.alert('Error', 'Please provide a valid End Date');
      return;
    }

    if (end <= start) {
      Alert.alert('Error', 'End Date must be after Start Date');
      return;
    }

    if (!formData.description.trim()) {
      Alert.alert('Error', 'Please provide a description of the work');
      return;
    }

    if (!/^\d{10}$/.test(formData.customerMobile || '')) {
      Alert.alert('Error', 'Customer mobile number must be exactly 10 digits');
      return;
    }

    if (!formData.address.trim()) {
      Alert.alert('Error', 'Please select a location');
      return;
    }

    if (!formData.latitude || !formData.longitude) {
      Alert.alert('Error', 'Please pick a location to set coordinates');
      return;
    }

    if (!formData.expectedDuration || formData.expectedDuration < 1) {
      Alert.alert('Error', 'Please provide a valid duration');
      return;
    }

    if (formData.workType === 'OTHERS' && !formData.customWorkType.trim()) {
      Alert.alert('Error', 'Please enter the custom work type');
      return;
    }

    setLoading(true);
    try {
      const workData = {
        ...formData,
        workType: formData.workType === 'OTHERS' ? formData.customWorkType : formData.workType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        customer: user.id,
        location: {
          latitude: formData.latitude,
          longitude: formData.longitude,
          address: formData.address,
        },
        preferredVehicleType: formData.vehiclesWanted || null,
      };
      delete workData.customWorkType;
      delete workData.vehiclesWanted;
      console.log('Submitting work request:', workData);
      const response = await apiService.createWorkRequest(workData);
      Alert.alert('Success', 'Work request created successfully');
      // Reset form after successful submission
      setFormData({
        workType: 'EARTHWORK',
        customWorkType: '',
        vehiclesWanted: '',
        customerMobile: '',
        description: '',
        latitude: 0,
        longitude: 0,
        address: '',
        expectedDuration: 8,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
      });
      setStartDateInput(new Date().toISOString().slice(0, 16));
      setEndDateInput(new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16));
      if (user?.role === 'USER') {
        navigation.navigate('CustomerHome');
      } else if (navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch (error) {
      console.log('Error response:', error.response?.data);
      Alert.alert('Error', 'Failed to create work request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 48 }]}> 
        <Text style={styles.headerTitle}>{user?.role === 'ADMIN' ? 'Admin Portal' : 'Customer Portal'}</Text>
        <Text style={{ fontSize: 16, color: '#fff', textAlign: 'center', marginTop: 8 }}>
          Fill the details for your earthmoving work
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <AnimatedPressable
            style={[styles.button, styles.buttonSecondary, { marginHorizontal: 16, marginTop: 16, marginBottom: 12 }]}
            onPress={() => navigation.navigate('CustomerAvailableVehicles')}
          >
            <Text style={styles.buttonTextOnDark}>🚛 Available Vehicles</Text>
          </AnimatedPressable>

          <View style={styles.card}>
            <Text style={styles.title}>Work Details</Text>

            <Text style={styles.label}>Work Type *</Text>
            <View style={localStyles.chipRow}>
              {WORK_TYPES.map((t) => {
                const selected = formData.workType === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[localStyles.chip, selected && localStyles.chipSelected]}
                    onPress={() => handleWorkTypeSelect(t.key)}
                  >
                    <Text style={[localStyles.chipText, selected && localStyles.chipTextSelected]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {showCustomWorkType && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.label}>Enter Work Type *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.customWorkType}
                  onChangeText={(value) => handleInputChange('customWorkType', value)}
                  placeholder="Enter custom work type"
                />
              </View>
            )}

              <Text style={styles.label}>Vehicles Preferred *</Text>
              <View style={{ borderWidth: 1, borderColor: PREMIUM_LIGHT.border, borderRadius: 8, backgroundColor: PREMIUM_LIGHT.surface, marginBottom: 12 }}>
                <Picker
                  selectedValue={formData.vehiclesWanted}
                  onValueChange={(value) => handleInputChange('vehiclesWanted', value)}
                  style={{ minHeight: 48, fontSize: 16, color: PREMIUM_LIGHT.text }}
                  itemStyle={{ fontSize: 16 }}
                >
                  <Picker.Item label="Select vehicle type" value="" />
                  <Picker.Item label="JCB (₹1000/hr)" value="JCB" />
                  <Picker.Item label="Hitachi (₹1200/hr)" value="Hitachi" />
                  <Picker.Item label="Rocksplitter (₹1500/hr)" value="Rocksplitter" />
                  <Picker.Item label="Tractor (₹800/hr)" value="Tractor" />
                  <Picker.Item label="Compressor (₹800/hr)" value="Compressor" />
                  <Picker.Item label="Tipper (₹1000/hr approx.)" value="Tipper" />
                </Picker>
              </View>

              {selectedVehicleRate > 0 ? (
                <Text style={[styles.subtitle, { marginBottom: 12 }]}> 
                  Estimated Payable: {toNumber(formData.expectedDuration)} hrs × {formatRupees(selectedVehicleRate)}/hr = {formatRupees(estimatedPayable)}
                </Text>
              ) : null}
              <Text style={styles.label}>Customer Mobile Number *</Text>
              <TextInput
                style={styles.input}
                value={formData.customerMobile || ''}
                onChangeText={handleCustomerMobileChange}
                placeholder="Enter mobile number"
                keyboardType="phone-pad"
                maxLength={10}
              />

            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
              value={formData.description}
              onChangeText={(value) => handleInputChange('description', value)}
              placeholder="Describe the work you need done..."
              multiline
            />

            <Text style={styles.label}>Expected Duration (hours) *</Text>
            <TextInput
              style={styles.input}
              value={String(formData.expectedDuration ?? '')}
              onChangeText={(value) => handleInputChange('expectedDuration', parseInt(value, 10) || 0)}
              placeholder="e.g. 8"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Start Date (YYYY-MM-DDTHH:mm) *</Text>
            <TextInput
              style={styles.input}
              value={startDateInput.replace('T', ' ')}
              onChangeText={handleStartDateChange}
              placeholder="2026-01-15 10:30"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>End Date (auto-calculated, editable) *</Text>
            <TextInput
              style={styles.input}
              value={endDateInput.replace('T', ' ')}
              onChangeText={handleEndDateChange}
              placeholder="2026-01-15 18:30"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Location / Address *</Text>
            <TextInput
              style={styles.input}
              value={formData.address}
              onChangeText={(value) => handleInputChange('address', value)}
              placeholder="Enter address (or pick below)"
            />

            <TouchableOpacity
              style={styles.mapContainer}
              onPress={() =>
                navigation.navigate('MapSelect', {
                  initial: {
                    latitude: formData.latitude,
                    longitude: formData.longitude,
                    address: formData.address,
                  },
                })
              }
            >
              <Text style={{
                flex: 1,
                textAlign: 'center',
                textAlignVertical: 'center',
                color: PREMIUM_LIGHT.muted
              }}>
                {formData.address
                  ? `📍 ${formData.address}`
                  : '🗺️ Tap to pick location (required)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonTextOnDark}>
                {loading ? 'Creating...' : 'Create Work Request'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PREMIUM_LIGHT.border,
    backgroundColor: PREMIUM_LIGHT.surface,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    borderColor: 'rgba(255,138,0,0.45)',
    backgroundColor: PREMIUM_LIGHT.accentSoft,
  },
  chipText: {
    color: PREMIUM_LIGHT.text,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: PREMIUM_LIGHT.accent,
  },
});

export default CustomerWorkRequest;