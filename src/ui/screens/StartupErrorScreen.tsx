import { AppText, EmptyState, Screen } from '../components/primitives';
import { he } from '../i18n/he';
import { colors } from '../theme/tokens';

/** Shown when the database cannot be opened/migrated. Never deletes or resets data. */
export function StartupErrorScreen() {
  return (
    <Screen scroll={false} testID="startup-error">
      <EmptyState icon="database-alert-outline" title={he.errors.dbTitle} />
      <AppText center color={colors.inkMuted}>
        {he.errors.dbBody}
      </AppText>
    </Screen>
  );
}
