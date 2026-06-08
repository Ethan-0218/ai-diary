import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { User } from './user.entity';
import { Message } from './message.entity';
import { Attachment } from './attachment.entity';
import { Diary } from './diary.entity';
import { Feedback } from './feedback.entity';
import { LlmUsage } from './llm-usage.entity';

/** 하루의 대화 (한 유저 소유 — 인증 배선 전 익명 허용 위해 userId nullable). */
@Entity()
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, (u) => u.conversations, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User> | null;

  @Column()
  title!: string;

  @Column()
  format!: string; // 'plain' | 'newspaper' | 'novel'

  @Column()
  modelId!: string;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ type: 'varchar', nullable: true })
  weatherNote!: string | null;

  /** 인터뷰 수집 상태(JSON: CollectionState) — 하루 누적. (s3.2 §3) */
  @Column({ type: 'text', nullable: true })
  collectionState!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => Message, (m) => m.conversation)
  messages!: Message[];

  @OneToMany(() => Attachment, (a) => a.conversation)
  attachments!: Attachment[];

  @OneToOne(() => Diary, (d) => d.conversation)
  diary!: Relation<Diary> | null;

  @OneToOne(() => Feedback, (f) => f.conversation)
  feedback!: Relation<Feedback> | null;

  @OneToMany(() => LlmUsage, (u) => u.conversation)
  llmUsages!: LlmUsage[];
}
