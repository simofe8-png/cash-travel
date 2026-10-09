import { Redirect, Tabs, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQuery } from '../../ui/AppContext';
import { Icon, type IconName } from '../../ui/components/primitives';
import { he } from '../../ui/i18n/he';
import { colors } from '../../ui/theme/tokens';

const icon = (name: IconName, active: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={focused ? active : name} color={color} size={24} />;
  };

const label = (text: string) =>
  function TabLabel({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <View style={styles.labelWrap}>
        {/* Six tabs: one line, scaled down rather than clipped or wrapped at large font sizes. */}
        <Text style={[styles.label, { color }, focused && styles.labelFocused]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.4}>
          {text}
        </Text>
        <View style={[styles.underline, focused && { backgroundColor: colors.primary }]} />
      </View>
    );
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const hasTrip = useQuery((s) => s.tripService.currentTrip() !== undefined);
  if (!hasTrip) return <Redirect href="/trip-setup" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 70 + insets.bottom, paddingBottom: 4 + insets.bottom, paddingTop: 6 },
      }}>
      <Tabs.Screen name="index" options={{ title: he.tabs.home, tabBarIcon: icon('home-outline', 'home'), tabBarLabel: label(he.tabs.home) }} />
      <Tabs.Screen name="journal" options={{ title: he.tabs.journal, tabBarIcon: icon('notebook-outline', 'notebook'), tabBarLabel: label(he.tabs.journal) }} />
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
                <Icon name="plus" color={colors.primaryInk} size={34} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="documents" options={{ title: he.tabs.documents, tabBarIcon: icon('file-document-multiple-outline', 'file-document-multiple'), tabBarLabel: label(he.tabs.documents) }} />
      <Tabs.Screen name="summary" options={{ title: he.tabs.summary, tabBarIcon: icon('chart-bar', 'chart-bar'), tabBarLabel: label(he.tabs.summary) }} />
      <Tabs.Screen name="settings" options={{ title: he.tabs.settings, tabBarIcon: icon('cog-outline', 'cog'), tabBarLabel: label(he.tabs.settings) }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  plusWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: -22, elevation: 6, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  labelWrap: { alignItems: 'center', gap: 4, alignSelf: 'stretch', paddingHorizontal: 2 },
  label: { fontSize: 12.5, fontWeight: '500', textAlign: 'center' },
  labelFocused: { fontWeight: '700' },
  underline: { width: 36, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
});
