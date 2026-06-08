import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { LlmCallTrace } from './llm-call-trace.entity';

/** 가벼운 비용 집계 row — 표시/쿼리용 */
@Entity()
@Index(['conversationId', 'createdAt'])
@Index(['traceId'])
export class LlmUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  traceId!: string;

  @Column({ type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => Conversation, (c) => c.llmUsages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Relation<Conversation>;

  @Column()
  step!: string; // first_greeting | chat_turn | photo_caption | diary_generation

  @Column()
  modelId!: string;

  @Column({ type: 'int', default: 0 })
  inputTokens!: number;

  @Column({ type: 'int', default: 0 })
  outputTokens!: number;

  @Column({ type: 'int', default: 0 })
  cacheReadTokens!: number;

  @Column({ type: 'double precision', default: 0 })
  costUsd!: number;

  @Column()
  status!: string; // success | failure

  @Column({ type: 'int', default: 0 })
  durationMs!: number;

  @Column({ type: 'text', nullable: true })
  errorSummary!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToOne(() => LlmCallTrace, (t) => t.usage)
  trace!: Relation<LlmCallTrace> | null;
}
