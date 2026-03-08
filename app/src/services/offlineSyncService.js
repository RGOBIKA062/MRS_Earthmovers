import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import apiService from './apiService';

class OfflineSyncService {
  constructor() {
    this.QUEUE_KEY = 'offline_queue';
    this.isSyncing = false;
  }

  async addToQueue(data, operation, token) {
    try {
      const queue = await this.getQueue();
      const newItem = {
        id: Date.now().toString(),
        ...data,
        operation,
        token,
        timestamp: new Date().toISOString(),
        synced: false
      };
      
      queue.push(newItem);
      await this.saveQueue(queue);
      return newItem;
    } catch (error) {
      console.error('Error adding to offline queue:', error);
      throw error;
    }
  }

  async getQueue() {
    try {
      const queue = await AsyncStorage.getItem(this.QUEUE_KEY);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('Error getting offline queue:', error);
      return [];
    }
  }

  async saveQueue(queue) {
    try {
      await AsyncStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Error saving offline queue:', error);
      throw error;
    }
  }

  async clearQueue() {
    try {
      await AsyncStorage.removeItem(this.QUEUE_KEY);
    } catch (error) {
      console.error('Error clearing offline queue:', error);
      throw error;
    }
  }

  async syncAll() {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    try {
      this.isSyncing = true;
      const queue = await this.getQueue();
      
      if (queue.length === 0) {
        return { success: true, message: 'No data to sync', synced: 0, total: 0 };
      }

      const results = [];
      
      for (const item of queue) {
        try {
          const result = await this.syncItem(item);
          results.push(result);
        } catch (error) {
          results.push({
            success: false,
            item,
            error: error.message
          });
        }
      }

      const syncedItems = queue.filter((_, index) => results[index]?.success);
      if (syncedItems.length > 0) {
        await this.removeSyncedItems(syncedItems);
      }

      return {
        success: true,
        message: 'Sync completed',
        synced: syncedItems.length,
        total: queue.length,
        results
      };
    } catch (error) {
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  async syncItem(item) {
    try {
      switch (item.operation) {
        case 'attendance':
          return await this.syncAttendance(item);
        case 'workAssignment':
          return await this.syncWorkAssignment(item);
        case 'fuelLog':
          return await this.syncFuelLog(item);
        case 'complaint':
          return await this.syncComplaint(item);
        case 'photoProof':
          return await this.syncPhotoProof(item);
        default:
          throw new Error(`Unknown operation: ${item.operation}`);
      }
    } catch (error) {
      throw new Error(`Sync failed for ${item.operation}: ${error.message}`);
    }
  }

  async syncAttendance(item) {
    const response = await apiService.markAttendance(item.data);
    return { success: true, item, response: response.data };
  }

  async syncWorkAssignment(item) {
    const response = await apiService.updateWorkAssignmentStatus(item.data.id, item.data);
    return { success: true, item, response: response.data };
  }

  async syncFuelLog(item) {
    const response = await apiService.post('/fuel-logs', item.data);
    return { success: true, item, response: response.data };
  }

  async syncComplaint(item) {
    const response = await apiService.reportComplaint(item.data);
    return { success: true, item, response: response.data };
  }

  async syncPhotoProof(item) {
    // Fix for "...fromPath-Could not open file" errors by preserving valid URI schemes.
    let fileUri = String(item?.data?.file?.uri || '');
    if (
      Platform.OS === 'android' &&
      fileUri &&
      !fileUri.startsWith('file://') &&
      !fileUri.startsWith('content://') &&
      !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(fileUri)
    ) {
      fileUri = `file://${fileUri}`;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: item.data.file.type,
      name: item.data.file.name
    });
    
    Object.keys(item.data).forEach(key => {
      if (key !== 'file') {
        formData.append(key, item.data[key]);
      }
    });

    const response = await apiService.post('/photo-proofs', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return { success: true, item, response: response.data };
  }

  async removeSyncedItems(syncedItems) {
    try {
      const queue = await this.getQueue();
      const filteredQueue = queue.filter(item => 
        !syncedItems.some(synced => synced.id === item.id)
      );
      await this.saveQueue(filteredQueue);
    } catch (error) {
      console.error('Error removing synced items:', error);
      throw error;
    }
  }

  async checkConnectivity() {
    try {
      const response = await fetch('http://localhost:3000/api/health', {
        method: 'GET',
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async autoSync() {
    if (await this.checkConnectivity()) {
      try {
        return await this.syncAll();
      } catch (error) {
        console.error('Auto sync failed:', error);
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'No internet connection' };
  }
}

export default new OfflineSyncService();