import React from 'react';
import { View, Text, LogBox } from 'react-native';
import installRawTextGuard from './src/dev/installRawTextGuard';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { LocationProvider } from './src/context/LocationContext';
import { useAuth } from './src/context/AuthContext';
import { useTheme } from './src/context/ThemeContext';
import { PREMIUM_LIGHT } from './src/styles/tokens';

// Import screens
import LandingScreen from './src/screens/auth/LandingScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import MapSelectScreen from './src/screens/MapSelectScreen';
import InvoiceScreen from './src/screens/InvoiceScreen';
import AdminDashboard from './src/screens/admin/AdminDashboard';
import AdminWorkRequests from './src/screens/admin/AdminWorkRequests';
import WorkRequestDetail from './src/screens/admin/WorkRequestDetail';
import AdminVehicles from './src/screens/admin/AdminVehicles';
import AdminAttendance from './src/screens/admin/AdminAttendance';
import AdminReports from './src/screens/admin/AdminReports';
import AdminAssignWork from './src/screens/admin/AdminAssignWork';
import AddVehicle from './src/screens/admin/AddVehicle';
import VehicleDetails from './src/screens/admin/VehicleDetails';
import CustomerHome from './src/screens/user/CustomerHome';
import CustomerWorkRequest from './src/screens/user/CustomerWorkRequest';
import CustomerTrackWork from './src/screens/user/CustomerTrackWork';
import CustomerAvailableVehicles from './src/screens/user/CustomerAvailableVehicles';
import PaymentScreen from './src/screens/PaymentScreen';
import DriverDashboard from './src/screens/driver/DriverDashboard';
import DriverWorkList from './src/screens/driver/DriverWorkList';
import DriverProgress from './src/screens/driver/DriverProgress';
import DriverComplaintMain from './src/screens/driver/DriverComplaintMain';
import SubmitComplaint from './src/screens/driver/SubmitComplaint';
import DriverComplaintsHistory from './src/screens/driver/DriverComplaintsHistory';
import ComplaintDetailScreen from './src/screens/driver/ComplaintDetailScreen';
import AdminComplaintsManagement from './src/screens/admin/AdminComplaintsManagement';
import SettingsScreen from './src/screens/common/SettingsScreen';
import MarkAttendance from './src/screens/common/MarkAttendance';

import AppErrorBoundary from './src/components/AppErrorBoundary';

// Import components
import { MaterialIcons } from '@expo/vector-icons';

installRawTextGuard();

// In dev, this particular error is shown via a LogBox overlay even if we catch it.
// Ignore it so our AppErrorBoundary fallback can render and show the component stack.
if (__DEV__) {
  LogBox.ignoreLogs(['Text strings must be rendered within a <Text> component.']);
}

const Tab = createBottomTabNavigator();
const AuthStackNav = createNativeStackNavigator();
const AdminStackNav = createNativeStackNavigator();
const DriverStackNav = createNativeStackNavigator();
const RootStackNav = createNativeStackNavigator();

function AuthStack() {
  return (
    <AuthStackNav.Navigator
      initialRouteName="Landing"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PREMIUM_LIGHT.bg } }}
    >
      <AuthStackNav.Screen 
        name="Landing" 
        component={LandingScreen} 
      />
      <AuthStackNav.Screen 
        name="Login" 
        component={LoginScreen} 
      />
      <AuthStackNav.Screen 
        name="Register" 
        component={RegisterScreen} 
      />
    </AuthStackNav.Navigator>
  );
}

function AdminStack() {
  return (
    <AdminStackNav.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PREMIUM_LIGHT.bg } }}
    >
      <AdminStackNav.Screen name="AdminTabs" component={AdminTabs} />
      <AdminStackNav.Screen name="AdminAssignWork" component={AdminAssignWork} />
      <AdminStackNav.Screen name="WorkRequestDetail" component={WorkRequestDetail} />
      <AdminStackNav.Screen name="AddVehicle" component={AddVehicle} />
      <AdminStackNav.Screen name="VehicleDetails" component={VehicleDetails} />
      <AdminStackNav.Screen name="CustomerWorkRequest" component={CustomerWorkRequest} />
      <AdminStackNav.Screen name="CustomerTrackWork" component={CustomerTrackWork} />
      <AdminStackNav.Screen name="AdminComplaintsManagement" component={AdminComplaintsManagement} />
    </AdminStackNav.Navigator>
  );
}

