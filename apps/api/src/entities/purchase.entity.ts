import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { User } from './user.entity';

/**
 * buy-to-own 영수증 검증·소유 audit (S4.4에서 채움).
 * transactionId 유니크로 멱등(중복 검증/복원 방지). 별도 entitlement 테이블 없이
 * Purchase + Notebook의 존재가 곧 소유.
 */
@Entity()
@Index(['userId'])
export class Purchase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Column()
  appStoreProductId!: string;

  @Column({ unique: true })
  transactionId!: string;

  @Column()
  originalTransactionId!: string;

  @Column({ type: 'timestamptz' })
  purchaseDate!: Date;

  @Column()
  environment!: string; // 'sandbox' | 'production'

  @Column({ default: 'valid' })
  status!: string; // 'valid' | 'refunded' | 'revoked'

  @Column({ type: 'text', nullable: true })
  rawPayload!: string | null;

  @Column({ type: 'uuid', nullable: true })
  targetNotebookId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
