import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './ai/ai.module';
import { ConversationModule } from './conversation/conversation.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { UPLOAD_DIR } from './conversation/conversation.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: UPLOAD_DIR,
      serveRoot: '/uploads',
    }),
    DatabaseModule,
    AiModule,
    UserModule,
    AuthModule,
    ConversationModule,
  ],
})
export class AppModule {}
