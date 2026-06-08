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
@Index(['conversationId'])
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => Conversation, (c) => c.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Relation<Conversation>;

  @Column({ type: 'uuid', nullable: true })
  messageId!: string | null;

  @Column()
  filePath!: string;

  @Column()
  mimeType!: string;

  @Column({ type: 'text', nullable: true })
  caption!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
