import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 상품 카탈로그(=ASC SKU). 진열 메타데이터를 재배포 없이 DB에서 변경하기 위해 테이블로 둔다.
 * 가격은 여기에 없다 — IAP는 ASC SKU 가격이 진실(StoreKit이 현지화 가격 반환).
 * 시드 소스는 packages/shared PRODUCT_CATALOG.
 */
@Entity()
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  appStoreProductId!: string;

  /** 한 진열 카드로 묶는 라인 키(주간 티어 4개가 같은 lineId). */
  @Column()
  lineId!: string;

  /** 월간 라인의 주간 티어(4/3/2/1). 단일가(칸형/번들)는 null. */
  @Column({ type: 'int', nullable: true })
  weeksTier!: number | null;

  @Column()
  kind!: string; // 'notebook' | 'bundle' | 'voice_upgrade'

  @Column()
  title!: string;

  @Column('text')
  description!: string;

  @Column()
  coverKey!: string;

  @Column()
  format!: string; // 'plain' | 'newspaper' | 'novel'

  @Column()
  periodType!: string; // 'period' | 'cell'

  /** 기간형 칸 수 산출법: 'month' | 'year' | '{"days":N}'(JSON). 칸형은 null. */
  @Column({ type: 'varchar', nullable: true })
  periodSpec!: string | null;

  @Column({ type: 'int' })
  slotCount!: number;

  @Column({ default: false })
  voiceEnabled!: boolean;

  @Column({ type: 'int', nullable: true })
  bundleSize!: number | null;

  @Column()
  section!: string; // '연대기' | '컬렉션'

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
