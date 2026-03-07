import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import axios from 'axios';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const API = 'https://4c735529e10d7632-102-132-150-241.serveousercontent.com';

// ============================================
// AUTH SCREENS
// ============================================
function LoginScreen({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister ? { email, password, name } : { email, password };
      
      const res = await axios.post(`${API}${endpoint}`, body);
      
      if (res.data.success) {
        const token = res.data.token;
        const user = res.data.user;
        
        // Save token
        await AsyncStorage.setItem('authToken', token);
        await AsyncStorage.setItem('userEmail', email);
        
        onLogin(token, user);
      } else {
        Alert.alert('Error', res.data.error || 'Authentication failed');
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Network error');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.authContainer}>
      <View style={styles.authBox}>
        <Text style={styles.authTitle}>🐋 WHALE ALERT</Text>
        <Text style={styles.authSubtitle}>{isRegister ? 'CREATE ACCOUNT' : 'LOGIN'}</Text>
        
        {isRegister && (
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="NAME (OPTIONAL)"
            placeholderTextColor="#666"
          />
        )}
        
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="EMAIL"
          placeholderTextColor="#666"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="PASSWORD"
          placeholderTextColor="#666"
          secureTextEntry
        />
        
        <TouchableOpacity style={styles.authButton} onPress={handleAuth} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.authButtonText}>
              {isRegister ? '[ CREATE ACCOUNT ]' : '[ LOGIN ]'}
            </Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
          <Text style={styles.authToggle}>
            {isRegister ? '>> ALREADY HAVE ACCOUNT? LOGIN' : '>> CREATE ACCOUNT'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

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
function WalletsScreen({ token }: { token: string }) {
  const [wallets, setWallets] = useState<any[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [selectedChain, setSelectedChain] = useState('ethereum');

  const fetchWallets = async () => {
    try {
      const endpoint = token ? '/api/user/wallets' : '/api/wallets';
      const res = await axios.get(`${API}${endpoint}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      setWallets(res.data.wallets || []);
    } catch (e) {
      console.log('Error:', e);
    }
  };

  useEffect(() => {
    fetchWallets();
  }, [token]);

  const addWallet = async () => {
    if (!newAddress) return;
    try {
      const endpoint = token ? '/api/user/wallets' : '/api/wallets';
      const res = token 
        ? await axios.post(`${API}${endpoint}`, { chain: selectedChain, address: newAddress, label: newLabel || newAddress }, { headers: { Authorization: `Bearer ${token}` } })
        : await axios.post(`${API}${endpoint}`, { chain: selectedChain, address: newAddress, label: newLabel || newAddress });
      
      if (res.data.success) {
        setNewAddress('');
        setNewLabel('');
        fetchWallets();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to add wallet');
    }
  };

  const removeWallet = async (chain: string, index: number) => {
    try {
      const endpoint = token ? '/api/user/wallets' : '/api/wallets';
      const res = token
        ? await axios.delete(`${API}${endpoint}`, { data: { chain, index }, headers: { Authorization: `Bearer ${token}` } })
        : await axios.delete(`${API}${endpoint}`, { data: { chain, index } });
      
      if (res.data.success) fetchWallets();
    } catch (e) {
      Alert.alert('Error', 'Failed to remove wallet');
    }
  };

  const chains = ['ethereum', 'bitcoin', 'solana', 'base', 'arbitrum', 'avalanche', 'polygon', 'tron', 'bsc'];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>WALLETS</Text>
      </View>

      {/* Add Wallet */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ADD WALLET</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          {chains.map(chain => (
            <TouchableOpacity 
              key={chain} 
              style={[styles.chainBtn, selectedChain === chain && styles.chainBtnActive]}
              onPress={() => setSelectedChain(chain)}
            >
              <Text style={[styles.chainBtnText, selectedChain === chain && styles.chainBtnTextActive]}>
                {chain.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
function SettingsScreen({ onLogout, token, user }: { onLogout: () => void, token: string | null, user: any }) {
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    registerForPush();
  }, []);

  const registerForPush = async () => {
    if (!Device.isDevice) {
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return;
    }

    setPushEnabled(true);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SETTINGS</Text>
      </View>

      {token && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <Text style={styles.infoText}>{user?.email}</Text>
          <Text style={styles.infoText}>Plan: {user?.plan?.toUpperCase() || 'FREE'}</Text>
        </View>
      )}

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
        <Text style={styles.infoText}>Whale Wink Terminal v1.0.0</Text>
        <Text style={styles.infoText}>React Native + Expo</Text>
      </View>

      {token && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutButtonText}>[ LOGOUT ]</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ============================================
// MAIN APP
// ============================================
const Tab = createBottomTabNavigator();

function MainApp({ token, user, onLogout }: { token: string | null, user: any, onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#00ff00',
        tabBarInactiveTintColor: '#666',
        headerStyle: styles.headerBar,
        headerTintColor: '#00ff00',
      }}
    >
      <Tab.Screen name="Home" options={{ title: 'DASHBOARD' }}>
        {() => <HomeScreen />}
      </Tab.Screen>
      <Tab.Screen name="Wallets" options={{ title: 'WALLETS' }}>
        {() => <WalletsScreen token={token} />}
      </Tab.Screen>
      <Tab.Screen name="Settings" options={{ title: 'SETTINGS' }}>
        {() => <SettingsScreen onLogout={onLogout} token={token} user={user} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('authToken');
      const storedEmail = await AsyncStorage.getItem('userEmail');
      
      if (storedToken) {
        // Verify token still works
        const res = await axios.get(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
        
        if (res.data.user) {
          setToken(storedToken);
          setUser(res.data.user);
        } else {
          // Token invalid, clear
          await AsyncStorage.removeItem('authToken');
          await AsyncStorage.removeItem('userEmail');
        }
      }
    } catch (e) {
      console.log('Auth check failed:', e);
    }
    setLoading(false);
  };

  const handleLogin = (newToken: string, newUser: any) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('userEmail');
    setToken(null);
    setUser(null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff00" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {token ? (
        <MainApp token={token} user={user} onLogout={handleLogout} />
      ) : (
        <LoginScreen onLogin={handleLogin} />
      )}
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  authBox: {
    padding: 30,
    paddingTop: 80,
  },
  authTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00ff00',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  authSubtitle: {
    fontSize: 14,
    color: '#00aa00',
    fontFamily: 'monospace',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#00ff00',
    color: '#00ff00',
    padding: 15,
    marginBottom: 15,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  authButton: {
    backgroundColor: '#00ff00',
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  authButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  authToggle: {
    color: '#00aa00',
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 12,
  },
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
  chainBtn: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  chainBtnActive: {
    borderColor: '#00ff00',
    backgroundColor: '#00ff00',
  },
  chainBtnText: {
    color: '#666',
    fontFamily: 'monospace',
    fontSize: 10,
  },
  chainBtnTextActive: {
    color: '#000',
    fontWeight: 'bold',
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
    color: '#fff',
    fontFamily: 'monospace',
    marginBottom: 5,
  },
  logoutButton: {
    backgroundColor: '#ff0000',
    padding: 15,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});
