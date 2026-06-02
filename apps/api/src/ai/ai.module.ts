import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { LlmTracingService } from './llm-tracing.service';
import { WeatherService } from './weather.service';

@Global()
@Module({
  providers: [AiService, LlmTracingService, WeatherService],
  exports: [AiService, LlmTracingService, WeatherService],
})
export class AiModule {}
