import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import axios from 'axios';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const API = 'http://192.168.1.100:3000'; // Update for production

// ============================================
// HOME SCREEN - Alerts & Prices
// ============================================
function HomeScreen() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [prices, setPrices] = useState<any>({});
  const [stats, setStats] = useState<any>({});
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [alertsRes, statsRes] = await Promise.all([
        axios.get(`${API}/api/alerts`),
        axios.get(`${API}/api/stats`),
      ]);
      setAlerts(alertsRes.data.alerts || []);
      setStats(statsRes.data || {});
      setPrices(statsRes.data.prices || {});
    } catch (e) {
      console.log('Error fetching data:', e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour12: false });
  };

  const formatUSD = (num: number) => {
    if (!num) return '$.--';
    return '$' + num.toLocaleString();
  };

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.header}>
        <Text style={styles.title}>🐋 WHALE ALERT</Text>
        <Text style={styles.subtitle}>TERMINAL</Text>
      </View>

      {/* Prices */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PRICES</Text>
        <View style={styles.priceGrid}>
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>BTC</Text>
            <Text style={styles.priceValue}>{formatUSD(prices.btc)}</Text>
          </View>
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>ETH</Text>
            <Text style={styles.priceValue}>{formatUSD(prices.eth)}</Text>
          </View>
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>SOL</Text>
            <Text style={styles.priceValue}>{formatUSD(prices.sol)}</Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.section}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.alertsToday || 0}</Text>
            <Text style={styles.statLabel}>ALERTS TODAY</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalWallets || 0}</Text>
            <Text style={styles.statLabel}>WALLETS</Text>
          </View>
        </View>
      </View>

      {/* Recent Alerts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RECENT ALERTS</Text>
        {alerts.length === 0 ? (
          <Text style={styles.noData}>_NO_ALERTS_DETECTED</Text>
        ) : (
          alerts.slice(0, 10).map((alert, i) => (
            <View key={i} style={styles.alertCard}>
              <View style={styles.alertHeader}>
                <Text style={styles.alertChain}>{alert.chain}</Text>
                <Text style={styles.alertTime}>{formatTime(alert.time)}</Text>
              </View>
              <Text style={styles.alertLabel}>{alert.label}</Text>
              <Text style={styles.alertAmount}>{alert.amount}</Text>
              <Text style={styles.alertUSD}>${alert.usd?.toLocaleString()}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ============================================
// WALLETS SCREEN
// ============================================
function WalletsScreen() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [chains, setChains] = useState<string[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [selectedChain, setSelectedChain] = useState('ethereum');

  const fetchWallets = async () => {
    try {
      const res = await axios.get(`${API}/api/wallets`);
      setWallets(res.data.wallets || []);
      setChains(res.data.chains || []);
    } catch (e) {
      console.log('Error:', e);
    }
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  const addWallet = async () => {
    if (!newAddress) return;
    try {
      await axios.post(`${API}/api/wallets`, {
        chain: selectedChain,
        address: newAddress,
        label: newLabel || newAddress,
      });
      setNewAddress('');
      setNewLabel('');
      fetchWallets();
    } catch (e) {
      Alert.alert('Error', 'Failed to add wallet');
    }
  };

  const removeWallet = async (chain: string, index: number) => {
    try {
      await axios.delete(`${API}/api/wallets`, { data: { chain, index } });
      fetchWallets();
    } catch (e) {
      Alert.alert('Error', 'Failed to remove wallet');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>WALLETS</Text>
      </View>

      {/* Add Wallet */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ADD WALLET</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.chainSelect}
            value={selectedChain}
            onChangeText={setSelectedChain}
            placeholder="CHAIN"
            placeholderTextColor="#666"
          />
        </View>
        <TextInput
          style={styles.input}
          value={newAddress}
          onChangeText={setNewAddress}
          placeholder="WALLET ADDRESS"
          placeholderTextColor="#666"
        />
        <TextInput
          style={styles.input}
          value={newLabel}
          onChangeText={setNewLabel}
          placeholder="LABEL (OPTIONAL)"
          placeholderTextColor="#666"
        />
        <TouchableOpacity style={styles.button} onPress={addWallet}>
          <Text style={styles.buttonText}>[ + ADD WALLET ]</Text>
        </TouchableOpacity>
      </View>

      {/* Wallet List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MONITORED ({wallets.length})</Text>
        {wallets.map((wallet, i) => (
          <View key={i} style={styles.walletCard}>
            <View style={styles.walletInfo}>
              <Text style={styles.walletChain}>{wallet.chain?.toUpperCase()}</Text>
              <Text style={styles.walletLabel}>{wallet.label}</Text>
              <Text style={styles.walletAddress}>
                {wallet.address?.slice(0, 10)}...{wallet.address?.slice(-6)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => removeWallet(wallet.chain, i)}>
              <Text style={styles.removeBtn}>[X]</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ============================================
// SETTINGS SCREEN
// ============================================
function SettingsScreen() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');

  useEffect(() => {
    registerForPush();
  }, []);

  const registerForPush = async () => {
    if (!Device.isDevice) {
      Alert.alert('Error', 'Must use physical device for push notifications');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      Alert.alert('Error', 'Failed to get push token');
      return;
    }

    setPushEnabled(true);

    const token = await Notifications.getExpoPushTokenAsync();
    setExpoPushToken(token.data);
    console.log('Push token:', token.data);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SETTINGS</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>PUSH NOTIFICATIONS</Text>
          <Text style={pushEnabled ? styles.settingOn : styles.settingOff}>
            {pushEnabled ? 'ON' : 'OFF'}
          </Text>
        </View>
        <TouchableOpacity style={styles.button} onPress={registerForPush}>
          <Text style={styles.buttonText}>[ ENABLE NOTIFICATIONS ]</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>APP INFO</Text>
        <Text style={styles.infoText}>Whale Alert Terminal v1.0.0</Text>
        <Text style={styles.infoText}>React Native + Expo</Text>
      </View>
    </ScrollView>
  );
}

// ============================================
// NAVIGATION
// ============================================
const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#00ff00',
          tabBarInactiveTintColor: '#666',
          headerStyle: styles.headerBar,
          headerTintColor: '#00ff00',
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'DASHBOARD' }} />
        <Tab.Screen name="Wallets" component={WalletsScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  headerBar: {
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#00ff00',
  },
  tabBar: {
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#00ff00',
  },
  header: {
    padding: 20,
    paddingTop: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#00ff00',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00ff00',
    fontFamily: 'monospace',
  },
  subtitle: {
    fontSize: 14,
    color: '#00aa00',
    fontFamily: 'monospace',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    fontSize: 12,
    color: '#00aa00',
    fontFamily: 'monospace',
    marginBottom: 15,
  },
  priceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priceCard: {
    flex: 1,
    backgroundColor: '#111',
    padding: 15,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#00ff00',
  },
  priceLabel: {
    color: '#00aa00',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  priceValue: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#00ff00',
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  statLabel: {
    color: '#00aa00',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  noData: {
    color: '#666',
    fontFamily: 'monospace',
    textAlign: 'center',
    padding: 20,
  },
  alertCard: {
    backgroundColor: '#111',
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#00ff00',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  alertChain: {
    color: '#00ff00',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  alertTime: {
    color: '#666',
    fontFamily: 'monospace',
  },
  alertLabel: {
    color: '#fff',
    fontFamily: 'monospace',
  },
  alertAmount: {
    color: '#00ff00',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  alertUSD: {
    color: '#00aa00',
    fontFamily: 'monospace',
  },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#00ff00',
    color: '#00ff00',
    padding: 12,
    marginBottom: 10,
    fontFamily: 'monospace',
  },
  inputRow: {
    marginBottom: 10,
  },
  chainSelect: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#00ff00',
    color: '#00ff00',
    padding: 12,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#00ff00',
    padding: 15,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  walletCard: {
    backgroundColor: '#111',
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletInfo: {
    flex: 1,
  },
  walletChain: {
    color: '#00aa00',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  walletLabel: {
    color: '#fff',
    fontFamily: 'monospace',
  },
  walletAddress: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  removeBtn: {
    color: '#ff0000',
    fontFamily: 'monospace',
    padding: 10,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  settingLabel: {
    color: '#fff',
    fontFamily: 'monospace',
  },
  settingOn: {
    color: '#00ff00',
    fontFamily: 'monospace',
  },
  settingOff: {
    color: '#ff0000',
    fontFamily: 'monospace',
  },
  infoText: {
    color: '#666',
    fontFamily: 'monospace',
    marginBottom: 5,
  },
});
