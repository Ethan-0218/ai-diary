import React, {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

/**
 * 의존성 없는 다크 글라스 바텀시트.
 * - 열기/닫기 슬라이드 애니메이션
 * - 백드롭 탭으로 닫기
 * - 상단 핸들을 쓸어내려 닫기(임계치 넘기면 닫힘, 아니면 제자리 복귀)
 * - 키보드가 뜨면 시트가 그 위로 올라옴
 *
 * 부모가 visible/onClose를 제어한다(onClose는 visible=false로 만들면 됨).
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(screenH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [kbHeight, setKbHeight] = useState(0);

  // onClose의 최신 참조(PanResponder는 한 번만 생성되므로 stale 방지)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) =>
      setKbHeight(e.endCoordinates?.height ?? 0),
    );
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  // visible 변화 → 마운트/언마운트 + 애니메이션
  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else if (mounted) {
      Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: screenH,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => finished && setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // 마운트되면 슬라이드 인
  useEffect(() => {
    if (!mounted) return;
    translateY.setValue(screenH);
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 240,
        mass: 0.9,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110 || g.vy > 0.9) {
          onCloseRef.current();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 24,
            stiffness: 240,
          }).start();
        }
      },
    }),
  ).current;

  if (!mounted) return null;

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.fill}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={styles.fill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              marginBottom: kbHeight,
              paddingBottom: (insets.bottom || spacing.md) + spacing.sm,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* 쓸어내려 닫기 핸들 */}
          <View {...pan.panHandlers} style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,5,11,0.6)',
  },
  sheet: {
    backgroundColor: '#181426',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border2,
    paddingHorizontal: spacing.lg,
    shadowColor: '#7c6bd6',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 12 },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.heading,
    marginBottom: spacing.md,
  },
});
