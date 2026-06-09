import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Notebook } from './notebook.entity';

/**
 * 일기장의 한 칸. 발행 시 명시 생성된다(월 중 구매 = 남은 칸만).
 * status가 적응형 홈 3상태의 저장소: empty(오늘 대화 없음) / drafting(대화 중) / filled(일기 있음).
 * "하루 한 편 = 일기장 단위"는 (notebookId, slotDate) 유니크로 강제.
 */
@Entity()
@Unique('uq_slot_notebook_index', ['notebookId', 'index'])
@Index('uq_slot_notebook_date', ['notebookId', 'slotDate'], {
  unique: true,
  where: '"slotDate" IS NOT NULL',
})
export class Slot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  notebookId!: string;

  @ManyToOne(() => Notebook, (n) => n.slots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notebookId' })
  notebook!: Relation<Notebook>;

  /** 칸 순번 1..N */
  @Column({ type: 'int' })
  index!: number;

  /** 기간형 = 고정 날짜 / 칸형 = 채울 때 기록(현지 새벽5시 컷 적용된 날짜) */
  @Column({ type: 'date', nullable: true })
  slotDate!: string | null;

  @Column({ default: 'empty' })
  status!: string; // 'empty' | 'drafting' | 'filled'

  @Column({ type: 'uuid', nullable: true })
  conversationId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
