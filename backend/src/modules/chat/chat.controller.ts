import type { Request, Response, NextFunction } from 'express';
import { ChatService } from './chat.service';
import type { ListConversationsQuery, ListMessagesQuery } from './chat.schema';

export class ChatController {
  private readonly chatService: ChatService;

  constructor(chatService?: ChatService) {
    this.chatService = chatService ?? new ChatService();
  }

  public createConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const conversation = await this.chatService.createConversation(userId, req.body);
      res.status(201).json({
        success: true,
        data: conversation,
      });
    } catch (err) {
      next(err);
    }
  };

  public listConversations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as ListConversationsQuery;
      const result = await this.chatService.listConversations(userId, query);
      res.status(200).json({
        success: true,
        data: result.conversations,
        meta: {
          total: result.total,
          limit: Number(req.query.limit) || 30,
          offset: Number(req.query.offset) || 0,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const conversation = await this.chatService.getConversation(userId, String(req.params.id));
      res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (err) {
      next(err);
    }
  };

  public updateConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const conversation = await this.chatService.updateConversation(
        userId,
        String(req.params.id),
        req.body
      );
      res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (err) {
      next(err);
    }
  };

  public deleteConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      await this.chatService.deleteConversation(userId, String(req.params.id));
      res.status(200).json({
        success: true,
        data: { message: 'Conversation deleted successfully.' },
      });
    } catch (err) {
      next(err);
    }
  };

  public listMessages = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as ListMessagesQuery;
      const messages = await this.chatService.listMessages(
        userId,
        String(req.params.id),
        query
      );
      res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (err) {
      next(err);
    }
  };

  public sendMessage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const result = await this.chatService.sendMessage(
        userId,
        String(req.params.id),
        req.body
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Server-Sent Events (SSE) streaming endpoint.
   */
  public streamMessage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user!.id;
    const conversationId = String(req.params.id);
    const abortController = new AbortController();

    // Catch client cancellation / disconnect
    req.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    let headersSent = false;

    try {
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();
      headersSent = true;

      const result = await this.chatService.streamMessage(
        userId,
        conversationId,
        req.body,
        (chunk: string) => {
          if (!res.writableEnded) {
            res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
          }
        },
        abortController.signal
      );

      if (!res.writableEnded) {
        res.write(
          `event: done\ndata: ${JSON.stringify({
            userMessage: result.userMessage,
            assistantMessage: result.assistantMessage,
          })}\n\n`
        );
        res.end();
      }
    } catch (err: unknown) {
      const error = err as Error & {
        code?: string;
        category?: string;
        statusCode?: number;
        details?: { retryable?: boolean };
      };
      if (headersSent) {
        if (!res.writableEnded) {
          res.write(
            `event: error\ndata: ${JSON.stringify({
              code: error.code || error.category || 'CHAT_STREAM_ERROR',
              message: error.message || 'Stream generation failed.',
              retryable: !!error.details?.retryable,
            })}\n\n`
          );
          res.end();
        }
      } else {
        next(err);
      }
    }
  };

  public getPreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const prefs = await this.chatService.getPreferences(userId);
      res.status(200).json({
        success: true,
        data: prefs,
      });
    } catch (err) {
      next(err);
    }
  };

  public updatePreferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const updated = await this.chatService.updatePreferences(userId, req.body);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };
}
