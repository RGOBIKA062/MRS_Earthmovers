import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  TouchableOpacity, 
  ScrollView, 
  RefreshControl,
  FlatList,
  Platform
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';
import AnimatedPressable from '../../components/AnimatedPressable';

const DriverComplaintsHistory = ({ navigation }) => {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('ALL'); // ALL, REPORTED, IN_PROGRESS, RESOLVED
  const { user } = useAuth();

  const fetchComplaints = useCallback(async () => {
    try {
      if (!user?.id) return;
      const response = await apiService.getDriverComplaints(user.id);
      if (response?.data?.success) {
        setComplaints(response.data.data || []);
      } else {
        setComplaints([]);
      }
    } catch (error) {
      console.error('Error fetching complaints:', error);
      Alert.alert('Error', 'Failed to fetch complaints');
      setComplaints([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchComplaints();
    }
  }, [user?.id, fetchComplaints]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        fetchComplaints();
      }
    }, [user?.id, fetchComplaints])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchComplaints();
  }, [fetchComplaints]);

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

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'error';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'check-circle';
      default:
        return 'help-outline';
    }
  };

  const getComplaintTypeIcon = (type) => {
    switch (type) {
      case 'BREAKDOWN':
        return '🔧';
      case 'ACCIDENT':
        return '🚨';
      case 'MAINTENANCE_ISSUE':
        return '⚙️';
      case 'FUEL_PROBLEM':
        return '⛽';
      case 'OTHER':
        return '📝';
      default:
        return '❓';
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredComplaints = complaints.filter(complaint => {
    if (filter === 'ALL') return true;
    return complaint.status === filter;
  });

  const renderComplaintCard = ({ item, index }) => (
    <Entrance key={item._id} delay={index * 50}>
      <AnimatedPressable
        style={localStyles.complaintCard}
        onPress={() => navigation.navigate('ComplaintDetail', { complaintId: item._id })}
        activeOpacity={0.8}
      >
        <View style={localStyles.cardHeader}>
          <View style={localStyles.typeSection}>
            <Text style={localStyles.typeEmoji}>{getComplaintTypeIcon(item.type)}</Text>
            <View>
              <Text style={localStyles.complaintType}>{item.type.replace(/_/g, ' ')}</Text>
              <Text style={localStyles.vehicleNumber}>
                {item.vehicle?.vehicleNumber || 'Vehicle'} {item.vehicle?.type && `• ${item.vehicle.type}`}
              </Text>
            </View>
          </View>
          
          <View style={[localStyles.severityBadge, { backgroundColor: getSeverityColor(item.severity) }]}>
            <MaterialIcons 
              name={getSeverityIcon(item.severity)} 
              size={16} 
              color="white" 
              style={{ marginRight: 4 }}
            />
            <Text style={localStyles.severityText}>{item.severity}</Text>
          </View>
        </View>

        <View style={localStyles.descriptionSection}>
          <Text style={localStyles.description} numberOfLines={2}>
            {item.description}
          </Text>
        </View>

        <View style={localStyles.footerSection}>
          <View style={localStyles.dateSection}>
            <MaterialIcons name="access-time" size={14} color={PREMIUM_LIGHT.muted} />
            <Text style={localStyles.dateText}>{formatDate(item.reportedAt)}</Text>
          </View>

          <View style={[localStyles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={localStyles.statusText}>{item.status}</Text>
          </View>
        </View>

        {item.status === 'RESOLVED' && item.actualResolutionTime && (
          <View style={localStyles.resolutionSection}>
            <MaterialIcons name="check-circle" size={16} color="#51CF66" />
            <Text style={localStyles.resolutionText}>
              Resolved in {Math.floor(item.actualResolutionTime / 60)} hours {item.actualResolutionTime % 60} mins
            </Text>
          </View>
        )}

        {item.assignedMechanic && (
          <View style={localStyles.mechanicSection}>
            <MaterialIcons name="person" size={14} color={PREMIUM_LIGHT.muted} />
            <Text style={localStyles.mechanicText}>Mechanic: {item.assignedMechanic}</Text>
          </View>
        )}
      </AnimatedPressable>
    </Entrance>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Complaints</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          <Text style={styles.loadingText}>Loading complaints...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Complaints</Text>
        <Text style={{ fontSize: 14, color: '#fff', textAlign: 'center', marginTop: 4 }}>
          <Text>{complaints.length}</Text> total • <Text>{complaints.filter(c => c.status === 'RESOLVED').length}</Text> resolved
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Filter Buttons */}
        <View style={localStyles.filterSection}>
          {['ALL', 'REPORTED', 'IN_PROGRESS', 'RESOLVED'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                localStyles.filterButton,
                filter === f && localStyles.filterButtonActive
              ]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  localStyles.filterButtonText,
                  filter === f && localStyles.filterButtonTextActive
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Complaints List */}
        {filteredComplaints.length > 0 ? (
          <FlatList
            scrollEnabled={false}
            data={filteredComplaints}
            keyExtractor={(item) => item._id}
            renderItem={renderComplaintCard}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        ) : (
          <View style={localStyles.emptyState}>
            <MaterialIcons name="info-outline" size={48} color={PREMIUM_LIGHT.muted} />
            <Text style={localStyles.emptyTitle}>
              {complaints.length === 0 ? 'No Complaints Yet' : 'No Complaints in this Status'}
            </Text>
            <Text style={localStyles.emptyDescription}>
              {complaints.length === 0
                ? 'Great! No complaints reported.'
                : `Try selecting a different status filter`}
            </Text>
            {complaints.length === 0 && (
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary, { marginTop: 16 }]}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.buttonTextOnDark}>Go Back</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  filterSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexWrap: 'wrap'
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PREMIUM_LIGHT.border,
    backgroundColor: PREMIUM_LIGHT.surface
  },
  filterButtonActive: {
    borderColor: PREMIUM_LIGHT.accent,
    backgroundColor: PREMIUM_LIGHT.accentSoft
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: PREMIUM_LIGHT.muted
  },
  filterButtonTextActive: {
    color: PREMIUM_LIGHT.accent
  },
  complaintCard: {
    backgroundColor: PREMIUM_LIGHT.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: PREMIUM_LIGHT.border,
    marginBottom: 8
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  typeSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1
  },
  typeEmoji: {
    fontSize: 20,
    marginTop: 2
  },
  complaintType: {
    fontSize: 13,
    fontWeight: '700',
    color: PREMIUM_LIGHT.text
  },
  vehicleNumber: {
    fontSize: 11,
    color: PREMIUM_LIGHT.muted,
    marginTop: 2
  },
  severityBadge: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center'
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'white'
  },
  descriptionSection: {
    marginBottom: 10
  },
  description: {
    fontSize: 12,
    color: PREMIUM_LIGHT.text,
    lineHeight: 18
  },
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  dateText: {
    fontSize: 11,
    color: PREMIUM_LIGHT.muted
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 12
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'white'
  },
  resolutionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: PREMIUM_LIGHT.border
  },
  resolutionText: {
    fontSize: 11,
    color: '#51CF66',
    fontWeight: '600'
  },
  mechanicSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8
  },
  mechanicText: {
    fontSize: 11,
    color: PREMIUM_LIGHT.muted
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PREMIUM_LIGHT.text,
    marginTop: 16
  },
  emptyDescription: {
    fontSize: 13,
    color: PREMIUM_LIGHT.muted,
    marginTop: 8,
    textAlign: 'center'
  }
});

export default DriverComplaintsHistory;
