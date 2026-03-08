import React from 'react';
import { View, Text, Pressable, DevSettings, ScrollView } from 'react-native';
import { PREMIUM_LIGHT } from '../styles/tokens';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', componentStack: '' };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Intentionally minimal: avoid noisy LogBox spam for end users.
    // Keep a single log for developers.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('AppErrorBoundary caught an error:', error);
      // eslint-disable-next-line no-console
      console.error('Component stack:', info?.componentStack);
    }

    this.setState({
      errorMessage: String(error?.message || error || 'Unknown error'),
      componentStack: String(info?.componentStack || ''),
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: PREMIUM_LIGHT.bg,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 520,
            borderRadius: 18,
            backgroundColor: PREMIUM_LIGHT.surface,
            borderWidth: 1,
            borderColor: PREMIUM_LIGHT.border,
            padding: 18,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '900', color: PREMIUM_LIGHT.text }}>
            Something Went Wrong
          </Text>
          <Text style={{ marginTop: 8, color: PREMIUM_LIGHT.muted, lineHeight: 20 }}>
            An unexpected error occurred. Try reloading the app or going back to the previous screen.
          </Text>

          {__DEV__ ? (
            <View
              style={{
                marginTop: 14,
                borderRadius: 14,
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: PREMIUM_LIGHT.border,
                overflow: 'hidden',
              }}
            >
              <View style={{ padding: 10, backgroundColor: PREMIUM_LIGHT.accentSoft }}>
                <Text style={{ color: PREMIUM_LIGHT.text, fontWeight: '900' }}>Debug details</Text>
                <Text style={{ marginTop: 4, color: PREMIUM_LIGHT.muted }} numberOfLines={2}>
                  {this.state.errorMessage}
                </Text>
              </View>
              <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ padding: 10 }}>
                <Text style={{ color: PREMIUM_LIGHT.text, fontSize: 12, lineHeight: 16 }}>
                  {this.state.componentStack || '(no component stack)'}
                </Text>
              </ScrollView>
            </View>
          ) : null}

          <Pressable
            onPress={() => {
              this.setState({ hasError: false, errorMessage: '', componentStack: '' });
              DevSettings.reload();
            }}
            style={{
              marginTop: 14,
              backgroundColor: PREMIUM_LIGHT.accent,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900' }}>Reload App</Text>
          </Pressable>

          <Pressable
            onPress={() => this.setState({ hasError: false, errorMessage: '', componentStack: '' })}
            style={{
              marginTop: 10,
              backgroundColor: PREMIUM_LIGHT.accentSoft,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: PREMIUM_LIGHT.border,
            }}
          >
            <Text style={{ color: PREMIUM_LIGHT.accent, fontWeight: '900' }}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}
