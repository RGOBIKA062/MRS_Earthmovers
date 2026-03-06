import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Alert, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/styles';
import apiService from '../services/apiService';
import { PREMIUM_LIGHT } from '../styles/tokens';
import RazorpayCheckout from 'react-native-razorpay';

export default function PaymentScreen({ route, navigation }) {
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [amount, setAmount] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const response = await apiService.getPaymentsByCustomer();
      setPayments(response.data.data || []);
    } catch (e) {
      console.error('Fetch payments error:', e);
    }
    setLoading(false);
  };

  const handlePayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setProcessingPayment(true);

    try {
      // Step 1: Create order on backend
      const orderResponse = await apiService.createRazorpayOrder(
        parseFloat(amount),
        null,
        `Payment for MRS Earthmovers - ${user.name}`
      );

      const { orderId, paymentId } = orderResponse.data.data;

      // Step 2: Open Razorpay checkout
      const options = {
        description: `Payment for MRS Earthmovers - ${user.name}`,
        image: 'https://i.imgur.com/3g7nmJC.png',
        currency: 'INR',
        key: 'rzp_test_1sTfDQerFweaom', // Replace with your Razorpay Key ID
        amount: parseFloat(amount) * 100, // Convert to paise
        name: 'MRS Earthmovers',
        order_id: orderId,
        prefill: {
          email: user.email || '',
          contact: user.phone || '',
          name: user.name || ''
        },
        theme: { color: PREMIUM_LIGHT.accent }
      };

      RazorpayCheckout.open(options)
        .then(async (data) => {
          // Step 3: Verify payment on backend
          try {
            const verifyResponse = await apiService.verifyRazorpayPayment(
              orderId,
              data.razorpay_payment_id,
              data.razorpay_signature,
              paymentId
            );

            Alert.alert(
              'Success',
              'Payment successful! Transaction ID: ' + data.razorpay_payment_id
            );
            setAmount('');
            await fetchPayments();
          } catch (verifyError) {
            Alert.alert(
              'Error',
              'Payment verification failed. Please contact support.'
            );
            console.error('Verification error:', verifyError);
          }
        })
        .catch((error) => {
          Alert.alert('Error', 'Payment cancelled or failed');
          console.error('Razorpay error:', error);
        })
        .finally(() => {
          setProcessingPayment(false);
        });
    } catch (error) {
      Alert.alert('Error', 'Failed to initiate payment');
      console.error('Payment initiation error:', error);
      setProcessingPayment(false);
    }
  };



  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: 24 }]}>
        <Text style={styles.headerTitle}>Make a Payment</Text>
        <Text style={{ fontSize: 14, color: PREMIUM_LIGHT.muted, textAlign: 'center', marginTop: 8 }}>
          Secure online payment via Razorpay
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Payment Amount</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter amount in ₹"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholderTextColor={PREMIUM_LIGHT.muted}
          />

          <TouchableOpacity
            style={[styles.button, processingPayment && { opacity: 0.6 }]}
            onPress={handlePayment}
            disabled={processingPayment || !amount}
          >
            <Text style={styles.buttonText}>
              {processingPayment ? 'Processing...' : '💳 Pay with Razorpay'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.subtitle, { marginTop: 12, textAlign: 'center' }]}>
            ✓ Secure payment gateway
          </Text>
          <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 4 }]}>
            ✓ Multiple payment options (Card, UPI, Netbanking, Wallet)
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Payment History</Text>
          {loading ? (
            <ActivityIndicator size="large" color={PREMIUM_LIGHT.accent} />
          ) : payments.length === 0 ? (
            <Text style={styles.subtitle}>No payments found.</Text>
          ) : (
            <FlatList
              scrollEnabled={false}
              data={payments}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <View style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.subtitle, { fontWeight: 'bold' }]}>₹{item.amount}</Text>
                    <Text
                      style={[
                        styles.subtitle,
                        {
                          color:
                            item.status === 'SUCCESS'
                              ? PREMIUM_LIGHT.success
                              : item.status === 'PENDING'
                              ? PREMIUM_LIGHT.accent
                              : PREMIUM_LIGHT.danger
                        }
                      ]}
                    >
                      {item.status}
                    </Text>
                  </View>
                  <Text style={styles.subtitle}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                  <Text style={styles.subtitle}>{item.paymentMethod}</Text>
                </View>
              )}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
