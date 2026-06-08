import { User } from './user.entity';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { Attachment } from './attachment.entity';
import { Diary } from './diary.entity';
import { Feedback } from './feedback.entity';
import { LlmUsage } from './llm-usage.entity';
import { LlmCallTrace } from './llm-call-trace.entity';
import { UserProfileFact } from './user-profile-fact.entity';
import { EpisodicMemory } from './episodic-memory.entity';

export {
  User,
  Conversation,
  Message,
  Attachment,
  Diary,
  Feedback,
  LlmUsage,
  LlmCallTrace,
  UserProfileFact,
  EpisodicMemory,
};

/** TypeOrmModule 등록용 엔티티 목록 */
export const ENTITIES = [
  User,
  Conversation,
  Message,
  Attachment,
  Diary,
  Feedback,
  LlmUsage,
  LlmCallTrace,
  UserProfileFact,
  EpisodicMemory,
];
