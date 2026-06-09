import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, Diary, Notebook, Product, Slot } from '../entities';
import { AuthModule } from '../auth/auth.module';
import {
  NotebookController,
  ProductController,
} from './notebook.controller';
import { NotebookService } from './notebook.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notebook, Slot, Product, Conversation, Diary]),
    AuthModule, // JwtAuthGuard 사용
  ],
  controllers: [ProductController, NotebookController],
  providers: [NotebookService],
  exports: [NotebookService],
})
export class NotebookModule {}
