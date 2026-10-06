import { Text } from 'react-native';

/**
 * Currency flag as a Unicode regional-indicator emoji (no image assets). ISO 4217 codes start with
 * the issuing country's ISO 3166 code (THB → TH); EUR → EU is also a standard flag sequence.
 */
export function flagEmoji(currency: string): string {
  const cc = currency.slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function Flag({ currency, size = 20 }: { currency: string; size?: number }) {
  return (
    <Text style={{ fontSize: size, lineHeight: size * 1.25 }} accessible={false} importantForAccessibility="no">
      {flagEmoji(currency)}
    </Text>
  );
}
