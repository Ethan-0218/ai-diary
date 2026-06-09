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

  /** 소속 칸(Slot). 마이그레이션 위해 nullable. */
  @Column({ type: 'uuid', nullable: true })
  slotId!: string | null;

  @Column()
  format!: string; // 'plain' | 'newspaper' | 'novel' — notebook.format에서 복사

  @Column()
  modelId!: string;

  /** 유저 IANA 타임존(인사 시각·오늘 칸·일기 날짜 판정). 생성 시 고정. */
  @Column({ type: 'varchar', nullable: true })
  timezone!: string | null;

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
