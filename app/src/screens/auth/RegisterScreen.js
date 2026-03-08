import React, { useState } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import styles from '../../styles/styles';
import { PREMIUM_LIGHT } from '../../styles/tokens';
import Entrance from '../../components/Entrance';
import AnimatedPressable from '../../components/AnimatedPressable';

const ROLE_OPTIONS = [
  { key: 'USER', label: 'Customer', icon: 'person' },
  { key: 'DRIVER', label: 'Driver', icon: 'local-shipping' },
  { key: 'ADMIN', label: 'Admin', icon: 'admin-panel-settings' },
];

const RegisterScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: 'USER'
  });
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ email: '', phone: '', password: '' });
  const { register } = useAuth();

  const validateEmailFormat = (value) => /\S+@\S+\.\S+/.test(value);

  const handleInputChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleEmailChange = (value) => {
    const trimmed = value.trim();
    setFormData((prev) => ({ ...prev, email: trimmed }));
    setErrors((prev) => ({
      ...prev,
      email: trimmed.length && !validateEmailFormat(trimmed) ? 'Enter a valid email address' : '',
    }));
  };

  const handlePhoneChange = (value) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
    setFormData((prev) => ({ ...prev, phone: digitsOnly }));
    setErrors((prev) => ({
      ...prev,
      phone: digitsOnly.length === 10 || digitsOnly.length === 0 ? '' : 'Phone must be exactly 10 digits',
    }));
  };

  const handlePasswordChange = (value) => {
    setFormData((prev) => ({ ...prev, password: value }));
    setErrors((prev) => ({
      ...prev,
      password: value.length === 0 || value.length >= 6 ? '' : 'Password must be at least 6 characters',
    }));
  };

  const handleConfirmPasswordChange = (value) => {
    setFormData((prev) => ({ ...prev, confirmPassword: value }));
  };

  const handleRegister = async () => {
    if (!formData.name || !formData.email || !formData.phone || !formData.password) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (!/^\d{6,}$/.test(formData.password)) {
      Alert.alert('Error', 'Password must be at least 6 digits');
      return;
    }

    if (!validateEmailFormat(formData.email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (formData.role === 'ADMIN' && formData.email.toLowerCase() !== 'admin@gmail.com') {
      Alert.alert('Error', 'Only admin can register');
      return;
    }

    if (formData.phone.length !== 10) {
      Alert.alert('Error', 'Phone number must be exactly 10 digits');
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: formData.role
      }, { remember: rememberMe });
      if (result.success) {
        Alert.alert('Success', 'Registration successful');
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Registration failed');
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
            Create your account
          </Text>
        </View>
      </Entrance>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <Entrance fromY={0} duration={280}>
            <View style={styles.card}>
            <Text style={styles.title}>Choose Role</Text>
            <Text style={[styles.subtitle, { marginTop: 4, marginBottom: 10 }]}>
              Select how you want to use the app.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              {ROLE_OPTIONS.map((r) => {
                const selected = formData.role === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? 'rgba(255,138,0,0.45)' : PREMIUM_LIGHT.border,
                      backgroundColor: selected ? PREMIUM_LIGHT.accentSoft : PREMIUM_LIGHT.surface,
                      marginRight: 8,
                      marginBottom: 8,
                    }}
                    onPress={() => handleInputChange('role', r.key)}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons
                      name={r.icon}
                      size={18}
                      color={selected ? PREMIUM_LIGHT.accent : PREMIUM_LIGHT.muted}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={{ color: selected ? PREMIUM_LIGHT.accent : PREMIUM_LIGHT.text, fontWeight: '800' }}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(value) => handleInputChange('name', value)}
              placeholder="Enter your full name"
              placeholderTextColor={PREMIUM_LIGHT.muted}
            />

            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              value={formData.email}
              onChangeText={handleEmailChange}
              placeholder="Enter your email"
              placeholderTextColor={PREMIUM_LIGHT.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!errors.email && (
              <Text style={{ color: '#d32f2f', marginTop: 4 }}>{errors.email}</Text>
            )}

            <Text style={styles.label}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              value={formData.phone}
              onChangeText={handlePhoneChange}
              placeholder="Enter your phone number"
              placeholderTextColor={PREMIUM_LIGHT.muted}
              keyboardType="phone-pad"
              maxLength={10}
            />
            {!!errors.phone && (
              <Text style={{ color: '#d32f2f', marginTop: 4 }}>{errors.phone}</Text>
            )}

            <Text style={styles.label}>Password *</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[styles.input, { paddingRight: 46 }]}
                value={formData.password}
                onChangeText={handlePasswordChange}
                placeholder="Enter your password"
                placeholderTextColor={PREMIUM_LIGHT.muted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={{ position: 'absolute', right: 12, top: 18 }}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={loading}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={22}
                  color={PREMIUM_LIGHT.muted}
                />
              </TouchableOpacity>
            </View>
            {!!errors.password && (
              <Text style={{ color: '#d32f2f', marginTop: 4 }}>{errors.password}</Text>
            )}

            <Text style={styles.label}>Confirm Password *</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[styles.input, { paddingRight: 46 }]}
                value={formData.confirmPassword}
                onChangeText={handleConfirmPasswordChange}
                placeholder="Confirm your password"
                placeholderTextColor={PREMIUM_LIGHT.muted}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword((v) => !v)}
                style={{ position: 'absolute', right: 12, top: 18 }}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={loading}
              >
                <MaterialIcons
                  name={showConfirmPassword ? 'visibility-off' : 'visibility'}
                  size={22}
                  color={PREMIUM_LIGHT.muted}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.row, styles.rowLast, { borderBottomWidth: 0, marginTop: 6 }]}
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
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Registering…' : 'Create Account'}</Text>
            </AnimatedPressable>

            <Text style={{ textAlign: 'center', marginTop: 16, color: PREMIUM_LIGHT.muted }}>
              Already have an account? <Text
                style={{ color: PREMIUM_LIGHT.accent, fontWeight: '900' }}
                onPress={() => navigation.navigate('Login')}
              >
                Login
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

export default RegisterScreen;