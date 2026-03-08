import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';

const ComplaintDetailScreen = ({ route, navigation }) => {
  const { complaintId } = route.params;
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchComplaintDetails();
  }, [complaintId]);

  const fetchComplaintDetails = async () => {
    try {
      setLoading(true);
      const response = await apiService.getComplaint(complaintId);
      if (response?.data?.success) {
        setComplaint(response.data.data);
      } else {
        setError('Failed to load complaint details');
      }
    } catch (err) {
      console.error('Error fetching complaint:', err);
      setError(err?.response?.data?.message || 'Error loading complaint');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'REPORTED':
        return 'new-releases';
      case 'IN_PROGRESS':
        return 'hourglass-empty';
      case 'RESOLVED':
        return 'check-circle';
      case 'CANCELLED':
        return 'cancel';
      default:
        return 'help-outline';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'REPORTED':
        return '#FF6B6B';
      case 'IN_PROGRESS':
        return '#FFB800';
      case 'RESOLVED':
        return '#51CF66';
      case 'CANCELLED':
        return '#868E96';
      default:
        return PREMIUM_LIGHT.muted;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return '#FF4757';
      case 'HIGH':
        return '#FF6B6B';
      case 'MEDIUM':
        return '#FFA502';
      case 'LOW':
        return '#FFD93D';
      default:
        return '#95E1D3';
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (minutes) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) {
      return `${mins} minutes`;
    }
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { flex: 1, marginLeft: 12 }]}>Complaint Details</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          <Text style={styles.loadingText}>Loading details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !complaint) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { flex: 1, marginLeft: 12 }]}>Complaint Details</Text>
        </View>
        <View style={styles.loadingContainer}>
          <MaterialIcons name="error-outline" size={48} color={PREMIUM_LIGHT.muted} />
          <Text style={styles.loadingText}>{error || 'Complaint not found'}</Text>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { marginTop: 16 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.buttonTextOnDark}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { flex: 1, marginLeft: 12 }]}>Complaint Details</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* Status Card */}
        <Entrance fromY={-20} duration={300}>
          <View style={[styles.card, localStyles.statusCard]}>
            <View style={localStyles.statusHeader}>
              <View style={localStyles.statusIconContainer}>
                <MaterialIcons
                  name={getStatusIcon(complaint.status)}
                  size={32}
                  color={getStatusColor(complaint.status)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={localStyles.statusLabel}>Status</Text>
                <Text
                  style={[
                    localStyles.statusValue,
                    { color: getStatusColor(complaint.status) }
                  ]}
                >
                  {complaint.status}
                </Text>
              </View>
              <View
                style={[
                  localStyles.severityBadge,
                  { backgroundColor: getSeverityColor(complaint.severity) }
                ]}
              >
                <Text style={localStyles.severityText}>{complaint.severity}</Text>
              </View>
            </View>
          </View>
        </Entrance>

        {/* Complaint Info */}
        <Entrance fromY={-20} duration={350} delay={50}>
          <View style={styles.card}>
            <Text style={styles.title}>Complaint Information</Text>

            <View style={localStyles.infoRow}>
              <MaterialIcons name="local-shipping" size={20} color={PREMIUM_LIGHT.accent} />
              <View style={localStyles.infoContent}>
                <Text style={localStyles.infoLabel}>Vehicle</Text>
                <Text style={localStyles.infoValue}>
                  {complaint.vehicle?.vehicleNumber} • {complaint.vehicle?.type}
                </Text>
              </View>
            </View>

            <View style={localStyles.infoRow}>
              <MaterialIcons name="build" size={20} color={PREMIUM_LIGHT.accent} />
              <View style={localStyles.infoContent}>
                <Text style={localStyles.infoLabel}>Type</Text>
                <Text style={localStyles.infoValue}>{complaint.type.replace(/_/g, ' ')}</Text>
              </View>
            </View>

            <View style={localStyles.infoRow}>
              <MaterialIcons name="description" size={20} color={PREMIUM_LIGHT.accent} />
              <View style={localStyles.infoContent}>
                <Text style={localStyles.infoLabel}>Description</Text>
                <Text style={localStyles.infoValue}>{complaint.description}</Text>
              </View>
            </View>

            {complaint.location?.address && (
              <View style={localStyles.infoRow}>
                <MaterialIcons name="location-on" size={20} color={PREMIUM_LIGHT.accent} />
                <View style={localStyles.infoContent}>
                  <Text style={localStyles.infoLabel}>Location</Text>
                  <Text style={localStyles.infoValue}>{complaint.location.address}</Text>
                </View>
              </View>
            )}

            <View style={localStyles.infoRow}>
              <MaterialIcons name="access-time" size={20} color={PREMIUM_LIGHT.accent} />
              <View style={localStyles.infoContent}>
                <Text style={localStyles.infoLabel}>Reported</Text>
                <Text style={localStyles.infoValue}>{formatDate(complaint.reportedAt)}</Text>
              </View>
            </View>
          </View>
        </Entrance>

        {/* Mechanic Information */}
        {complaint.status === 'IN_PROGRESS' && complaint.assignedMechanic && (
          <Entrance fromY={-20} duration={350} delay={100}>
            <View style={styles.card}>
              <Text style={styles.title}>Service Information</Text>

              <View style={localStyles.infoRow}>
                <MaterialIcons name="person" size={20} color={PREMIUM_LIGHT.accent} />
                <View style={localStyles.infoContent}>
                  <Text style={localStyles.infoLabel}>Assigned Mechanic</Text>
                  <Text style={localStyles.infoValue}>{complaint.assignedMechanic}</Text>
                </View>
              </View>

              {complaint.estimatedResolutionTime && (
                <View style={localStyles.infoRow}>
                  <MaterialIcons name="schedule" size={20} color={PREMIUM_LIGHT.accent} />
                  <View style={localStyles.infoContent}>
                    <Text style={localStyles.infoLabel}>Estimated Time</Text>
                    <Text style={localStyles.infoValue}>
                      {formatTime(complaint.estimatedResolutionTime)}
                    </Text>
                  </View>
                </View>
              )}

              {complaint.notes && (
                <View style={localStyles.infoRow}>
                  <MaterialIcons name="note" size={20} color={PREMIUM_LIGHT.accent} />
                  <View style={localStyles.infoContent}>
                    <Text style={localStyles.infoLabel}>Notes</Text>
                    <Text style={localStyles.infoValue}>{complaint.notes}</Text>
                  </View>
                </View>
              )}
            </View>
          </Entrance>
        )}

        {/* Resolution Information */}
        {complaint.status === 'RESOLVED' && (
          <Entrance fromY={-20} duration={350} delay={100}>
            <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#51CF66' }]}>
              <View style={localStyles.resolutionHeader}>
                <MaterialIcons name="check-circle" size={28} color="#51CF66" />
                <Text style={localStyles.resolutionTitle}>Complaint Resolved!</Text>
              </View>

              <View style={localStyles.infoRow}>
                <MaterialIcons name="check-circle" size={20} color="#51CF66" />
                <View style={localStyles.infoContent}>
                  <Text style={localStyles.infoLabel}>Resolved On</Text>
                  <Text style={localStyles.infoValue}>{formatDate(complaint.resolvedAt)}</Text>
                </View>
              </View>

              <View style={localStyles.infoRow}>
                <MaterialIcons name="timer" size={20} color="#51CF66" />
                <View style={localStyles.infoContent}>
                  <Text style={localStyles.infoLabel}>Total Time</Text>
                  <Text style={localStyles.infoValue}>{formatTime(complaint.actualResolutionTime)}</Text>
                </View>
              </View>

              {complaint.cost && (
                <View style={localStyles.infoRow}>
                  <MaterialIcons name="attach-money" size={20} color="#51CF66" />
                  <View style={localStyles.infoContent}>
                    <Text style={localStyles.infoLabel}>Cost</Text>
                    <Text style={localStyles.infoValue}>₹{complaint.cost}</Text>
                  </View>
                </View>
              )}

              {complaint.notes && (
                <View style={localStyles.infoRow}>
                  <MaterialIcons name="note" size={20} color="#51CF66" />
                  <View style={localStyles.infoContent}>
                    <Text style={localStyles.infoLabel}>Resolution Notes</Text>
                    <Text style={localStyles.infoValue}>{complaint.notes}</Text>
                  </View>
                </View>
              )}
            </View>
          </Entrance>
        )}

        {/* Action Buttons */}
        <View style={localStyles.buttonSection}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonTextOnDark}>Back to List</Text>
          </TouchableOpacity>

          {complaint.status !== 'RESOLVED' && (
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary, { marginTop: 12 }]}
              onPress={() => {
                Alert.alert(
                  'Contact Support',
                  'If you need to update this complaint, please contact our support team.',
                  [
                    { text: 'Cancel', onPress: () => {}, style: 'cancel' },
                    { text: 'OK', onPress: () => {} }
                  ]
                );
              }}
            >
              <MaterialIcons name="help-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.buttonTextOnDark}>Need Help?</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const localStyles = StyleSheet.create({
  statusCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: PREMIUM_LIGHT.accent
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  statusIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: PREMIUM_LIGHT.accentSoft,
    justifyContent: 'center',
    alignItems: 'center'
  },
  statusLabel: {
    fontSize: 12,
    color: PREMIUM_LIGHT.muted,
    fontWeight: '500'
  },
  statusValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4
  },
  severityBadge: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12
  },
  severityText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'white'
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PREMIUM_LIGHT.border
  },
  infoContent: {
    flex: 1
  },
  infoLabel: {
    fontSize: 12,
    color: PREMIUM_LIGHT.muted,
    fontWeight: '600'
  },
  infoValue: {
    fontSize: 14,
    color: PREMIUM_LIGHT.text,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 20
  },
  resolutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16
  },
  resolutionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#51CF66'
  },
  buttonSection: {
    paddingHorizontal: 16,
    paddingTop: 8
  }
});

export default ComplaintDetailScreen;
