import React, { useState, useEffect } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { View, Text, ActivityIndicator, RefreshControl, FlatList, TouchableOpacity, TextInput, ScrollView, Modal } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import apiService from '../../services/apiService';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';

const AdminAttendance = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState('daily');
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [disputedRecords, setDisputedRecords] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [reportType, setReportType] = useState('weekly');
  const [showReportModal, setShowReportModal] = useState(false);

  const { user } = useAuth();

  const toSafeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getEffectiveWorkHours = (record) => {
    const directHours = toSafeNumber(record?.hours ?? record?.workHours ?? record?.effectiveWorkHours);
    if (directHours > 0) {
      return directHours;
    }

    const checkInTime = new Date(record?.checkIn);
    const checkOutTime = new Date(record?.checkOut);
    if (
      Number.isNaN(checkInTime.getTime()) ||
      Number.isNaN(checkOutTime.getTime()) ||
      checkOutTime <= checkInTime
    ) {
      return Math.max(0, directHours);
    }

    const durationHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);
    return Math.max(0, Number(durationHours.toFixed(2)));
  };

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const response = await apiService.getAttendance({ date, page: 1, limit: 100 });
      setAttendance(response.data.data);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingApprovals = async () => {
    try {
      setLoading(true);
      const response = await apiService.getPendingApprovals({ page: 1, limit: 50 });
      setPendingApprovals(response.data.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDisputedRecords = async () => {
    try {
      setLoading(true);
      const response = await apiService.getDisputedRecords({ page: 1, limit: 50 });
      setDisputedRecords(response.data.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await apiService.getAttendanceAnalytics(startDate, endDate);
      setAnalytics(response.data.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'daily') fetchAttendance();
    else if (activeTab === 'pending') fetchPendingApprovals();
    else if (activeTab === 'disputed') fetchDisputedRecords();
    else if (activeTab === 'analytics') fetchAnalytics();
  }, [date, activeTab]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'daily') await fetchAttendance();
    else if (activeTab === 'pending') await fetchPendingApprovals();
    else if (activeTab === 'disputed') await fetchDisputedRecords();
    else if (activeTab === 'analytics') await fetchAnalytics();
    setRefreshing(false);
  };

  const approveAttendance = async (attendanceId) => {
    try {
      await apiService.approveAttendance(attendanceId, 'Approved by admin');
      Alert.alert('Success', 'Attendance approved');
      onRefresh();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to approve');
    }
  };

  const rejectAttendance = async (attendanceId) => {
    Alert.prompt('Reject Attendance', 'Reason:', async (reason) => {
      if (!reason?.trim()) {
        Alert.alert('Error', 'Reason required');
        return;
      }
      try {
        await apiService.rejectAttendance(attendanceId, reason);
        Alert.alert('Success', 'Attendance rejected');
        onRefresh();
      } catch (error) {
        Alert.alert('Error', error.response?.data?.message || 'Failed');
      }
    }, 'plain-text');
  };

  const markHalfDay = async (attendanceId) => {
    try {
      await apiService.updateAttendanceStatus(attendanceId, 'HALF_DAY');
      Alert.alert('Success', 'Marked as half day');
      onRefresh();
    } catch (error) {
      Alert.alert('Error', 'Failed to update');
    }
  };

  const handleAttendanceAction = (item) => {
    if (item.approvalStatus === 'PENDING') {
      Alert.alert('Actions', 'Choose:', [
        { text: 'Approve', onPress: () => approveAttendance(item._id) },
        { text: 'Reject', onPress: () => rejectAttendance(item._id), style: 'destructive' },
        { text: 'Half Day', onPress: () => markHalfDay(item._id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Details', `Status: ${item.approvalStatus}\nWork Hours: ${item.workHours || 0}h\nApproval: ${item.approvalStatus}`);
    }
  };

  const generateWeeklyReport = async () => {
    try {
      setLoading(true);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await apiService.getWeeklyReport(startDate, endDate);
      setReportData(response.data.data);
      setReportType('weekly');
      setShowReportModal(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const generateMonthlyReport = async () => {
    try {
      setLoading(true);
      const now = new Date();
      const response = await apiService.getAttendanceMonthlyReport(now.getFullYear(), now.getMonth() + 1);
      setReportData(response.data.data);
      setReportType('monthly');
      setShowReportModal(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    return status === 'PRESENT' ? PREMIUM_LIGHT.success : status === 'ABSENT' ? PREMIUM_LIGHT.danger : PREMIUM_LIGHT.accent;
  };

  const getApprovalStatusColor = (status) => {
    return status === 'APPROVED' ? '#4CAF50' : status === 'PENDING' ? '#FF9800' : '#F44336';
  };

  const renderAttendance = ({ item }) => (
    <TouchableOpacity onPress={() => handleAttendanceAction(item)} activeOpacity={0.85}>
      <View style={{ backgroundColor: '#FFF', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E0E0E0', padding: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{new Date(item.date).toLocaleDateString()}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ backgroundColor: getStatusColor(item.status), paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{item.status}</Text>
            </View>
            <View style={{ backgroundColor: getApprovalStatusColor(item.approvalStatus), paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{item.approvalStatus}</Text>
            </View>
          </View>
        </View>
        {item.driver && <Text style={{ fontSize: 14, color: '#1976D2' }}> {item.driver.name}</Text>}
        {item.vehicle && <Text style={{ fontSize: 14, color: '#F57C00' }}> {item.vehicle.vehicleNumber}</Text>}
      </View>
    </TouchableOpacity>
  );

  const getDailySummary = () => {
    const present = attendance.filter(a => a.status === 'PRESENT').length;
    const absent = attendance.filter(a => a.status === 'ABSENT').length;
    const halfDay = attendance.filter(a => a.status === 'HALF_DAY').length;
    const totalHours = attendance.reduce((sum, a) => sum + (a.workHours || 0), 0);
    const approved = attendance.filter(a => a.approvalStatus === 'APPROVED').length;
    const pending = attendance.filter(a => a.approvalStatus === 'PENDING').length;
    return { present, absent, halfDay, totalHours, approved, pending };
  };

  const summary = getDailySummary();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Attendance Management</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12, gap: 8 }}>
          {['daily', 'pending', 'disputed', 'analytics'].map(tab => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: activeTab === tab ? '#FFF' : 'rgba(255,255,255,0.3)' }}>
              <Text style={{ color: activeTab === tab ? PREMIUM_LIGHT.accent : '#FFF', fontWeight: 'bold' }}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {activeTab === 'analytics' && analytics ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <View style={styles.card}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Analytics Dashboard</Text>
            <Text>Total Records: {analytics.overview.totalRecords}</Text>
            <Text>Approval Rate: {analytics.approvals.approvalRate}%</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={activeTab === 'pending' ? pendingApprovals : activeTab === 'disputed' ? disputedRecords : attendance}
          renderItem={renderAttendance}
          keyExtractor={item => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={activeTab === 'daily' ? (
            <View style={styles.card}>
              <Text style={styles.label}>Date</Text>
              <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <View style={{ flex: 1, padding: 8, backgroundColor: '#E8F5E9', borderRadius: 8 }}>
                  <Text style={{ fontSize: 20, fontWeight: 'bold' }}>{summary.present}</Text>
                  <Text>Present</Text>
                </View>
                <View style={{ flex: 1, padding: 8, backgroundColor: '#FFEBEE', borderRadius: 8 }}>
                  <Text style={{ fontSize: 20, fontWeight: 'bold' }}>{summary.absent}</Text>
                  <Text>Absent</Text>
                </View>
                <View style={{ flex: 1, padding: 8, backgroundColor: '#FFF3E0', borderRadius: 8 }}>
                  <Text style={{ fontSize: 20, fontWeight: 'bold' }}>{summary.halfDay}</Text>
                  <Text>Half Day</Text>
                </View>
              </View>
              <TouchableOpacity style={[styles.button, { marginTop: 12 }]} onPress={() => navigation.navigate('MarkAttendance')}>
                <Text style={styles.buttonText}>Mark Attendance</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#2196F3' }]} onPress={generateWeeklyReport}>
                  <Text style={[styles.buttonText, { color: '#FFF' }]}>Weekly Report</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#9C27B0' }]} onPress={generateMonthlyReport}>
                  <Text style={[styles.buttonText, { color: '#FFF' }]}>Monthly Report</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          ListEmptyComponent={!loading && <Text style={{ textAlign: 'center', padding: 20 }}>No records found</Text>}
        />
      )}

      <Modal visible={showReportModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
          <View style={[styles.header, { paddingTop: 40 }]}>
            <TouchableOpacity 
              onPress={() => setShowReportModal(false)} 
              style={{ position: 'absolute', left: 16, top: 44, zIndex: 10 }}
            >
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{reportType === 'weekly' ? 'Weekly' : 'Monthly'} Attendance Report</Text>
            <TouchableOpacity 
              onPress={() => setShowReportModal(false)} 
              style={{ position: 'absolute', right: 16, top: 44, zIndex: 10 }}
            >
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            {/* Summary Card */}
            {reportData?.report && reportData.report.length > 0 && (() => {
              // Calculate summary from report data if not provided by backend
              const summary = reportData.summary || {
                totalPresentDays: reportData.report.reduce((sum, dr) => sum + (dr.presentDays || 0), 0),
                totalAbsentDays: reportData.report.reduce((sum, dr) => sum + (dr.absentDays || 0), 0),
                totalHalfDays: reportData.report.reduce((sum, dr) => sum + (dr.halfDays || 0), 0),
                totalHours: reportData.report.reduce((sum, dr) => {
                  const dayWiseRecords = dr.dailyBreakdown || dr.records || [];
                  const driverHours = dr.totalHours || dayWiseRecords.reduce((acc, row) => acc + getEffectiveWorkHours(row), 0);
                  return sum + toSafeNumber(driverHours);
                }, 0),
                totalDrivers: reportData.report.length
              };
              
              return (
                <View style={{ 
                  backgroundColor: '#FFF', 
                  borderRadius: 16, 
                  padding: 16, 
                  marginBottom: 20,
                  borderWidth: 2,
                  borderColor: PREMIUM_LIGHT.accent,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 4
                }}>
                  <Text style={{ 
                    fontSize: 18, 
                    fontWeight: 'bold', 
                    color: PREMIUM_LIGHT.accent, 
                    marginBottom: 12,
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: 1
                  }}>
                    📊 Report Summary
                  </Text>
                  <View style={{ 
                    flexDirection: 'row', 
                    flexWrap: 'wrap', 
                    gap: 12, 
                    justifyContent: 'space-between' 
                  }}>
                    <View style={{ 
                      flex: 1, 
                      minWidth: '45%', 
                      backgroundColor: '#E8F5E9', 
                      padding: 12, 
                      borderRadius: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: '#4CAF50'
                    }}>
                      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#2E7D32' }}>
                        {summary.totalPresentDays || 0}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#558B2F', fontWeight: '600' }}>Total Present Days</Text>
                    </View>
                    <View style={{ 
                      flex: 1, 
                      minWidth: '45%', 
                      backgroundColor: '#FFEBEE', 
                      padding: 12, 
                      borderRadius: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: '#F44336'
                    }}>
                      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#C62828' }}>
                        {summary.totalAbsentDays || 0}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#B71C1C', fontWeight: '600' }}>Total Absent Days</Text>
                    </View>
                    <View style={{ 
                      flex: 1, 
                      minWidth: '45%', 
                      backgroundColor: '#FFF3E0', 
                      padding: 12, 
                      borderRadius: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: '#FF9800'
                    }}>
                      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#E65100' }}>
                        {summary.totalHalfDays || 0}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#EF6C00', fontWeight: '600' }}>Total Half Days</Text>
                    </View>
                    <View style={{ 
                      flex: 1, 
                      minWidth: '45%', 
                      backgroundColor: '#E3F2FD', 
                      padding: 12, 
                      borderRadius: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: '#2196F3'
                    }}>
                      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#1565C0' }}>
                        {summary.totalDrivers || 0}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#1976D2', fontWeight: '600' }}>Total Drivers</Text>
                    </View>
                    <View style={{ 
                      flex: 1, 
                      minWidth: '45%', 
                      backgroundColor: '#E8F0FF', 
                      padding: 12, 
                      borderRadius: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: '#1D4ED8'
                    }}>
                      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#1E3A8A' }}>
                        {toSafeNumber(summary.totalHours).toFixed(2)}h
                      </Text>
                      <Text style={{ fontSize: 12, color: '#1D4ED8', fontWeight: '600' }}>Total Hours</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* Driver-wise Detailed Reports */}
            {reportData?.report?.map((dr, driverIndex) => (
              (() => {
                const dayWiseRecords = dr.dailyBreakdown || dr.records || [];
                const totalHours = toSafeNumber(dr.totalHours) || dayWiseRecords.reduce((sum, record) => sum + getEffectiveWorkHours(record), 0);

                return (
              <View key={driverIndex} style={{ 
                marginBottom: 20, 
                backgroundColor: '#FFF', 
                borderRadius: 16, 
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: '#E0E0E0',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 6,
                elevation: 3
              }}>
                {/* Driver Header */}
                <View style={{ 
                  backgroundColor: PREMIUM_LIGHT.accent, 
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: '#0D665E'
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ 
                        fontSize: 18, 
                        fontWeight: 'bold', 
                        color: '#FFF',
                        marginBottom: 4
                      }}>
                        👤 {dr.driver?.name || 'Unknown Driver'}
                      </Text>
                      {dr.driver?.phone && (
                        <Text style={{ fontSize: 12, color: '#E0F2F1' }}>
                          📞 {dr.driver.phone}
                        </Text>
                      )}
                    </View>
                    <View style={{ 
                      backgroundColor: 'rgba(255,255,255,0.2)', 
                      paddingHorizontal: 12, 
                      paddingVertical: 6, 
                      borderRadius: 20 
                    }}>
                      <Text style={{ color: '#FFF', fontSize: 11, fontWeight: 'bold' }}>
                        Driver #{driverIndex + 1}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Attendance Summary */}
                <View style={{ 
                  backgroundColor: '#F9FAFB', 
                  padding: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: '#E5E7EB'
                }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    <View style={{ 
                      backgroundColor: '#E8F5E9', 
                      paddingHorizontal: 12, 
                      paddingVertical: 8, 
                      borderRadius: 10,
                      minWidth: 100,
                      alignItems: 'center'
                    }}>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#2E7D32' }}>
                        {dr.presentDays || 0}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#558B2F', fontWeight: '600' }}>Present</Text>
                    </View>
                    <View style={{ 
                      backgroundColor: '#FFEBEE', 
                      paddingHorizontal: 12, 
                      paddingVertical: 8, 
                      borderRadius: 10,
                      minWidth: 100,
                      alignItems: 'center'
                    }}>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#C62828' }}>
                        {(dr.totalDays || 0) - (dr.presentDays || 0)}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#B71C1C', fontWeight: '600' }}>Absent</Text>
                    </View>
                    <View style={{ 
                      backgroundColor: '#E3F2FD', 
                      paddingHorizontal: 12, 
                      paddingVertical: 8, 
                      borderRadius: 10,
                      minWidth: 100,
                      alignItems: 'center'
                    }}>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1565C0' }}>
                        {totalHours.toFixed(2)}h
                      </Text>
                      <Text style={{ fontSize: 10, color: '#1976D2', fontWeight: '600' }}>Total Hours</Text>
                    </View>
                  </View>
                </View>

                {/* Day-wise Attendance Table */}
                <View style={{ padding: 14 }}>
                  <Text style={{ 
                    fontSize: 14, 
                    fontWeight: 'bold', 
                    color: PREMIUM_LIGHT.text, 
                    marginBottom: 12,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}>
                    📅 Day-wise Attendance Details
                  </Text>

                  {/* Table Header */}
                  <View style={{ 
                    flexDirection: 'row', 
                    backgroundColor: '#F3F4F6', 
                    padding: 10,
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                    borderWidth: 1,
                    borderColor: '#E5E7EB'
                  }}>
                    <Text style={{ 
                      flex: 0.8, 
                      fontSize: 11, 
                      fontWeight: 'bold', 
                      color: '#374151',
                      textAlign: 'center'
                    }}>
                      #
                    </Text>
                    <Text style={{ 
                      flex: 2, 
                      fontSize: 11, 
                      fontWeight: 'bold', 
                      color: '#374151'
                    }}>
                      Date
                    </Text>
                    <Text style={{ 
                      flex: 1.8, 
                      fontSize: 11, 
                      fontWeight: 'bold', 
                      color: '#374151',
                      textAlign: 'center'
                    }}>
                      Status
                    </Text>
                    <Text style={{ 
                      flex: 1.5, 
                      fontSize: 11, 
                      fontWeight: 'bold', 
                      color: '#374151',
                      textAlign: 'center'
                    }}>
                      Hours
                    </Text>
                    <Text style={{ 
                      flex: 2, 
                      fontSize: 11, 
                      fontWeight: 'bold', 
                      color: '#374151',
                      textAlign: 'center'
                    }}>
                      Approval
                    </Text>
                  </View>

                  {/* Table Rows */}
                  {(() => {
                    // Handle both weekly (dailyBreakdown) and monthly (records) response formats
                    const dayWiseRecords = dr.dailyBreakdown || dr.records || [];
                    
                    return dayWiseRecords.map((record, idx) => {
                      const statusColor = 
                        record.status === 'PRESENT' ? '#4CAF50' :
                        record.status === 'ABSENT' ? '#F44336' :
                        record.status === 'HALF_DAY' ? '#FF9800' : '#9E9E9E';
                      
                      const approvalColor = 
                        record.approvalStatus === 'APPROVED' ? '#4CAF50' :
                        record.approvalStatus === 'PENDING' ? '#FF9800' :
                        record.approvalStatus === 'REJECTED' ? '#F44336' : '#9E9E9E';
                      
                      // Handle different data structures for hours
                      const workHours = getEffectiveWorkHours(record);
                      
                      return (
                        <View 
                          key={idx} 
                          style={{ 
                            flexDirection: 'row', 
                            padding: 12,
                            alignItems: 'center',
                            minHeight: 50,
                            borderBottomWidth: 1,
                            borderLeftWidth: 1,
                            borderRightWidth: 1,
                            borderColor: '#E5E7EB',
                            backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC'
                          }}
                        >
                          <View style={{ 
                            flex: 0.8,
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}>
                            <Text style={{ 
                              fontSize: 12, 
                              color: '#6B7280',
                              fontWeight: '600'
                            }}>
                              {idx + 1}
                            </Text>
                          </View>
                          <View style={{ 
                            flex: 2,
                            justifyContent: 'center'
                          }}>
                            <Text style={{ 
                              fontSize: 12, 
                              color: '#111827',
                              fontWeight: '500'
                            }}>
                              {new Date(record.date).toLocaleDateString('en-IN', { 
                                day: '2-digit', 
                                month: 'short' 
                              })}
                            </Text>
                          </View>
                          <View style={{ 
                            flex: 1.8, 
                            justifyContent: 'center',
                            alignItems: 'center' 
                          }}>
                            <View style={{ 
                              backgroundColor: statusColor, 
                              paddingHorizontal: 10, 
                              paddingVertical: 4, 
                              borderRadius: 12,
                              minWidth: 65,
                              alignItems: 'center'
                            }}>
                              <Text style={{ 
                                fontSize: 10, 
                                fontWeight: 'bold', 
                                color: '#FFF',
                                letterSpacing: 0.3
                              }}>
                                {record.status === 'HALF_DAY' ? 'HALF' : record.status}
                              </Text>
                            </View>
                          </View>
                          <View style={{ 
                            flex: 1.5, 
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}>
                            <Text style={{ 
                              fontSize: 13, 
                              color: '#1E40AF',
                              fontWeight: '700',
                              letterSpacing: 0.3
                            }}>
                              {workHours?.toFixed(2) || '0.00'}h
                            </Text>
                          </View>
                          <View style={{ 
                            flex: 2, 
                            justifyContent: 'center',
                            alignItems: 'center' 
                          }}>
                            <View style={{ 
                              backgroundColor: approvalColor, 
                              paddingHorizontal: 10, 
                              paddingVertical: 4, 
                              borderRadius: 12,
                              minWidth: 70,
                              alignItems: 'center'
                            }}>
                              <Text style={{ 
                                fontSize: 10, 
                                fontWeight: 'bold', 
                                color: '#FFF',
                                letterSpacing: 0.3
                              }}>
                                {record.approvalStatus || 'N/A'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    });
                  })()}

                  {/* No Records Message */}
                  {(() => {
                    const dayWiseRecords = dr.dailyBreakdown || dr.records || [];
                    return (!dayWiseRecords || dayWiseRecords.length === 0) && (
                      <View style={{ 
                        padding: 20, 
                        alignItems: 'center',
                        borderBottomWidth: 1,
                        borderLeftWidth: 1,
                        borderRightWidth: 1,
                        borderColor: '#E5E7EB',
                        backgroundColor: '#F9FAFB',
                        borderBottomLeftRadius: 8,
                        borderBottomRightRadius: 8
                      }}>
                        <Text style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>
                          No day-wise records available
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
                );
              })()
            ))}

            {/* No Data Message */}
            {(!reportData?.report || reportData.report.length === 0) && (
              <View style={{ 
                backgroundColor: '#FFF', 
                borderRadius: 16, 
                padding: 32, 
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#E0E0E0'
              }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
                <Text style={{ 
                  fontSize: 16, 
                  fontWeight: '600', 
                  color: '#6B7280', 
                  textAlign: 'center' 
                }}>
                  No attendance data available for this period
                </Text>
              </View>
            )}
            
            {/* Close Button */}
            {reportData?.report && reportData.report.length > 0 && (
              <TouchableOpacity 
                style={[styles.button, { 
                  backgroundColor: PREMIUM_LIGHT.accent, 
                  marginTop: 20,
                  paddingVertical: 14,
                  borderRadius: 12,
                  shadowColor: PREMIUM_LIGHT.accent,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 6
                }]} 
                onPress={() => setShowReportModal(false)}
              >
                <Text style={[styles.buttonText, { color: '#FFF', fontSize: 16, fontWeight: 'bold' }]}>
                  ✓ Close Report
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

export default AdminAttendance;
