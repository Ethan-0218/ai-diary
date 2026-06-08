import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity()
export class Diary {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  conversationId!: string;

  @OneToOne(() => Conversation, (c) => c.diary, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Relation<Conversation>;

  @Column()
  format!: string;

  @Column('text')
  content!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
