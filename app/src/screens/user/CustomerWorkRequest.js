import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  
  // Date/Time state management
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 8 * 60 * 60 * 1000));
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  
  const [availabilityInfo, setAvailabilityInfo] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [formData, setFormData] = useState({
    workType: 'EARTHWORK',
    customWorkType: '',
    vehiclesWanted: '',
    customerMobile: '',
    description: '',
    latitude: 0,
    longitude: 0,
    address: '',
    expectedDuration: 8
  });
  const [showCustomWorkType, setShowCustomWorkType] = useState(false);

  const { user } = useAuth();
  const { selectedLocation, clearSelectedLocation } = useLocationSelection();

  const selectedVehicleRate = VEHICLE_TYPE_HOURLY_RATE[formData.vehiclesWanted] || 0;
  const estimatedPayable = toNumber(formData.expectedDuration) * selectedVehicleRate;

  useEffect(() => {
    fetchAvailableVehicles();
  }, []);

  // Auto-calculate end date based on start date and duration
  useEffect(() => {
    const durationHours = Number(formData.expectedDuration) || 0;
    if (durationHours >= 1 && startDate) {
      const computedEnd = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
      // Only update if the calculated end is different and valid
      if (computedEnd > startDate && computedEnd.getTime() !== endDate.getTime()) {
        setEndDate(computedEnd);
        console.log('Auto-calculated end date:', {
          startDate: startDate.toISOString(),
          duration: durationHours,
          endDate: computedEnd.toISOString()
        });
      }
    }
  }, [startDate, formData.expectedDuration]);

  const fetchAvailableVehicles = async () => {
    try {
      const response = await apiService.getAvailableVehicles();
      setVehicles(response.data.data);
    } catch (error) {
      console.error('Error fetching available vehicles:', error);
    }
  };

  const checkAvailability = useCallback(async () => {
    if (!formData.vehiclesWanted || !startDate || !endDate) {
      setAvailabilityInfo(null);
      return;
    }

    try {
      setCheckingAvailability(true);

      // Validate dates
      if (endDate <= startDate) {
        setAvailabilityInfo(null);
        return;
      }

      console.log('Checking availability for:', {
        vehicleType: formData.vehiclesWanted,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      const response = await apiService.getAvailableVehiclesForDates(
        startDate.toISOString(),
        endDate.toISOString(),
        formData.vehiclesWanted
      );

      console.log('Availability check response:', response?.data);

      const availableVehicles = response.data.data || [];
      const unavailableVehicles = response.data.unavailableVehicles || [];
      const meta = response.data.meta || {};
      const availableCount = availableVehicles.length;

      if (availableCount > 0) {
        setAvailabilityInfo({
          available: true,
          count: availableCount,
          message: `${availableCount} of ${meta.totalVehicles || availableCount} ${formData.vehiclesWanted} vehicle(s) available for your selected dates`,
          vehicles: availableVehicles
        });
      } else {
        // No vehicles available - show detailed conflict information
        let detailedMessage = `All ${meta.totalVehicles || 0} ${formData.vehiclesWanted} vehicle(s) are busy during your selected time.`;
        
        if (unavailableVehicles.length > 0) {
          detailedMessage += '\n\n📋 Conflicting Bookings:';
          unavailableVehicles.forEach(vehicle => {
            detailedMessage += `\n\n🚜 ${vehicle.vehicleNumber}:`;
            if (vehicle.bookings && vehicle.bookings.length > 0) {
              vehicle.bookings.forEach(booking => {
                const start = new Date(booking.startDate);
                const end = new Date(booking.endDate);
                detailedMessage += `\n  • ${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleDateString()} ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                if (booking.workType) {
                  detailedMessage += ` (${booking.workType})`;
                }
              });
            } else if (vehicle.currentStatus !== 'AVAILABLE') {
              detailedMessage += `\n  Status: ${vehicle.currentStatus}`;
            }
          });
        }
        
        setAvailabilityInfo({
          available: false,
          count: 0,
          message: detailedMessage,
          vehicles: [],
          unavailableVehicles: unavailableVehicles
        });
      }
    } catch (error) {
      console.error('Error checking availability:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Set a generic error message but don't block the user
      setAvailabilityInfo({
        available: false,
        count: 0,
        message: 'Unable to check availability. Please try again or contact admin.',
        error: true
      });
    } finally {
      setCheckingAvailability(false);
    }
  }, [formData.vehiclesWanted, formData.expectedDuration, startDate, endDate]);

  // Check availability whenever dates or vehicle type changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkAvailability();
    }, 500); // Debounce to avoid too many API calls

    return () => clearTimeout(timeoutId);
  }, [checkAvailability]);

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

  // Date/Time Picker Handlers
  const handleStartDateChange = (event, selectedDate) => {
    setShowStartDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      // Preserve the time from current startDate
      const newDate = new Date(selectedDate);
      newDate.setHours(startDate.getHours());
      newDate.setMinutes(startDate.getMinutes());
      setStartDate(newDate);
      console.log('Start date updated:', newDate.toISOString());
    }
  };

  const handleStartTimeChange = (event, selectedTime) => {
    setShowStartTimePicker(false);
    if (event.type === 'set' && selectedTime) {
      const newDate = new Date(startDate);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setStartDate(newDate);
      console.log('Start time updated:', newDate.toISOString());
    }
  };

  const handleEndDateChange = (event, selectedDate) => {
    setShowEndDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      // Preserve the time from current endDate
      const newDate = new Date(selectedDate);
      newDate.setHours(endDate.getHours());
      newDate.setMinutes(endDate.getMinutes());
      
      // Validate end date is after start date
      if (newDate <= startDate) {
        Alert.alert('Invalid Date', 'End date must be after start date. Please adjust the duration or start date.');
        return;
      }
      
      setEndDate(newDate);
      console.log('End date updated:', newDate.toISOString());
    }
  };

  const handleEndTimeChange = (event, selectedTime) => {
    setShowEndTimePicker(false);
    if (event.type === 'set' && selectedTime) {
      const newDate = new Date(endDate);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      
      // Validate end time is after start time
      if (newDate <= startDate) {
        Alert.alert('Invalid Time', 'End time must be after start time. Please adjust the duration or start time.');
        return;
      }
      
      setEndDate(newDate);
      console.log('End time updated:', newDate.toISOString());
    }
  };

  const handleDurationChange = (value) => {
    const duration = parseInt(value, 10) || 0;
    handleInputChange('expectedDuration', duration);
    // End date will be auto-calculated by useEffect
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
    // Validate dates
    if (!startDate) {
      Alert.alert('Error', 'Please select a start date and time');
      return;
    }

    if (!endDate) {
      Alert.alert('Error', 'Please select an end date and time');
      return;
    }

    if (endDate <= startDate) {
      Alert.alert('Error', 'End date must be after start date');
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

    // Check availability before submitting
    if (availabilityInfo && !availabilityInfo.available) {
      Alert.alert(
        'Vehicle Not Available',
        'The selected vehicle type is not available for your chosen dates. Would you like to submit anyway? The admin will review and may suggest an alternative.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Submit Anyway', onPress: () => submitWorkRequest() }
        ]
      );
      return;
    }

    await submitWorkRequest();
  };

  const submitWorkRequest = async () => {
    setLoading(true);
    try {
      const workData = {
        ...formData,
        workType: formData.workType === 'OTHERS' ? formData.customWorkType : formData.workType,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
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
      Alert.alert('Success', 'Work request created successfully', [
        {
          text: 'OK',
          onPress: () => {
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
              expectedDuration: 8
            });
            setStartDate(new Date());
            setEndDate(new Date(Date.now() + 8 * 60 * 60 * 1000));
            setAvailabilityInfo(null);
            if (user?.role === 'USER') {
              navigation.navigate('CustomerHome');
            } else if (navigation.canGoBack()) {
              navigation.goBack();
            }
          }
        }
      ]);
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
              onChangeText={handleDurationChange}
              placeholder="e.g. 8"
              keyboardType="numeric"
            />
            <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 12, marginTop: -8 }}>
              ℹ️ End date will be auto-calculated based on duration
            </Text>

            {/* Start Date & Time Section */}
            <Text style={styles.label}>Start Date & Time *</Text>
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: 14,
                  backgroundColor: PREMIUM_LIGHT.surface,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: PREMIUM_LIGHT.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginRight: 4
                }}
                onPress={() => setShowStartDatePicker(true)}
              >
                <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.text }}>
                  📅 {startDate.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: 14,
                  backgroundColor: PREMIUM_LIGHT.surface,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: PREMIUM_LIGHT.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginLeft: 4
                }}
                onPress={() => setShowStartTimePicker(true)}
              >
                <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.text }}>
                  🕒 {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            </View>

            {/* End Date & Time Section */}
            <Text style={styles.label}>End Date & Time * (Auto-calculated, editable)</Text>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: 14,
                  backgroundColor: PREMIUM_LIGHT.accent + '10',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: PREMIUM_LIGHT.accent,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginRight: 4
                }}
                onPress={() => setShowEndDatePicker(true)}
              >
                <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.text }}>
                  📅 {endDate.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: 14,
                  backgroundColor: PREMIUM_LIGHT.accent + '10',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: PREMIUM_LIGHT.accent,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginLeft: 4
                }}
                onPress={() => setShowEndTimePicker(true)}
              >
                <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.text }}>
                  🕒 {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.muted, marginBottom: 12 }}>
              💡 Calculated: {Math.round((endDate - startDate) / (60 * 60 * 1000))} hours duration
            </Text>

            {/* Date/Time Pickers */}
            {showStartDatePicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleStartDateChange}
                minimumDate={new Date()}
              />
            )}
            {showStartTimePicker && (
              <DateTimePicker
                value={startDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleStartTimeChange}
              />
            )}
            {showEndDatePicker && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleEndDateChange}
                minimumDate={startDate}
              />
            )}
            {showEndTimePicker && (
              <DateTimePicker
                value={endDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleEndTimeChange}
              />
            )}

            {/* Vehicle Selection Section - After Date/Time */}
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

            {/* Availability Status */}
            {checkingAvailability && (
              <View style={{ 
                padding: 12, 
                backgroundColor: PREMIUM_LIGHT.info + '20', 
                borderRadius: 8, 
                marginBottom: 12,
                flexDirection: 'row',
                alignItems: 'center'
              }}>
                <ActivityIndicator size="small" color={PREMIUM_LIGHT.info} />
                <Text style={{ marginLeft: 8, color: PREMIUM_LIGHT.info }}>Checking availability...</Text>
              </View>
            )}

            {availabilityInfo && !checkingAvailability && (
              <View style={{ 
                padding: 12, 
                backgroundColor: availabilityInfo.available ? PREMIUM_LIGHT.success + '20' : PREMIUM_LIGHT.danger + '20',
                borderRadius: 8, 
                marginBottom: 12,
                borderLeftWidth: 4,
                borderLeftColor: availabilityInfo.available ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.danger
              }}>
                <Text style={{ 
                  fontWeight: '600', 
                  color: availabilityInfo.available ? PREMIUM_LIGHT.success : PREMIUM_LIGHT.danger,
                  marginBottom: 8,
                  fontSize: 16
                }}>
                  {availabilityInfo.available ? '✓ Available' : '✗ Not Available'}
                </Text>
                <Text style={{ 
                  color: PREMIUM_LIGHT.text,
                  fontSize: 13,
                  lineHeight: 20
                }}>
                  {availabilityInfo.message}
                </Text>
              </View>
            )}

            <Text style={styles.label}>Customer Mobile Number *</Text>
            <TextInput
              style={styles.input}
              value={formData.customerMobile || ''}
              onChangeText={handleCustomerMobileChange}
              placeholder="Enter mobile number"
              keyboardType="phone-pad"
              maxLength={10}
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