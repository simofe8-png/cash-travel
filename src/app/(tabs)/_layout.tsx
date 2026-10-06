import { Redirect, Tabs, router } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';

import { useQuery } from '../../ui/AppContext';
import { Icon, type IconName } from '../../ui/components/primitives';
import { he } from '../../ui/i18n/he';
import { colors } from '../../ui/theme/tokens';

const icon = (name: IconName) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} color={color} size={24} />;
  };

export default function TabsLayout() {
  const hasTrip = useQuery((s) => s.tripService.currentTrip() !== undefined);
  if (!hasTrip) return <Redirect href="/trip-setup" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 64, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 12 },
      }}>
      <Tabs.Screen name="index" options={{ title: he.tabs.home, tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="journal" options={{ title: he.tabs.journal, tabBarIcon: icon('notebook-outline') }} />
      <Tabs.Screen
        name="plus"
        options={{
          title: he.tabs.add,
          tabBarButton: () => (
            <View style={styles.plusWrap}>
              <Pressable
                testID="tab-add"
                accessibilityRole="button"
                accessibilityLabel={he.tabs.add}
                onPress={() => router.push('/add')}
                style={({ pressed }) => [styles.plus, pressed && { opacity: 0.8 }]}>
                <Icon name="plus" color={colors.primaryInk} size={30} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="summary" options={{ title: he.tabs.summary, tabBarIcon: icon('chart-donut') }} />
      <Tabs.Screen name="settings" options={{ title: he.tabs.settings, tabBarIcon: icon('cog-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  plusWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: -18, elevation: 4 },
});
