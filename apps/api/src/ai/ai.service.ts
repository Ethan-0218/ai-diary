import { Injectable } from '@nestjs/common';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { getModelOption } from '@ai-diary/shared';

/**
 * 모델 id → vercel ai SDK provider 매핑.
 * shared의 MODEL_OPTIONS에 provider가 정의돼 있으면 그걸 쓰고,
 * 없으면 id 접두사로 추정한다. (naming-studio resolveModel 패턴)
 */
@Injectable()
export class AiService {
  resolveModel(modelId: string): LanguageModel {
    const opt = getModelOption(modelId);
    const provider = opt?.provider ?? this.guessProvider(modelId);
    switch (provider) {
      case 'openai':
        return openai(modelId);
      case 'google':
        return google(modelId);
      case 'anthropic':
      default:
        return anthropic(modelId);
    }
  }

  private guessProvider(id: string): 'anthropic' | 'openai' | 'google' {
    if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3'))
      return 'openai';
    if (id.startsWith('gemini')) return 'google';
    return 'anthropic';
  }
}
