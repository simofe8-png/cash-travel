import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { openAppDatabase } from './src/composition/database';

// Temporary bootstrap screen (Step 4): proves the SQLite adapter and migrations on device.
// Replaced by the navigation shell in Step 15.
export default function App() {
  const status = useMemo(() => {
    try {
      const { db, report } = openAppDatabase();
      const fk = db.get<{ foreign_keys: number }>('PRAGMA foreign_keys');
      return `db ok: schema ${report.from}->${report.to}, applied [${report.applied.join(',')}], fk=${fk?.foreign_keys}`;
    } catch (e) {
      return `db error: ${(e as Error).message}`;
    }
  }, []);
  return (
    <View style={styles.container}>
      <Text testID="db-status">{status}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
