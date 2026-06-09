import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notebook, Purchase } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { NotebookModule } from '../notebook/notebook.module';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';
import { ReceiptVerifierService } from './receipt-verifier.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Purchase, Notebook]),
    AuthModule, // JwtAuthGuard
    NotebookModule, // mintFromProduct / getNotebook
  ],
  controllers: [PurchaseController],
  providers: [PurchaseService, ReceiptVerifierService],
})
export class PurchaseModule {}
