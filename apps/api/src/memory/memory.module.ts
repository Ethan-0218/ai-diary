import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProfileFact, EpisodicMemory, Diary } from '../entities';
import { EmbeddingService } from './embedding.service';
import { MemoryService } from './memory.service';

/** 세션 간 기억(§4-A) — 프로필·에피소드·pgvector 의미검색. */
@Module({
  imports: [TypeOrmModule.forFeature([UserProfileFact, EpisodicMemory, Diary])],
  providers: [EmbeddingService, MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
