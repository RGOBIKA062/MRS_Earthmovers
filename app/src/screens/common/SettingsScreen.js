import React, { useMemo, useState } from 'react';
import { View, Text, Alert, Switch, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';
import AnimatedPressable from '../../components/AnimatedPressable';

const SettingsScreen = () => {
  const { user, logout, persistLogin, setPersistLogin } = useAuth();
  const { language, toggleLanguage } = useTheme();
  const [busy, setBusy] = useState(false);

  const initials = useMemo(() => {
    const name = user?.name?.trim() || '';
    if (!name) return 'U';
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || 'U';
    const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + second).toUpperCase();
  }, [user?.name]);

  const roleLabel = useMemo(() => {
    if (user?.role === 'ADMIN') return 'Admin';
    if (user?.role === 'DRIVER') return 'Driver';
    if (user?.role === 'USER') return 'Customer';
    return user?.role || 'User';
  }, [user?.role]);

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await logout();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Entrance>
        <View style={[styles.header, { marginTop: 32 }]}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
            Account, preferences, and security
          </Text>
        </View>
      </Entrance>

      <Entrance delay={120}>
        <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{user?.name || 'Account'}</Text>
            <Text style={styles.subtitle}>{roleLabel}</Text>
            {!!user?.email && <Text style={styles.subtitle}>{user.email}</Text>}
            {!!user?.phone && <Text style={styles.subtitle}>{user.phone}</Text>}
          </View>
        </View>
        </View>
      </Entrance>

      <Entrance delay={160}>
        <View style={styles.card}>
        <View style={[styles.row, styles.rowLast]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialIcons name="lock" size={20} color={PREMIUM_LIGHT.text} style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.title}>Keep me signed in</Text>
              <Text style={styles.subtitle}>
                {persistLogin ? 'Auto-login enabled' : 'Login required each time'}
              </Text>
            </View>
          </View>
          <Switch
            value={!!persistLogin}
            onValueChange={(val) => setPersistLogin(!!val)}
            disabled={busy}
          />
        </View>
        </View>
      </Entrance>

      <Entrance delay={200}>
        <View style={styles.card}>
        <View style={[styles.row, styles.rowLast]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialIcons name="language" size={20} color={PREMIUM_LIGHT.text} style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.title}>Language</Text>
              <Text style={styles.subtitle}>
                {language === 'ta' ? 'தமிழ்' : 'English'}
              </Text>
            </View>
          </View>
          <Switch
            value={language === 'ta'}
            onValueChange={() => toggleLanguage()}
            disabled={busy}
          />
        </View>
        </View>
      </Entrance>

      <Entrance delay={240}>
        <View style={styles.card}>
          <AnimatedPressable disabled={busy} onPress={handleLogout}>
            <View style={[styles.button, styles.buttonDanger, busy && { opacity: 0.7 }]}>
              <Text style={styles.buttonText}>{busy ? 'Logging out…' : 'Logout'}</Text>
            </View>
          </AnimatedPressable>
        </View>
      </Entrance>
    </View>
  );
};

export default SettingsScreen;
