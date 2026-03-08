import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';
import AnimatedPressable from '../../components/AnimatedPressable';

const DriverDashboard = ({ navigation }) => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState('overall'); // overall | date
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [overallData, setOverallData] = useState({
    totalCompleted: 0,
    totalHoursWorked: 0,
    totalWorkRequests: 0
  });

  const [dateData, setDateData] = useState({
    completed: 0,
    hours: 0,
    requests: 0
  });

  /* ---------------- FETCH OVERALL ---------------- */
  const fetchOverallStats = async () => {
    const workRes = await apiService.getWorkAssignmentsStats(user.id);
    const stats = workRes.data.data || {};

    setOverallData({
      totalCompleted: stats.completedCount || 0,
      totalHoursWorked: Number.isFinite(Number(stats.totalHoursWorked)) ? Number(stats.totalHoursWorked) : 0,
      totalWorkRequests: stats.totalCount || 0
    });
  };

  /* ---------------- FETCH DATE ---------------- */
  const fetchDateStats = async (date) => {
    const dateStr = date.toISOString().split('T')[0];
    const res = await apiService.getDailyStats(user.id, { date: dateStr });
    const d = res.data.data || {};

    setDateData({
      completed: d.completed || 0,
      hours: Number.isFinite(Number(d.hoursWorked)) ? Number(d.hoursWorked) : 0,
      requests: d.workCount || 0
    });
  };

  const fetchAll = async () => {
    try {
      if (!user?.id) return;
      setLoading(true);
      await fetchOverallStats();
      if (viewMode === 'date') {
        await fetchDateStats(selectedDate);
      }
    } catch {
      Alert.alert('Error', 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id, viewMode]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [user?.id, viewMode])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const onDateChange = (_, date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      fetchDateStats(date);
    }
  };

  /* ---------------- CARD ---------------- */
  const MetricCard = ({ icon, title, value, subtitle, cardStyle }) => (
    <View style={[localStyles.card, cardStyle]}>
      <View style={localStyles.iconBox}>
        <Text style={localStyles.icon}>{icon}</Text>
      </View>
      <Text style={localStyles.title}>{title}</Text>
      <Text style={localStyles.value}>{value}</Text>
      <Text style={localStyles.subtitle}>{subtitle}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <Entrance>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Statistics</Text>
          <Text style={localStyles.headerSub}>
            Performance Overview
          </Text>
        </View>
      </Entrance>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* TOGGLE */}
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
              viewMode === 'date' && localStyles.toggleActive
            ]}
            onPress={() => setViewMode('date')}
          >
            <Text style={viewMode === 'date' ? localStyles.toggleTextActive : localStyles.toggleText}>
              📅 By Date
            </Text>
          </TouchableOpacity>
        </View>

        {/* DATE PICKER */}
        {viewMode === 'date' && (
          <TouchableOpacity
            style={localStyles.dateBtn}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={localStyles.dateText}>
              📅 {selectedDate.toLocaleDateString('en-IN')}
            </Text>
          </TouchableOpacity>
        )}

        {/* GRID */}
        <View style={localStyles.grid}>
          {viewMode === 'overall' ? (
            <>
              <View style={localStyles.metricRowTop}>
                <MetricCard
                  icon="✅"
                  title="Total Completed"
                  value={overallData.totalCompleted}
                  subtitle="Work assignments"
                  cardStyle={localStyles.cardHalf}
                />
                <MetricCard
                  icon="⏱️"
                  title="Hours Worked"
                  value={overallData.totalHoursWorked.toFixed(2)}
                  subtitle="Total hours"
                  cardStyle={localStyles.cardHalf}
                />
              </View>
              <View style={localStyles.metricRowCenter}>
                <MetricCard
                  icon="📋"
                  title="Work Requests"
                  value={overallData.totalWorkRequests}
                  subtitle="Assigned works"
                  cardStyle={localStyles.cardSingle}
                />
              </View>
            </>
          ) : (
            <>
              <View style={localStyles.metricRowTop}>
                <MetricCard
                  icon="✅"
                  title="Completed"
                  value={dateData.completed}
                  subtitle="On selected date"
                  cardStyle={localStyles.cardHalf}
                />
                <MetricCard
                  icon="⏱️"
                  title="Hours Worked"
                  value={dateData.hours.toFixed(2)}
                  subtitle="On selected date"
                  cardStyle={localStyles.cardHalf}
                />
              </View>
              <View style={localStyles.metricRowCenter}>
                <MetricCard
                  icon="📋"
                  title="Work Requests"
                  value={dateData.requests}
                  subtitle="On selected date"
                  cardStyle={localStyles.cardSingle}
                />
              </View>
            </>
          )}
        </View>

        {/* BUTTONS */}
        <View style={{ padding: 16 }}>
          <AnimatedPressable
            style={[styles.button, { backgroundColor: PREMIUM_LIGHT.accent }]}
            onPress={() => navigation.navigate('DriverWorkList')}
          >
            <Text style={styles.buttonText}>📋 View Work List</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          maximumDate={new Date()}
          onChange={onDateChange}
        />
      )}
    </View>
  );
};

/* ---------------- STYLES ---------------- */
const localStyles = StyleSheet.create({
  headerSub: {
    fontSize: 15,
    color: PREMIUM_LIGHT.muted,
    marginTop: 6,
    textAlign: 'center'
  },

  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: PREMIUM_LIGHT.surface,
    margin: 14,
    marginTop: 32,
    borderRadius: 14,
    padding: 4
  },

  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },

  toggleActive: {
    backgroundColor: PREMIUM_LIGHT.accent
  },

  toggleText: {
    fontWeight: '700',
    color: PREMIUM_LIGHT.text
  },

  toggleTextActive: {
    fontWeight: '700',
    color: '#fff'
  },

  dateBtn: {
    backgroundColor: PREMIUM_LIGHT.accent,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center'
  },

  dateText: {
    color: '#fff',
    fontWeight: '700'
  },

  grid: {
    width: '100%',
    paddingHorizontal: 14,
    marginTop: 16
  },

  metricRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    width: '100%'
  },

  metricRowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    width: '100%'
  },

  card: {
    backgroundColor: PREMIUM_LIGHT.surface,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PREMIUM_LIGHT.border,
    elevation: 4
  },

  cardHalf: {
    width: '48%'
  },

  cardSingle: {
    width: '48%'
  },

  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: PREMIUM_LIGHT.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },

  icon: {
    fontSize: 20
  },

  title: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },

  value: {
    fontSize: 26,
    fontWeight: '900',
    color: PREMIUM_LIGHT.accent,
    marginVertical: 4
  },

  subtitle: {
    fontSize: 11,
    color: PREMIUM_LIGHT.muted,
    textAlign: 'center'
  }
});

export default DriverDashboard;
