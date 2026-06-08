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
import { Conversation } from './conversation.entity';

@Entity()
@Index(['conversationId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => Conversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Relation<Conversation>;

  @Column()
  role!: string; // 'user' | 'assistant'

  @Column('text')
  content!: string;

  /** JSON 문자열: 첨부/툴 콜 등 */
  @Column({ type: 'text', nullable: true })
  parts!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
