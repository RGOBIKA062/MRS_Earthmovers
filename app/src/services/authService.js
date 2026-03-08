import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const devHost = Constants.expoConfig?.hostUri?.split(':')?.[0];
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (devHost ? `http://${devHost}:3000/api` : 'http://localhost:3000/api');

class AuthService {
  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
    });
    
    this.api.interceptors.request.use(async (config) => {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  async register(userData) {
    try {
      const response = await this.api.post('/auth/register', userData);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.error || error.message;
    }
  }

  async login(email, password) {
    try {
      const response = await this.api.post('/auth/login', { email, password });
      const { user, token } = response.data.data;
      return { user, token };
    } catch (error) {
      const serverMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      const normalizedMessage = /invalid/i.test(String(serverMessage || ''))
        ? 'Invalid email id or password'
        : serverMessage;
      throw new Error(normalizedMessage);
    }
  }

  async getProfile() {
    try {
      const response = await this.api.get('/auth/profile');
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.error || error.message;
    }
  }

  async updateProfile(profileData) {
    try {
      const response = await this.api.put('/auth/profile', profileData);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.error || error.message;
    }
  }

  async changePassword(currentPassword, newPassword) {
    try {
      const response = await this.api.put('/auth/change-password', {
        currentPassword,
        newPassword
      });
      return response.data;
    } catch (error) {
      throw error.response?.data?.error || error.message;
    }
  }

  async logout() {
    try {
      await this.api.post('/auth/logout');
      await AsyncStorage.removeItem('token');
    } catch (error) {
      await AsyncStorage.removeItem('token');
      throw error.response?.data?.error || error.message;
    }
  }
}

export const authService = new AuthService();
export default authService;