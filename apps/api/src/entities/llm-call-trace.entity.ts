import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { LlmUsage } from './llm-usage.entity';

/** raw 입출력 보존 — 개선점 분석용 */
@Entity()
@Index(['traceId'])
export class LlmCallTrace {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  llmUsageId!: string;

  @OneToOne(() => LlmUsage, (u) => u.trace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'llmUsageId' })
  usage!: Relation<LlmUsage>;

  @Column()
  traceId!: string;

  @Column('text')
  requestPayload!: string;

  @Column({ type: 'text', nullable: true })
  responsePayload!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
