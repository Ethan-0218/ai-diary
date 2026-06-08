import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Relation,
} from 'typeorm';
import { Conversation } from './conversation.entity';

/** 테스트 후 사람이 남기는 줄글 피드백 — agent 개선 분석용 */
@Entity()
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  conversationId!: string;

  @OneToOne(() => Conversation, (c) => c.feedback, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Relation<Conversation>;

  @Column('text')
  content!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
