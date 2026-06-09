import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 날짜별 에피소드 요약 (§4-A). 하루 대화→일기 후 1건 생성.
 * 의미검색용 임베딩은 TypeORM이 모르는 pgvector 타입이라 별도 테이블(memory_embedding)에 둔다.
 */
@Entity()
@Index(['userId', 'date'])
export class EpisodicMemory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  conversationId!: string | null;

  /** 그날(YYYY-MM-DD) */
  @Column({ type: 'date' })
  date!: string;

  @Column('text')
  summary!: string;

  /** 그날의 무드 한 단어/구 (선택) */
  @Column({ type: 'varchar', nullable: true })
  mood!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
