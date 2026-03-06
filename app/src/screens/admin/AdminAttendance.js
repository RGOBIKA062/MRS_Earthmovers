import React, { useState, useEffect } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { View, Text, ActivityIndicator, RefreshControl, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const AdminAttendance = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const { user } = useAuth();

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const response = await apiService.getAttendance({
        date,
        page: 1,
        limit: 50
      });
      setAttendance(response.data.data);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [date]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAttendance();
    setRefreshing(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PRESENT': return PREMIUM_LIGHT.success;
      case 'ABSENT': return PREMIUM_LIGHT.danger;
      case 'HALF_DAY': return PREMIUM_LIGHT.accent;
      // Removed 'LEAVE' status
      default: return PREMIUM_LIGHT.muted;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'PRESENT': return 'Present';
      case 'ABSENT': return 'Absent';
      case 'HALF_DAY': return 'Half Day';
      // Removed 'LEAVE' status
      default: return status;
    }
  };

  const markAttendanceStatus = async (attendanceId, status) => {
    try {
      await apiService.updateAttendanceStatus(attendanceId, status);
      fetchAttendance();
    } catch (error) {
      Alert.alert('Error', 'Failed to update attendance status');
    }
  };

  const handleCardPress = (item) => {
    const options = ['Mark Half Day', 'Cancel'];
    const statusMap = ['HALF_DAY'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({
        options,
        cancelButtonIndex: 2,
      }, (buttonIndex) => {
        if (buttonIndex === 0 || buttonIndex === 1) {
          markAttendanceStatus(item._id, statusMap[buttonIndex]);
        }
      });
    } else {
      Alert.alert(
        'Mark Attendance',
        'Choose status:',
        [
          { text: 'Half Day', onPress: () => markAttendanceStatus(item._id, 'HALF_DAY') },
          // Removed Leave option
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const renderAttendance = ({ item }) => (
    <TouchableOpacity onPress={() => handleCardPress(item)} activeOpacity={0.85}>
      <View style={[styles.attendanceCard, { backgroundColor: '#F7F7F7', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E0E0E0' }]}> {/* Slightly different bg */}
        <View style={styles.attendanceHeader}>
          <Text style={styles.attendanceDate}>
            {new Date(item.date).toLocaleDateString()}
          </Text>
          <View style={{
            backgroundColor: item.status === 'ABSENT' ? PREMIUM_LIGHT.danger : PREMIUM_LIGHT.success,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 12
          }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
              {getStatusText(item.status)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          {item.driver && (
            <View style={{ flex: 1, backgroundColor: '#E3F2FD', borderRadius: 8, padding: 6, marginRight: 6 }}>
              <Text style={[styles.driverName, { fontWeight: 'bold', color: '#1976D2' }]}>👤 {item.driver.name}</Text>
            </View>
          )}
          {item.vehicle && (
            <View style={{ flex: 1, backgroundColor: '#FFF3E0', borderRadius: 8, padding: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverContact, { fontWeight: 'bold', color: '#F57C00' }]}>🚛 {item.vehicle.vehicleNumber}</Text>
                <Text style={[styles.driverContact, { fontSize: 12 }]}>{item.vehicle.make} {item.vehicle.model}</Text>
              </View>
              <Text style={{ fontWeight: '600', color: '#F57C00', fontSize: 11 }}>{item.vehicle.type}</Text>
            </View>
          )}
        </View>

        <Text style={styles.attendanceHours}>
          ⏱️ Work Hours: {item.workHours || 0} hours
        </Text>

        {item.siteName && (
          <Text style={styles.attendanceSite}>
            📍 Site: {item.siteName}
          </Text>
        )}

        {item.checkIn && (
          <Text style={styles.attendanceSite}>
            🕐 Check-in: {new Date(item.checkIn).toLocaleTimeString()}
          </Text>
        )}

        {item.checkOut && (
          <Text style={styles.attendanceSite}>
            🕐 Check-out: {new Date(item.checkOut).toLocaleTimeString()}
          </Text>
        )}

        {item.notes && (
          <Text style={styles.attendanceSite}>
            📝 Notes: {item.notes}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const getDailySummary = () => {
    const present = attendance.filter(att => att.status === 'PRESENT').length;
    const absent = attendance.filter(att => att.status === 'ABSENT').length;
    const halfDay = attendance.filter(att => att.status === 'HALF_DAY').length;
    // Removed leave count
    const totalHours = attendance.reduce((sum, att) => sum + (att.workHours || 0), 0);

    return { present, absent, halfDay, totalHours };
  };

  const summary = getDailySummary();

  return (
    <View style={styles.container}>
      <FlatList
        data={attendance}
        renderItem={renderAttendance}
        keyExtractor={(item) => item._id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={[styles.header, { backgroundColor: PREMIUM_LIGHT.accent, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, marginHorizontal: -16 }]}> {/* Orange header full width */}
              <Text style={styles.headerTitle}>Attendance Management</Text>
              <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
                Track driver attendance
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Date</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="Select date"
                placeholderTextColor={PREMIUM_LIGHT.muted}
              />

              <View style={styles.statisticsContainer}>
                <View style={styles.statisticCard}>
                  <Text style={styles.statisticValue}>{summary.present}</Text>
                  <Text style={styles.statisticLabel}>Present</Text>
                </View>
                <View style={styles.statisticCard}>
                  <Text style={styles.statisticValue}>{summary.absent}</Text>
                  <Text style={styles.statisticLabel}>Absent</Text>
                </View>
                <View style={styles.statisticCard}>
                  <Text style={styles.statisticValue}>{summary.halfDay}</Text>
                  <Text style={styles.statisticLabel}>Half Day</Text>
                </View>
                {/* Removed Leave statistic card */}
              </View>

              <View style={styles.reportCard}>
                <View style={styles.reportHeader}>
                  <Text style={styles.reportTitle}>Daily Summary</Text>
                  <Text style={styles.reportDate}>{new Date(date).toLocaleDateString()}</Text>
                </View>
                {/* Removed total hours display as requested */}
              </View>

              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => navigation.navigate('MarkAttendance')}
                activeOpacity={0.92}
              >
                <Text style={styles.buttonTextOnDark}>Mark Attendance</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
                <Text style={styles.loadingText}>Loading attendance...</Text>
              </View>
            ) : (
              <View style={{ height: 8 }} />
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No attendance records found</Text>
            </View>
          )
        }
      />
    </View>
  );
};

export default AdminAttendance;