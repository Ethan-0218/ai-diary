import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Slot } from './slot.entity';

/**
 * 유저가 소유한 일기장 한 권(인스턴스). 발행 시 Product 카탈로그 속성을 스냅샷 동결한다
 * (카탈로그가 바뀌어도 이미 산 권은 보존). 칸(Slot)은 발행 시 명시 생성된다.
 */
@Entity()
@Index(['userId'])
export class Notebook {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  /** 발행 근거 SKU(Product.appStoreProductId) 느슨한 참조. 스타터는 'starter:plain' 등. */
  @Column({ type: 'varchar', nullable: true })
  productId!: string | null;

  @Column()
  source!: string; // 'starter' | 'purchase' | 'bundle' | 'grant'

  @Column({ type: 'uuid', nullable: true })
  purchaseId!: string | null;

  // ── 발행 시 카탈로그에서 동결한 스냅샷 ──
  @Column()
  title!: string;

  @Column()
  coverKey!: string;

  @Column()
  format!: string; // 'plain' | 'newspaper' | 'novel'

  @Column()
  periodType!: string; // 'period' | 'cell'

  @Column({ type: 'int' })
  slotCount!: number;

  @Column({ default: false })
  voiceEnabled!: boolean;

  // ── 리마인더(로컬 푸시) 설정 ──
  @Column({ default: true })
  reminderEnabled!: boolean;

  @Column({ type: 'varchar', length: 5, default: '22:00' })
  reminderTime!: string; // 'HH:mm' 로컬 wall-clock

  // ── 기간형(period)만 ──
  @Column({ type: 'date', nullable: true })
  periodStart!: string | null;

  @Column({ type: 'date', nullable: true })
  periodEnd!: string | null;

  @Column({ default: 'active' })
  status!: string; // 'active' | 'completed' | 'expired'

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Slot, (s) => s.notebook)
  slots!: Slot[];
}
