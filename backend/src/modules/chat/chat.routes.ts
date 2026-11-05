import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { ChatController } from './chat.controller';
import {
  createConversationSchema,
  conversationIdParamSchema,
  updateConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  sendMessageSchema,
  updateChatPreferencesSchema,
} from './chat.schema';

export const chatRouter = Router();
const controller = new ChatController();

// Apply authentication to all chat endpoints
chatRouter.use(authenticate);

// Preferences routes
chatRouter.get('/preferences', controller.getPreferences);
chatRouter.patch('/preferences', validate(updateChatPreferencesSchema), controller.updatePreferences);

// Conversation management routes
chatRouter.post('/conversations', validate(createConversationSchema), controller.createConversation);
chatRouter.get('/conversations', validate(listConversationsQuerySchema), controller.listConversations);
chatRouter.get('/conversations/:id', validate(conversationIdParamSchema), controller.getConversation);
chatRouter.patch('/conversations/:id', validate(updateConversationSchema), controller.updateConversation);
chatRouter.delete('/conversations/:id', validate(conversationIdParamSchema), controller.deleteConversation);

// Messages routes
chatRouter.get('/conversations/:id/messages', validate(listMessagesQuerySchema), controller.listMessages);
chatRouter.post('/conversations/:id/messages', validate(sendMessageSchema), controller.sendMessage);
chatRouter.post('/conversations/:id/messages/stream', validate(sendMessageSchema), controller.streamMessage);
