import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';
import AnimatedPressable from '../../components/AnimatedPressable';

const AdminDashboard = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('overall'); // overall | daily
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [overallData, setOverallData] = useState({
    totalVehicles: 0,
    availableVehicles: 0,
    emergencyVehicles: 0,
    totalWorkRequests: 0,
    pendingWorkRequests: 0,
    completedWorkRequests: 0,
    todayRevenue: 0,
    totalRevenue: 0,
    activeDrivers: 0,
    todayAttendance: 0
  });
  
  const [dailyData, setDailyData] = useState({
    dailyVehicles: 0,
    usedVehicles: 0,
    dailyWorkRequests: 0,
    completedToday: 0,
    dailyRevenue: 0,
    dailyDrivers: 0
  });

  const fetchDailyData = async (date) => {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const result = await apiService.getDailyMetrics(dateStr);
      const data = result.data.data;
      
      setDailyData({
        dailyVehicles: data.metrics?.totalVehicles || 0,
        usedVehicles: data.metrics?.vehiclesUsed || 0,
        dailyWorkRequests: data.metrics?.workCreated || 0,
        completedToday: data.metrics?.workCompleted || 0,
        dailyRevenue: Math.round(data.metrics?.revenue || 0),
        dailyDrivers: data.metrics?.driversAttended || 0
      });
    } catch (error) {
      console.error('Daily data error:', error);
      setDailyData({
        dailyVehicles: 0,
        usedVehicles: 0,
        dailyWorkRequests: 0,
        completedToday: 0,
        dailyRevenue: 0,
        dailyDrivers: 0
      });
    }
  };

  const fetchOverallData = async () => {
    try {
      const result = await apiService.getDashboardSummary();
      const data = result.data.data;
      console.log('=== ADMIN DASHBOARD OVERALL DATA ===', data);
      console.log('Revenue from backend:', data.revenue);
      
      setOverallData({
        totalVehicles: data.vehicles?.total || 0,
        availableVehicles: data.vehicles?.available || 0,
        emergencyVehicles: data.vehicles?.maintenance || 0,
        totalWorkRequests: data.workRequests?.total || 0,
        pendingWorkRequests: data.workRequests?.pending || 0,
        completedWorkRequests: data.workRequests?.completed || 0,
        todayRevenue: Math.round(data.revenue?.today || 0),
        totalRevenue: Math.round(data.revenue?.total || 0),
        activeDrivers: data.drivers?.assigned || 0,
        todayAttendance: data.drivers?.attendance || 0
      });
    } catch (error) {
      console.error('Overall data error:', error);
    }
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      await fetchOverallData();
      if (viewMode === 'daily') {
        await fetchDailyData(selectedDate);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [viewMode, selectedDate]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [viewMode, selectedDate])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const onDateChange = (_, date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
      fetchDailyData(date);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  const renderCard = (title, value, subtitle, onPress, delay = 0) => (
    <Entrance delay={delay}>
      <AnimatedPressable
        style={[styles.card, localStyles.dashboardCard]}
        onPress={onPress}
      >
      <Text style={localStyles.dashboardCardTitle} numberOfLines={1}>
        {title != null ? String(title) : ''}
      </Text>
      <Text style={localStyles.dashboardCardValue} numberOfLines={1}>
        {value != null ? String(value) : '0'}
      </Text>
      {subtitle ? (
        <Text style={localStyles.dashboardCardSubtitle} numberOfLines={1}>
          {String(subtitle)}
        </Text>
      ) : null}
      </AnimatedPressable>
    </Entrance>
  );

  return (
    <View style={styles.container}>
      <Entrance>
        <View style={[styles.header, { marginTop: 12 }]}> 
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
            MRS Earthmovers Management System
          </Text>
        </View>
      </Entrance>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* TOGGLE */}
        <Entrance delay={40}>
          <View style={localStyles.toggleWrap}>
            <TouchableOpacity
              style={[
                localStyles.toggleBtn,
                viewMode === 'overall' && localStyles.toggleActive
              ]}
              onPress={() => setViewMode('overall')}
            >
              <Text style={viewMode === 'overall' ? localStyles.toggleTextActive : localStyles.toggleText}>
                📊 Overall
              </Text>
            </TouchableOpacity>
              <TouchableOpacity
                style={[
                  localStyles.toggleBtn,
                  viewMode === 'daily' && localStyles.toggleActive
                ]}
                onPress={() => setViewMode('daily')}
              >
                <Text style={viewMode === 'daily' ? [localStyles.toggleTextActive, { fontSize: 12 }] : [localStyles.toggleText, { fontSize: 12 }] }>
                  📈 Daily Progress
                </Text>
              </TouchableOpacity>
          </View>
        </Entrance>

        {/* DATE PICKER - Show only in daily mode */}
        {viewMode === 'daily' && (
          <Entrance delay={80}>
            <TouchableOpacity
              style={localStyles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={localStyles.datePickerText}>
                📅 {selectedDate.toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'short',
                  day: '2-digit'
                })}
              </Text>
              <Text style={localStyles.datePickerIcon}>▼</Text>
            </TouchableOpacity>
          </Entrance>
        )}

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        {/* Dashboard Cards Grid - 2 rows, 2 cards each, Emergency Vehicles removed */}
        {viewMode === 'overall' ? (
          <View style={localStyles.dashboardGridEven}>
            {/* First row */}
            <View style={localStyles.rowWrapEven}>
              {renderCard('Total Vehicles', overallData.totalVehicles, `${overallData.availableVehicles} available`, () => navigation.navigate('AdminVehicles'), 80)}
              {renderCard('Work Requests', overallData.totalWorkRequests, `${overallData.pendingWorkRequests} pending`, () => navigation.navigate('AdminWorkRequests'), 120)}
            </View>
            {/* Second row */}
            <View style={localStyles.rowWrapEven}>
              {renderCard('Today Revenue', `₹${overallData.todayRevenue}`, 'Daily earnings', () => navigation.navigate('AdminReports'), 140)}
              {renderCard('Active Drivers', overallData.activeDrivers, 'On duty', () => navigation.navigate('AdminAttendance'), 150)}
            </View>
          </View>
        ) : (
          <View style={localStyles.dashboardGridEven}>
            <View style={localStyles.rowWrapEven}>
              {renderCard('Vehicles Active', dailyData.usedVehicles, `of ${dailyData.dailyVehicles}`, () => navigation.navigate('AdminVehicles'), 80)}
              {renderCard('Completed Today', dailyData.completedToday, `of ${dailyData.dailyWorkRequests} assigned`, () => navigation.navigate('AdminWorkRequests'), 120)}
            </View>
            <View style={localStyles.rowWrapEven}>
              {renderCard('Drivers Present', dailyData.dailyDrivers, 'Attendance marked', () => navigation.navigate('AdminAttendance'), 140)}
              {renderCard('Daily Avg', dailyData.dailyWorkRequests > 0 ? `₹${Math.round(dailyData.dailyRevenue / dailyData.dailyWorkRequests)}` : '₹0', 'Per work request', () => navigation.navigate('AdminReports'), 150)}
            </View>
          </View>
        )}
        <View style={localStyles.dashboardGrid}>
          {viewMode === 'overall' && (
            <View style={{ alignSelf: 'center', width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'center', marginTop: -24 }}>
              <View style={{ width: '60%' }}>
                {renderCard(
                  'Emergency Vehicles',
                  overallData.emergencyVehicles,
                  'Requires attention',
                  () => navigation.navigate('AdminVehicles'),
                  280
                )}
              </View>
            </View>
          )}
        </View>
        

        {viewMode
         === 'overall' && overallData.emergencyVehicles > 0 && (
          <Entrance delay={320}>
            <View style={[styles.card, { backgroundColor: PREMIUM_LIGHT.accentSoft, borderColor: PREMIUM_LIGHT.danger, borderWidth: 1, marginTop: 40, marginBottom: 20, paddingVertical: 16 }]}>
              <Text style={[styles.title, { color: PREMIUM_LIGHT.danger }]}>Emergency Alert</Text>
              <Text style={styles.subtitle}>
                {overallData.emergencyVehicles} vehicle(s) need immediate attention
              </Text>
            </View>
          </Entrance>
        )}

        {/* Quick Actions section - move slightly down */}
        <View style={{ marginVertical: 32, alignItems: 'center' }}>
          <Text style={styles.title}>Quick Actions</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, justifyContent: 'center' }}>
            <Entrance delay={400}>
              <AnimatedPressable
                style={[styles.button, styles.buttonSecondary, { margin: 4, flex: 1, minWidth: 120 }]}
                onPress={() => navigation.navigate('AdminVehicles')}
              >
                <Text style={styles.buttonTextOnDark}>Add New Vehicle</Text>
              </AnimatedPressable>
            </Entrance>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: PREMIUM_LIGHT.surface,
    marginBottom: 12,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 0
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent'
  },
  toggleActive: {
    backgroundColor: PREMIUM_LIGHT.accent
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: PREMIUM_LIGHT.text
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700'
  },
  datePickerButton: {
    backgroundColor: PREMIUM_LIGHT.accent,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    marginHorizontal: 0
  },
  datePickerText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16
  },
  datePickerIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700'
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginHorizontal: 0,
    marginTop: 12,
  },
  dashboardGridEven: {
    width: '100%',
    marginTop: 12,
    gap: 0,
  },
  rowWrapEven: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    marginHorizontal: 16,
  },
  rowSingleWrapFull: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    marginHorizontal: 0,
  },
  dashboardCard: {
    width: '46%',
    minWidth: 140,
    maxWidth: 180,
    height: 130,
    padding: 16,
    borderRadius: 16,
    backgroundColor: PREMIUM_LIGHT.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  dashboardCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: PREMIUM_LIGHT.muted,
  },
  dashboardCardValue: {
    fontSize: 23,
    fontWeight: '800',
    color: '#FF9800', // Orange color
    marginTop: 8,
  },
  dashboardCardValueEmergency: {
    fontSize: 23,
    fontWeight: '800',
    color: '#FF9800', // Orange color
    marginTop: 8,
  },
  dashboardCardSubtitle: {
    fontSize: 12,
    color: PREMIUM_LIGHT.muted,
    marginTop: 6,
  },
  emergencyCardFull: {
    width: '96%',
    alignSelf: 'center',
    height: 130,
    padding: 16,
    borderRadius: 16,
    backgroundColor: PREMIUM_LIGHT.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
});

export default AdminDashboard;