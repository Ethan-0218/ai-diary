import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

/** 소셜 로그인 유저 (provider+providerId로 식별). */
@Entity()
@Index(['provider', 'providerId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  provider!: string; // 'apple' | 'google' | 'kakao' | 'dev'

  @Column()
  providerId!: string;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  name!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Conversation, (c) => c.user)
  conversations!: Conversation[];
}
