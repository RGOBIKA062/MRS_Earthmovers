import React, { useState } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';
import AnimatedPressable from '../../components/AnimatedPressable';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const result = await login(email, password, { remember: rememberMe });
      if (result.success) {
        Alert.alert('Success', 'Login successful');
      } else {
        Alert.alert('Error', result.error || 'Invalid email id or password');
      }
    } catch (error) {
      Alert.alert('Error', 'Invalid email id or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Entrance fromY={0} duration={260}>
        <View style={[styles.header, { marginTop: 32 }]}>
          <Text style={styles.headerTitle}>MRS Earthmovers</Text>
          <Text style={{ fontSize: 16, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
            Login to your account
          </Text>
        </View>
      </Entrance>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Entrance fromY={0} duration={280}>
            <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(v) => setEmail(v.trim())}
              placeholder="Enter your email"
              placeholderTextColor={PREMIUM_LIGHT.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Password</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[styles.input, { paddingRight: 46 }]}
                value={password}
                onChangeText={(v) => setPassword(v)}
                placeholder="Enter your password"
                placeholderTextColor={PREMIUM_LIGHT.muted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={{ position: 'absolute', right: 12, top: 18 }}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={22}
                  color={PREMIUM_LIGHT.muted}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.row, styles.rowLast, { borderBottomWidth: 0 }]}
              onPress={() => setRememberMe((v) => !v)}
              activeOpacity={0.8}
              disabled={loading}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons
                  name={rememberMe ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={rememberMe ? PREMIUM_LIGHT.accent : PREMIUM_LIGHT.muted}
                />
                <View>
                  <Text style={styles.title}>Keep me signed in</Text>
                  <Text style={styles.subtitle}>Turn off for more security</Text>
                </View>
              </View>
            </TouchableOpacity>

            <AnimatedPressable
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Logging in…' : 'Login'}</Text>
            </AnimatedPressable>

            <Text style={{ textAlign: 'center', marginTop: 16, color: PREMIUM_LIGHT.muted }}>
              Don't have an account? <Text
                style={{ color: PREMIUM_LIGHT.accent, fontWeight: '900' }}
                onPress={() => navigation.navigate('Register')}
              >
                Register
              </Text>
            </Text>
            </View>
          </Entrance>
        </ScrollView>
      </KeyboardAvoidingView>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          <Text style={styles.loadingText}>Please wait...</Text>
        </View>
      )}
    </View>
  );
};

export default LoginScreen;