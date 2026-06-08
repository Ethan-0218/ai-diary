import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Conversation,
  Message,
  Attachment,
  Diary,
  Feedback,
  LlmUsage,
} from '../entities';
import { AuthModule } from '../auth/auth.module';
import { MemoryModule } from '../memory/memory.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      Message,
      Attachment,
      Diary,
      Feedback,
      LlmUsage,
    ]),
    AuthModule, // JwtAuthGuard 사용
    MemoryModule, // 세션 간 기억(주입·추출·회수)
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
