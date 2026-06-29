import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFormatDef, type ProductDto } from '@ai-diary/shared';
import { api } from '../lib/api';
import {
  initIap,
  endIap,
  fetchIapProducts,
  purchaseProduct,
  finishIapPurchase,
  type IapProduct,
} from '../lib/iap';
import { toUserMessage } from '../lib/errors';
import { Button, Card, ErrorState } from '../components/ui';
import { colors, spacing } from '../theme';
import type { TabScreenProps } from '../navigation/types';

export function StoreScreen({ navigation }: TabScreenProps<'Store'>) {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [prices, setPrices] = useState<Record<string, IapProduct>>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setLoaded(false);
    api
      .listProducts()
      .then(async (list) => {
        setProducts(list);
        // StoreKit 가격 조회는 실패해도 카드는 보여준다(가격만 "—").
        try {
          setPrices(await fetchIapProducts(list.map((p) => p.appStoreProductId)));
        } catch {
          setPrices({});
        }
      })
      .catch((e) => setError(toUserMessage(e)))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    let alive = true;
    initIap()
      .catch(() => {})
      .finally(() => {
        if (alive) load();
      });
    return () => {
      alive = false;
      endIap().catch(() => {});
    };
  }, [load]);

  const buy = async (card: ProductDto) => {
    setBuying(card.appStoreProductId);
    try {
      const purchase = await purchaseProduct(card.appStoreProductId);
      // 결제 성공 → 백엔드 영수증 검증·발행 → 트랜잭션 종료(검증 성공해야 finish)
      await api.verifyPurchase(purchase.purchaseToken ?? '');
      await finishIapPurchase(purchase);
      Alert.alert('구매 완료', `'${card.title}' 일기장이 책장에 꽂혔어요.`, [
        { text: '확인', onPress: () => navigation.navigate('Shelf') },
      ]);
    } catch (e: any) {
      // 사용자가 결제 시트를 닫은 경우는 조용히 넘어간다.
      if (String(e?.code) !== 'user-cancelled') {
        Alert.alert('구매 실패', toUserMessage(e));
      }
    } finally {
      setBuying(null);
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md },
      ]}
    >
      <Text style={styles.lead}>마음에 드는 일기장을 골라 채워보세요.</Text>
      {!loaded ? (
        <Text style={styles.muted}>불러오는 중…</Text>
      ) : (
        <View style={{ gap: spacing.md }}>
          {products.map((p) => {
            const price = prices[p.appStoreProductId]?.displayPrice ?? '—';
            const periodLabel =
              p.periodType === 'period' ? '기간형' : `칸형 ${p.slotCount}칸`;
            return (
              <Card key={p.appStoreProductId}>
                <Text style={styles.title}>{p.title}</Text>
                <Text style={styles.meta}>
                  {p.section} · {getFormatDef(p.format).label} · {periodLabel}
                  {p.tierLabel ? ` · ${p.tierLabel}` : ''}
                </Text>
                <Text style={styles.desc}>{p.description}</Text>
                <View style={styles.buyRow}>
                  <Text style={styles.price}>{price}</Text>
                  <Button
                    label={buying === p.appStoreProductId ? '구매 중…' : '구매'}
                    variant="primary"
                    onPress={() => buy(p)}
                    loading={buying === p.appStoreProductId}
                    disabled={buying !== null}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 110 },
  lead: { color: colors.muted, fontSize: 15, marginBottom: spacing.lg },
  muted: { color: colors.muted },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  desc: { fontSize: 14, color: colors.text, marginTop: 8, lineHeight: 20 },
  buyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  price: { fontSize: 18, fontWeight: '700', color: colors.text },
});
