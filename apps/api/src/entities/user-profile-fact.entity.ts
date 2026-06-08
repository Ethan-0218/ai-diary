import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 유저에 대한 지속 사실 (§4-A). 대화/일기에서 *명시된 것만* 보수적으로 추출한다.
 * 모순/갱신 시 옛 레코드는 supersededAt을 찍어 비활성화(이력 보존)하고 새 레코드를 넣는다.
 * 활성 사실 = supersededAt IS NULL.
 */
@Entity()
@Index(['userId', 'category'])
export class UserProfileFact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  /** 가족·직업·건강·관심사·진행중일 등 */
  @Column()
  category!: string;

  @Column('text')
  content!: string;

  /** 0~1. 추출 확신도(환각 완화용). */
  @Column({ type: 'float', default: 0.7 })
  confidence!: number;

  /** 근거가 된 메시지(있으면) */
  @Column({ type: 'uuid', nullable: true })
  sourceMessageId!: string | null;

  /** null = 활성. 값이 있으면 더 최신 사실로 대체된 옛 기록. */
  @Column({ type: 'timestamp', nullable: true })
  supersededAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