function AdminTabs() {
  const { colors } = useTheme();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'AdminDashboard') iconName = 'dashboard';
          else if (route.name === 'AdminWorkRequests') iconName = 'assignment';
          else if (route.name === 'AdminVehicles') iconName = 'directions-car';
          else if (route.name === 'AdminAttendance') iconName = 'people';
          else if (route.name === 'AdminComplaints') iconName = 'report-problem';
          else if (route.name === 'AdminReports') iconName = 'insert-chart';
          else if (route.name === 'Settings') iconName = 'settings';
          else iconName = 'help-outline';

          return <MaterialIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: 'gray',
        sceneContainerStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="AdminDashboard" component={AdminDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="AdminWorkRequests" component={AdminWorkRequests} options={{ title: 'Requests' }} />
      <Tab.Screen name="AdminVehicles" component={AdminVehicles} options={{ title: 'Vehicles' }} />
      <Tab.Screen name="AdminAttendance" component={AdminAttendance} options={{ title: 'Attendance' }} />
      <Tab.Screen name="AdminComplaints" component={AdminComplaintsManagement} options={{ title: 'Complaints' }} />
      <Tab.Screen name="AdminReports" component={AdminReports} options={{ title: 'Reports' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function CustomerTabs() {
  const { colors } = useTheme();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'CustomerHome') iconName = 'home';
          else if (route.name === 'CustomerWorkRequest') iconName = 'add-circle';
          else if (route.name === 'CustomerTrackWork') iconName = 'location-on';
          else if (route.name === 'Payment') iconName = 'payment';
          else if (route.name === 'Settings') iconName = 'settings';
          else iconName = 'help-outline';

          return <MaterialIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: 'gray',
        sceneContainerStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="CustomerHome" component={CustomerHome} options={{ title: 'Home' }} />
      <Tab.Screen name="CustomerWorkRequest" component={CustomerWorkRequest} options={{ title: 'Request Work' }} />
      <Tab.Screen name="CustomerTrackWork" component={CustomerTrackWork} options={{ title: 'Track Work' }} />
      <Tab.Screen name="Payment" component={PaymentScreen} options={{ title: 'Payment' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function DriverTabs() {
  const { colors } = useTheme();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'DriverHome') iconName = 'home';
          else if (route.name === 'DriverWorkList') iconName = 'list';
          else if (route.name === 'DriverComplaint') iconName = 'report';
          else if (route.name === 'Settings') iconName = 'settings';
          else iconName = 'help-outline';

          return <MaterialIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: 'gray',
        sceneContainerStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="DriverHome" component={DriverDashboard} options={{ title: 'Home' }} />
      <Tab.Screen name="DriverWorkList" component={DriverWorkList} options={{ title: 'Work' }} />
      <Tab.Screen name="DriverComplaint" component={DriverComplaintMain} options={{ title: 'Complaint' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function DriverStack() {
  return (
    <DriverStackNav.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PREMIUM_LIGHT.bg } }}
    >
      <DriverStackNav.Screen name="DriverTabs" component={DriverTabs} />
      <DriverStackNav.Screen name="DriverProgress" component={DriverProgress} />
      <DriverStackNav.Screen name="SubmitComplaint" component={SubmitComplaint} />
      <DriverStackNav.Screen name="DriverComplaintsHistory" component={DriverComplaintsHistory} />
      <DriverStackNav.Screen name="ComplaintDetail" component={ComplaintDetailScreen} />
    </DriverStackNav.Navigator>
  );
}

function AppNavigation() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PREMIUM_LIGHT.bg }}>
        <MaterialIcons name="construction" size={48} color={PREMIUM_LIGHT.accent} />
        <Text style={{ marginTop: 12, fontSize: 16, color: PREMIUM_LIGHT.muted }}>Loading…</Text>
      </View>
    );
  }

  if (!user) {
    return <AuthStack />;
  }

  switch (user.role) {
    case 'ADMIN':
      return <AdminStack />;
    case 'USER':
      return <CustomerTabs />;
    case 'DRIVER':
      return <DriverStack />;
    default:
      return <AuthStack />;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <LocationProvider>
            <NavigationContainer>
              <RootStackNav.Navigator
                screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PREMIUM_LIGHT.bg } }}
              >
                <RootStackNav.Screen name="Main" component={AppNavigation} />
                <RootStackNav.Screen name="MapSelect" component={MapSelectScreen} />
                <RootStackNav.Screen name="MarkAttendance" component={MarkAttendance} />
                <RootStackNav.Screen name="Invoice" component={InvoiceScreen} />
                <RootStackNav.Screen name="CustomerAvailableVehicles" component={CustomerAvailableVehicles} />
              </RootStackNav.Navigator>
            </NavigationContainer>
          </LocationProvider>
        </ThemeProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}