import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nManager, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getAppServices } from '../composition/appContainer';
import type { AppServices } from '../composition/createServices';
import { AppProvider } from '../ui/AppContext';
import { StartupErrorScreen } from '../ui/screens/StartupErrorScreen';
import { colors, rtlRoot } from '../ui/theme/tokens';

type Boot = { services: AppServices } | { error: Error };

export default function RootLayout() {
  const [boot] = useState<Boot>(() => {
    try {
      return { services: getAppServices() };
    } catch (e) {
      return { error: e as Error };
    }
  });

  useEffect(() => {
    // Hebrew-only app: RTL is forced natively in builds (expo-localization forcesRTL); this keeps
    // the JS side consistent where the host allows it.
    if (!I18nManager.isRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <View style={rtlRoot}>
      <StatusBar style="dark" />
      {'error' in boot ? (
        <StartupErrorScreen />
      ) : (
        <AppProvider services={boot.services}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="trip-setup" />
            <Stack.Screen name="action/[id]" />
          </Stack>
        </AppProvider>
      )}
      </View>
    </SafeAreaProvider>
  );
}
