import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, RefreshControl, FlatList, TextInput, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';
import AnimatedPressable from '../../components/AnimatedPressable';

const DriverWorkList = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workAssignments, setWorkAssignments] = useState([]);
  const [filters, setFilters] = useState({ status: '', date: '' });

  const { user } = useAuth();

  const fetchWorkAssignments = async () => {
    try {
      setLoading(true);
      if (!user?.id) {
        setWorkAssignments([]);
        return;
      }
      const response = await apiService.getDriverWorkList(user.id, {
        ...filters,
        page: 1,
        limit: 50
      });
      setWorkAssignments(response.data.data);
    } catch (error) {
      console.error('Error fetching work assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkAssignments();
  }, [filters, user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchWorkAssignments();
    }, [filters, user?.id])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWorkAssignments();
    setRefreshing(false);
  };

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
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

  const renderWorkAssignment = ({ item, index }) => (
    <Entrance delay={90 + Math.min(index, 6) * 70}>
      <AnimatedPressable onPress={() => navigation.navigate('DriverProgress', { assignmentId: item._id })}>
        <View style={styles.workRequestCard}>
          <View style={styles.workRequestHeader}>
            <Text style={styles.workRequestType}>{item.workRequest?.workType}</Text>
            <View
              style={{
                backgroundColor: getStatusColor(item.status),
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{getStatusText(item.status)}</Text>
            </View>
          </View>

          <Text style={styles.workRequestLocation}>📍 {item.workRequest?.location?.address}</Text>
          <Text style={styles.workRequestDuration}>⏱️ Duration: {item.workRequest?.expectedDuration} hours</Text>

          <Text style={styles.workRequestDuration}>🚛 {item.vehicle?.type || '—'} - {item.vehicle?.vehicleNumber || '—'}</Text>

          {item.location && (
            <Text style={styles.workRequestLocation}>📍 Current Location: {item.location.address}</Text>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.muted }}>
              Started: {item.startTime ? new Date(item.startTime).toLocaleDateString() : '—'}
            </Text>
            {item.actualDuration && (
              <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.accent, fontWeight: 'bold' }}>{item.actualDuration}h</Text>
            )}
          </View>

          {item.notes && <Text style={styles.workRequestLocation}>📝 {item.notes}</Text>}
        </View>
      </AnimatedPressable>
    </Entrance>
  );

  return (
    <View style={styles.container}>
      <Entrance>
        <View style={[styles.header, { marginTop: 32 }]}>
          <Text style={styles.headerTitle}>My Work Assignments</Text>
          <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
            Manage your assigned work orders
          </Text>
        </View>
      </Entrance>

      <Entrance delay={120}>
        <View style={styles.card}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
            <View style={[styles.filterContainer, { marginVertical: 0 }]}>
              {[
                { key: '', label: 'All' },
                { key: 'ASSIGNED', label: 'Assigned' },
                { key: 'STARTED', label: 'Started' },
                { key: 'REACHED_SITE', label: 'Reached' },
                { key: 'IN_PROGRESS', label: 'In Progress' },
                { key: 'COMPLETED', label: 'Completed' },
              ].map((f, idx) => {
                const active = filters.status === f.key;
                return (
                  <Entrance key={f.key || 'ALL'} delay={140 + idx * 45}>
                    <AnimatedPressable onPress={() => handleFilterChange('status', f.key)}>
                      <View
                        style={[
                          styles.filterButton,
                          active ? styles.filterButtonActive : styles.filterButtonInactive,
                          { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
                        ]}
                      >
                        <Text style={{ color: active ? '#FFFFFF' : PREMIUM_LIGHT.text, fontWeight: '800' }}>
                          {f.label}
                        </Text>
                      </View>
                    </AnimatedPressable>
                  </Entrance>
                );
              })}
            </View>
          </ScrollView>

          <View style={{ marginTop: 10 }}>
            <Text style={styles.label}>Date</Text>
            <TextInput
              style={styles.input}
              value={filters.date}
              onChangeText={(text) => handleFilterChange('date', text)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={PREMIUM_LIGHT.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      </Entrance>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          <Text style={styles.loadingText}>Loading assignments...</Text>
        </View>
      ) : (
        <View style={{ flex: 1, padding: 16 }}>
          <FlatList
            data={workAssignments}
            renderItem={renderWorkAssignment}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No work assignments found</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
};

export default DriverWorkList;