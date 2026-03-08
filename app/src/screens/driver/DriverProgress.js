import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, Modal, TouchableOpacity, Alert, ScrollView, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';
import AnimatedPressable from '../../components/AnimatedPressable';

const devHost = Constants.expoConfig?.hostUri?.split(':')?.[0];
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (devHost ? `http://${devHost}:3000/api` : 'http://localhost:3000/api');
const FILE_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

const DriverProgress = ({ route, navigation }) => {
  const { assignmentId } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workAssignment, setWorkAssignment] = useState(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhotoType, setSelectedPhotoType] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLiveTrackingEnabled, setIsLiveTrackingEnabled] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const timerInterval = useRef(null);
  const locationSubscription = useRef(null);

  const { user } = useAuth();

  const fetchWorkAssignment = async () => {
    try {
      setLoading(true);
      const response = await apiService.getDriverWorkList(user.id);
      const assignment = response.data.data.find(assignment => assignment._id === assignmentId);
      setWorkAssignment(assignment);
    } catch (error) {
      console.error('Error fetching work assignment:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateWorkStatus = async (status, data = {}) => {
    try {
      const response = await apiService.updateWorkAssignmentStatus(assignmentId, {
        status,
        ...data
      });
      setWorkAssignment(response.data.data);
      await fetchWorkAssignment();
      return { success: true };
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update work status.';
      console.error('Error updating work status:', error);
      Alert.alert('Status Update Failed', message);
      return { success: false, message };
    }
  };

  const openPhotoModal = (photoType) => {
    setSelectedPhotoType(photoType);
    setPhotoModalVisible(true);
  };

  const uploadPhotoProof = async (assetUri, proofType, geoTag) => {
    const workAssignmentId = workAssignment?._id || assignmentId;
    const workRequestId =
      workAssignment?.workRequest?._id ||
      workAssignment?.workRequest?.id ||
      workAssignment?.workRequest;
    if (!workRequestId) {
      throw new Error('Work request not found for this assignment');
    }

    const normalizedWorkAssignmentId = String(workAssignmentId);
    const normalizedWorkRequestId = String(workRequestId);

    const baseLocation =
      workAssignment?.location?.address
        ? workAssignment.location
        : workAssignment?.workRequest?.location || { latitude: 0, longitude: 0, address: '' };

    const resolvedLocation = geoTag || baseLocation || { latitude: 0, longitude: 0, address: '' };

    // Fix for "...fromPath-Could not open file" errors by preserving valid URI schemes.
    let fileUri = String(assetUri || '');
    if (
      Platform.OS === 'android' &&
      fileUri &&
      !fileUri.startsWith('file://') &&
      !fileUri.startsWith('content://') &&
      !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(fileUri)
    ) {
      fileUri = `file://${fileUri}`;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: 'image/jpeg',
      name: `${proofType.toLowerCase()}-${Date.now()}.jpg`,
    });
    formData.append('workAssignment', normalizedWorkAssignmentId);
    formData.append('workRequest', normalizedWorkRequestId);
    formData.append('type', proofType);
    formData.append('title', `${proofType} Photo`);
    formData.append('description', `Captured by driver at ${new Date().toLocaleString()}`);
    formData.append('latitude', String(resolvedLocation.latitude || 0));
    formData.append('longitude', String(resolvedLocation.longitude || 0));
    if (resolvedLocation.accuracy !== undefined) {
      formData.append('accuracy', String(resolvedLocation.accuracy));
    }
    formData.append('address', String(resolvedLocation.address || ''));

    try {
      await apiService.post('/photo-proofs', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (error) {
      const status = error?.response?.status;
      const url = error?.config?.url;
      const baseURL = error?.config?.baseURL;
      const responseData = error?.response?.data;
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Upload failed';

      const details = error?.response?.data?.details;
      const detailsText = details ? ` (${JSON.stringify(details)})` : '';

      const bodySnippet =
        typeof responseData === 'string' && responseData
          ? ` (body: ${responseData.slice(0, 160).replace(/\s+/g, ' ').trim()}${responseData.length > 160 ? '…' : ''})`
          : '';

      const joined = baseURL
        ? `${String(baseURL).replace(/\/+$/, '')}/${String(url || '').replace(/^\/+/, '')}`
        : String(url || '');
      const hint = status === 404 && baseURL ? ` (check API route: ${joined})` : '';

      throw new Error(status ? `Upload failed (${status}): ${message}${detailsText}${bodySnippet}${hint}` : message);
    }
  };

  const formatAddress = (place) => {
    if (!place) return '';
    const parts = [
      place.name,
      place.street,
      place.city,
      place.region,
      place.postalCode,
      place.country,
    ].filter(Boolean);
    return parts.join(', ');
  };

  const getCurrentGeoTag = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Location permission is required to geotag the photo.');
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const { latitude, longitude, accuracy } = position.coords || {};
    let address = '';
    try {
      const places = await Location.reverseGeocodeAsync({ latitude, longitude });
      address = formatAddress(places?.[0]);
    } catch (error) {
      address = '';
    }

    return { latitude, longitude, accuracy, address };
  };

  const startLiveTracking = async () => {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for live tracking.');
        return false;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        Alert.alert('Background Permission', 'Background location permission is required to track your route during work. This helps customers see your progress.');
        // Continue anyway with foreground tracking
      }

      // Start watching position
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 30000, // Update every 30 seconds
          distanceInterval: 50, // Or when moved 50 meters
        },
        async (location) => {
          const { latitude, longitude, accuracy } = location.coords;
          
          // Get address from coordinates
          let address = '';
          try {
            const places = await Location.reverseGeocodeAsync({ latitude, longitude });
            address = formatAddress(places?.[0]);
          } catch (error) {
            console.error('Error getting address:', error);
            address = 'Location not available';
          }
          
          setCurrentLocation({ latitude, longitude, accuracy, address });
          
          // Send location update to backend
          sendLocationUpdate(latitude, longitude, accuracy, address);
        }
      );

      setIsLiveTrackingEnabled(true);
      return true;
    } catch (error) {
      console.error('Error starting live tracking:', error);
      Alert.alert('Tracking Error', 'Failed to start live tracking.');
      return false;
    }
  };

  const stopLiveTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    setIsLiveTrackingEnabled(false);
    setCurrentLocation(null);
  };

  const sendLocationUpdate = async (latitude, longitude, accuracy, address) => {
    try {
      await apiService.post(`/drivers/work-assignments/${assignmentId}/location`, {
        latitude,
        longitude,
        accuracy,
        address,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending location update:', error);
      // Don't show alert for location updates to avoid spamming the user
    }
  };

  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Camera permission is required to take photos.');
        return;
      }

      // Prefer new API; avoid deprecated MediaTypeOptions.
      // Fallback to string works across modern expo-image-picker versions.
      const mediaTypes = [ImagePicker?.MediaType?.Images || 'images'];

      const result = await ImagePicker.launchCameraAsync({
        ...(mediaTypes ? { mediaTypes } : {}),
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        const uri = result.assets?.[0]?.uri;
        if (!uri) {
          throw new Error('Could not read captured photo');
        }

        const geoTag = await getCurrentGeoTag();
        await uploadPhotoProof(uri, selectedPhotoType, geoTag);
        
        // If this is a BEFORE photo, ask to enable live tracking
        if (selectedPhotoType === 'BEFORE') {
          Alert.alert(
            'Enable Live Updates?',
            'Share your live location with customers so they can track your progress during the work. This helps build trust and transparency.',
            [
              {
                text: 'Not Now',
                style: 'cancel',
                onPress: async () => {
                  await updateWorkStatus('IN_PROGRESS');
                }
              },
              {
                text: 'Enable Tracking',
                onPress: async () => {
                  const started = await startLiveTracking();
                  if (started) {
                    Alert.alert('Live Tracking Enabled', 'Your location will be shared with customers until work is completed.');
                  }
                  await updateWorkStatus('IN_PROGRESS');
                }
              }
            ]
          );
        }
        
        await fetchWorkAssignment();
        setPhotoModalVisible(false);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Photo upload failed', error?.message || 'Please try again.');
    }
  };

  useEffect(() => {
    fetchWorkAssignment();
  }, [assignmentId]);

  useEffect(() => {
    // Update current time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  useEffect(() => {
    // Calculate elapsed time if work is in progress
    if (workAssignment?.startTime && !workAssignment?.endTime) {
      const interval = setInterval(() => {
        const elapsed = (new Date() - new Date(workAssignment.startTime)) / 1000;
        setElapsedTime(elapsed);
      }, 1000);
      timerInterval.current = interval;
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [workAssignment?.startTime, workAssignment?.endTime]);

  useEffect(() => {
    // Stop live tracking when work is completed
    if (workAssignment?.status === 'COMPLETED') {
      stopLiveTracking();
    }
  }, [workAssignment?.status]);

  useEffect(() => {
    // Cleanup tracking on unmount
    return () => {
      stopLiveTracking();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWorkAssignment();
    setRefreshing(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ASSIGNED': return PREMIUM_LIGHT.info;
      case 'STARTED': return PREMIUM_LIGHT.accent;
      case 'REACHED_SITE': return PREMIUM_LIGHT.info;
      case 'IN_PROGRESS': return PREMIUM_LIGHT.success;
      case 'COMPLETED': return PREMIUM_LIGHT.success;
      case 'CANCELLED': return PREMIUM_LIGHT.danger;
      default: return PREMIUM_LIGHT.muted;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'ASSIGNED': return 'Assigned';
      case 'STARTED': return 'Started';
      case 'REACHED_SITE': return 'Reached Site';
      case 'IN_PROGRESS': return 'In Progress';
      case 'COMPLETED': return 'Completed';
      case 'CANCELLED': return 'Cancelled';
      default: return status;
    }
  };

  const getProgressSteps = () => {
    if (!workAssignment) return [];
    
    const steps = [
      { id: 'assigned', label: 'Assigned', status: 'completed' },
      { id: 'started', label: 'Started', status: workAssignment.status !== 'ASSIGNED' ? 'completed' : 'pending' },
      { id: 'reached', label: 'Reached Site', status: workAssignment.status === 'REACHED_SITE' || workAssignment.status === 'IN_PROGRESS' || workAssignment.status === 'COMPLETED' ? 'completed' : 'pending' },
      { id: 'inprogress', label: 'In Progress', status: workAssignment.status === 'IN_PROGRESS' || workAssignment.status === 'COMPLETED' ? 'completed' : 'pending' },
      { id: 'completed', label: 'Completed', status: workAssignment.status === 'COMPLETED' ? 'completed' : 'pending' }
    ];

    return steps;
  };

  const renderProgressSteps = () => {
    const steps = getProgressSteps();
    
    return (
      <View style={styles.progressContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepperRow}>
          {steps.map((step, index) => {
            const done = step.status === 'completed';
            const current = step.status === 'current';
            const nextDone = index < steps.length - 1 ? steps[index + 1].status === 'completed' : false;

            return (
              <React.Fragment key={step.id}>
                <View style={styles.stepperItem}>
                  <View
                    style={[
                      styles.stepperDot,
                      done && styles.stepperDotCompleted,
                      current && styles.stepperDotActive,
                    ]}
                  >
                    {done && <Text style={styles.stepperCheck}>✓</Text>}
                  </View>
                  <Text
                    style={[
                      styles.stepperLabel,
                      done && styles.stepperLabelCompleted,
                      current && styles.stepperLabelActive,
                    ]}
                    numberOfLines={2}
                  >
                    {step.label}
                  </Text>
                </View>
                {index < steps.length - 1 && (
                  <View style={[styles.stepperConnector, nextDone && styles.stepperConnectorCompleted]} />
                )}
              </React.Fragment>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const formatElapsedTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDurationHours = (hoursValue) => {
    const totalMinutes = Math.max(0, Math.round((Number(hoursValue) || 0) * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const getDateKey = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  };

  const getPhotoTypes = () => {
    return new Set((workAssignment?.workRequest?.photos || []).map((p) => p?.type).filter(Boolean));
  };

  const getPhotoProofLabel = (photo) => {
    const type = String(photo?.type || '').toUpperCase();
    if (type === 'BEFORE') return 'Before Photo of Work';
    if (type === 'AFTER') return 'After Photo of Work';
    return photo?.title || 'Photo of Work';
  };

  const hasPhoto = (type) => getPhotoTypes().has(type);

  const scheduledDateKey = getDateKey(workAssignment?.workRequest?.startDate || workAssignment?.startTime);
  const todayDateKey = getDateKey(new Date());
  const canStartToday = !scheduledDateKey || scheduledDateKey === todayDateKey;

  const handleReachedSiteAndOpenBeforePhoto = async () => {
    const result = await updateWorkStatus('REACHED_SITE');
    if (result.success) {
      openPhotoModal('BEFORE');
    }
  };

  const renderLiveUpdates = () => {
    if (workAssignment.status === 'COMPLETED' || workAssignment.status === 'ASSIGNED') {
      return null;
    }

    return (
      <View style={{ marginTop: 16, padding: 12, backgroundColor: PREMIUM_LIGHT.accentSoft, borderRadius: 12, borderWidth: 1, borderColor: PREMIUM_LIGHT.accent }}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: PREMIUM_LIGHT.accent, marginBottom: 8 }}>📡 Live Updates</Text>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50', marginRight: 8 }} />
          <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text, fontWeight: '600' }}>Status: {getStatusText(workAssignment.status)}</Text>
        </View>

        {isLiveTrackingEnabled && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text }}>📍 GPS Tracking: </Text>
            <Text style={{ fontSize: 13, color: '#4CAF50', fontWeight: '900' }}>Active</Text>
          </View>
        )}

        {currentLocation && (
          <View style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text }}>📍 Current Location:</Text>
            <Text style={{ fontSize: 12, color: PREMIUM_LIGHT.text, fontWeight: '600', marginTop: 2, paddingLeft: 20 }}>
              {currentLocation.address || 'Getting location...'}
            </Text>
          </View>
        )}

        {workAssignment.startTime && !workAssignment.endTime && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text }}>⏱️ Elapsed Time: </Text>
            <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.accent, fontWeight: '900' }}>{formatElapsedTime(elapsedTime)}</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text }}>🕐 Current Time: </Text>
          <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text, fontWeight: '600' }}>{currentTime.toLocaleTimeString()}</Text>
        </View>

        {workAssignment.startTime && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text }}>🚀 Started At: </Text>
            <Text style={{ fontSize: 13, color: PREMIUM_LIGHT.text, fontWeight: '600' }}>{new Date(workAssignment.startTime).toLocaleTimeString()}</Text>
          </View>
        )}

        {!isLiveTrackingEnabled && workAssignment.status === 'IN_PROGRESS' && (
          <TouchableOpacity 
            onPress={startLiveTracking}
            style={{ marginTop: 8, backgroundColor: PREMIUM_LIGHT.accent, padding: 10, borderRadius: 8, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Enable GPS Tracking</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderActionButtons = () => {
    if (workAssignment.status === 'COMPLETED' || workAssignment.status === 'CANCELLED') {
      return null;
    }

    return (
      <View style={{ marginTop: 16 }}>
        {workAssignment.status === 'ASSIGNED' && (
          <>
            {!!scheduledDateKey && (
              <Text style={[styles.workRequestLocation, { marginBottom: 8 }]}>📅 Assigned Date: {scheduledDateKey}</Text>
            )}
            {!canStartToday && (
              <Text style={[styles.workRequestLocation, { marginBottom: 8, color: PREMIUM_LIGHT.danger }]}>⚠ Work can be started only on assigned date.</Text>
            )}
            <Entrance delay={220}>
              <AnimatedPressable onPress={() => updateWorkStatus('STARTED')} disabled={!canStartToday}>
                <View style={[styles.button, styles.buttonSecondary, !canStartToday && { opacity: 0.55 }] }>
                  <Text style={styles.buttonTextOnDark}>Start Work</Text>
                </View>
              </AnimatedPressable>
            </Entrance>
          </>
        )}

        {workAssignment.status === 'STARTED' && (
          <Entrance delay={220}>
            <AnimatedPressable onPress={handleReachedSiteAndOpenBeforePhoto}>
              <View style={[styles.button, styles.buttonSecondary]}>
                <Text style={styles.buttonTextOnDark}>Capture Before Photo of Work</Text>
              </View>
            </AnimatedPressable>
          </Entrance>
        )}

        {workAssignment.status === 'REACHED_SITE' && (
          <>
            <Entrance delay={220}>
              <AnimatedPressable onPress={() => openPhotoModal('BEFORE')}>
                <View style={[styles.button, styles.buttonSecondary]}>
                  <Text style={styles.buttonTextOnDark}>Capture Before Photo of Work</Text>
                </View>
              </AnimatedPressable>
            </Entrance>
          </>
        )}

        {workAssignment.status === 'IN_PROGRESS' && (
          <>
            <Entrance delay={220}>
              <AnimatedPressable onPress={() => openPhotoModal('AFTER')}>
                <View style={[styles.button, styles.buttonSecondary]}>
                  <Text style={styles.buttonTextOnDark}>Capture After Photo of Work</Text>
                </View>
              </AnimatedPressable>
            </Entrance>
            <Entrance delay={280}>
              <AnimatedPressable
                onPress={() => updateWorkStatus('COMPLETED')}
                disabled={!hasPhoto('AFTER')}
              >
                <View style={[styles.button, styles.buttonSecondary, !hasPhoto('AFTER') && { opacity: 0.55 }]}>
                  <Text style={styles.buttonTextOnDark}>Complete Work</Text>
                </View>
              </AnimatedPressable>
            </Entrance>
          </>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
        <Text style={styles.loadingText}>Loading work details...</Text>
      </View>
    );
  }

  if (!workAssignment) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Work Progress</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Work assignment not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Entrance>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Work Progress</Text>
          <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
            Track your work completion
          </Text>
        </View>
      </Entrance>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <Entrance delay={120}>
          <View style={styles.card}>
            <View style={styles.workRequestHeader}>
              <Text style={styles.workRequestType}>{workAssignment.workRequest?.workType}</Text>
              <View
                style={{
                  backgroundColor: getStatusColor(workAssignment.status),
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{getStatusText(workAssignment.status)}</Text>
              </View>
            </View>

            {renderProgressSteps()}

            <Text style={styles.workRequestLocation}>📍 {workAssignment.workRequest?.location?.address}</Text>
            <Text style={styles.workRequestDuration}>⏱️ Duration: {workAssignment.workRequest?.expectedDuration} hours</Text>
            <Text style={styles.workRequestDuration}>🚛 {workAssignment.vehicle?.type} - {workAssignment.vehicle?.vehicleNumber}</Text>

            {workAssignment.startTime && (
              <Text style={styles.workRequestDuration}>🕐 Started: {new Date(workAssignment.startTime).toLocaleString()}</Text>
            )}

            {workAssignment.endTime && (
              <Text style={styles.workRequestDuration}>🕐 Completed: {new Date(workAssignment.endTime).toLocaleString()}</Text>
            )}

            {workAssignment.actualDuration >= 0 && !!workAssignment.endTime && (
              <Text style={styles.workRequestDuration}>⏱️ Actual Duration: {formatDurationHours(workAssignment.actualDuration)} ({workAssignment.actualDuration.toFixed(2)} hrs)</Text>
            )}

            {workAssignment.notes && (
              <Text style={styles.workRequestLocation}>📝 Notes: {workAssignment.notes}</Text>
            )}

            {Array.isArray(workAssignment?.workRequest?.photos) && workAssignment.workRequest.photos.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.title, { marginBottom: 8 }]}>Photo Proofs</Text>
                {workAssignment.workRequest.photos
                  .slice()
                  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                  .map((p) => {
                    const url = p?.imageUrl ? `${FILE_BASE_URL}${p.imageUrl}` : null;
                    return (
                      <View
                        key={p._id || `${p.type}-${p.timestamp}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 10,
                          borderRadius: 14,
                          backgroundColor: PREMIUM_LIGHT.surface,
                          borderWidth: 1,
                          borderColor: 'rgba(15,23,42,0.06)',
                          marginBottom: 10,
                        }}
                      >
                        {url ? (
                          <Image
                            source={{ uri: url }}
                            style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: PREMIUM_LIGHT.bg }}
                          />
                        ) : (
                          <View
                            style={{
                              width: 56,
                              height: 56,
                              borderRadius: 12,
                              backgroundColor: PREMIUM_LIGHT.accentSoft,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: PREMIUM_LIGHT.accent, fontWeight: '900' }}>{p?.type || 'PHOTO'}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={{ fontWeight: '900', color: PREMIUM_LIGHT.text }}>
                            {getPhotoProofLabel(p)}
                          </Text>
                          <Text style={{ marginTop: 2, color: PREMIUM_LIGHT.muted, fontSize: 12 }}>
                            {p?.timestamp ? new Date(p.timestamp).toLocaleString() : ''}
                          </Text>
                          {!!p?.notes && (
                            <Text style={{ marginTop: 2, color: PREMIUM_LIGHT.muted, fontSize: 12 }}>
                              📍 {p.notes}
                            </Text>
                          )}
                          {p?.geolocation?.latitude && p?.geolocation?.longitude && (
                            <Text style={{ marginTop: 2, color: PREMIUM_LIGHT.muted, fontSize: 12 }}>
                              🌐 {Number(p.geolocation.latitude).toFixed(5)}, {Number(p.geolocation.longitude).toFixed(5)}
                              {p?.geolocation?.accuracy ? ` (±${Math.round(p.geolocation.accuracy)}m)` : ''}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
              </View>
            )}

            {renderLiveUpdates()}
            {renderActionButtons()}
          </View>
        </Entrance>
      </ScrollView>

      <Modal
        visible={photoModalVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedPhotoType === 'BEFORE' ? 'Capture Before Photo of Work' : selectedPhotoType === 'AFTER' ? 'Capture After Photo of Work' : `Take ${selectedPhotoType} Photo`}
              </Text>
              <Text 
                style={styles.modalClose} 
                onPress={() => setPhotoModalVisible(false)}
              >
                ×
              </Text>
            </View>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonPrimary]}
              onPress={takePhoto}
            >
              <Text style={styles.modalButtonText}>Take Photo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonSecondary]}
              onPress={() => setPhotoModalVisible(false)}
            >
              <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default DriverProgress;