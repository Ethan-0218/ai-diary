import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmUsage, LlmCallTrace } from '../entities';
import { AiService } from './ai.service';
import { LlmTracingService } from './llm-tracing.service';
import { WeatherService } from './weather.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LlmUsage, LlmCallTrace])],
  providers: [AiService, LlmTracingService, WeatherService],
  exports: [AiService, LlmTracingService, WeatherService],
})
export class AiModule {}
