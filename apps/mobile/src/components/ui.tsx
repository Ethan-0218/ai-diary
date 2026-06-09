import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

/** web .btn / .btn-primary 대응 버튼 */
export function Button({
  label,
  onPress,
  variant = 'default',
  disabled,
  loading,
  highlighted,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'primary';
  disabled?: boolean;
  loading?: boolean;
  /** 시그널(사진권유·일기완성)로 강조할 때 accent 외곽선 */
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.btn,
        isPrimary && styles.btnPrimary,
        highlighted && !isPrimary && styles.btnHighlighted,
        isDisabled && styles.btnDisabled,
        style,
      ]}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={isPrimary ? colors.white : colors.accent}
          style={{ marginRight: 6 }}
        />
      )}
      <Text
        style={[
          styles.btnText,
          isPrimary && styles.btnTextPrimary,
          highlighted && !isPrimary && styles.btnTextHighlighted,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 로드 실패 시 메시지 + 재시도 버튼 (화면 중앙 또는 인라인). */
export function ErrorState({
  message,
  onRetry,
  retrying,
  inline,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** true면 화면을 채우지 않고 인라인 카드로 표시 */
  inline?: boolean;
}) {
  return (
    <View style={[styles.errorState, !inline && styles.errorStateFill]}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry && (
        <View style={{ marginTop: 12 }}>
          <Button label="다시 시도" onPress={onRetry} loading={retrying} />
        </View>
      )}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.control,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  btnHighlighted: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  btnTextPrimary: { color: colors.white },
  btnTextHighlighted: { color: colors.white },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  errorState: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorStateFill: { flex: 1, backgroundColor: colors.bg },
  errorIcon: { fontSize: 28, marginBottom: 8 },
  errorMessage: {
    color: colors.muted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
