import type { TelegramBotCore } from './bot.js';
import type { SessionManager } from '../session/manager.js';
import type { SessionInfo } from '../types/session.js';
import { saveSessions } from '../session/persistence.js';
import { logger } from '../utils/logger.js';

/**
 * Manages the mapping between hub sessions and Telegram forum topics.
 *
 * Each session gets its own forum topic. The topic ID is persisted in
 * sessions.yaml via the `topicId` field on SessionInfo.
 *
 * Topic naming convention: `[InstanceName] session-name`
 */
export class TopicManager {
  constructor(
    private bot: TelegramBotCore,
    private sessionManager: SessionManager,
    private instanceName: string,
  ) {}

  /** Update the instance name prefix for topic names. */
  setInstanceName(name: string): void {
    this.instanceName = name;
  }

  /**
   * Ensure a session has a valid forum topic.
   * - If topicId exists: probe it by sending a "reconnected" message
   * - If probe fails or no topicId: create a new topic
   * Returns the topic ID (either existing or newly created).
   */
  async ensureTopic(session: SessionInfo): Promise<number | null> {
    if (session.topicId) {
      const alive = await this.probeTopic(session.topicId);
      if (alive) {
        logger.info(`[TopicManager] Topic ${session.topicId} alive for session ${session.id}`);
        return session.topicId;
      }
      logger.warn(`[TopicManager] Topic ${session.topicId} dead for session ${session.id}, recreating`);
    }

    return this.createTopicForSession(session);
  }

  /**
   * Ensure all current sessions have topics.
   * Called on bot startup after sessions are restored.
   */
  async ensureAllTopics(): Promise<void> {
    const sessions = this.sessionManager.getAllSessions();
    for (const session of sessions) {
      const topicId = await this.ensureTopic(session);
      if (topicId != null && topicId !== session.topicId) {
        this.updateSessionTopicId(session.id, topicId);
      }
    }
  }

  /**
   * Create a new forum topic for a session.
   * Updates the session's topicId in SessionManager.
   */
  async createTopicForSession(session: SessionInfo): Promise<number | null> {
    const topicName = this.formatTopicName(session.name);
    const topic = await this.bot.createForumTopic(topicName);
    if (!topic) {
      logger.error(`[TopicManager] Failed to create topic for session ${session.id}`);
      return null;
    }

    const topicId = topic.message_thread_id;
    this.updateSessionTopicId(session.id, topicId);
    logger.info(`[TopicManager] Created topic ${topicId} for session ${session.id}: "${topicName}"`);

    await this.bot.sendToTopic(
      topicId,
      `🖥️ Session: ${session.name}\nCLI: ${session.cliType}\nDir: ${session.workingDir ?? 'unknown'}`,
    );

    return topicId;
  }

  /**
   * Delete a session's topic permanently from Telegram.
   * Called when a session is removed from the hub.
   */
  async closeSessionTopic(session: SessionInfo): Promise<void> {
    if (!session.topicId) return;

    await this.bot.deleteForumTopic(session.topicId);
    logger.info(`[TopicManager] Deleted topic ${session.topicId} for session ${session.id}`);
  }

  /**
   * Rename a session's topic to match the new session name.
   */
  async renameSessionTopic(session: SessionInfo): Promise<void> {
    if (!session.topicId) return;
    const newName = this.formatTopicName(session.name);
    await this.bot.editForumTopic(session.topicId, newName);
  }

  /**
   * Get the topic ID for a session, or null if not mapped.
   */
  getTopicId(sessionId: string): number | null {
    const session = this.sessionManager.getSession(sessionId);
    return session?.topicId ?? null;
  }

  /**
   * Find the session that maps to a given topic ID.
   * Used to route incoming Telegram messages to the correct session.
   */
  findSessionByTopicId(topicId: number): SessionInfo | null {
    const sessions = this.sessionManager.getAllSessions();
    return sessions.find(s => s.topicId === topicId) ?? null;
  }

  /** Return the session ID mapped to a Telegram topic, if any. */
  getSessionIdByTopic(topicId: number): string | null {
    return this.findSessionByTopicId(topicId)?.id ?? null;
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Probe whether a topic is still alive by attempting to send a message.
   * Telegram has no list/get endpoint for forum topics, so sending a
   * message is the only reliable way to verify a topic still exists.
   */
  private async probeTopic(topicId: number): Promise<boolean> {
    const result = await this.bot.sendToTopic(topicId, '🔄 Hub reconnected.');
    return result !== null;
  }

  /** Format a topic name with the instance prefix. */
  private formatTopicName(sessionName: string): string {
    return `[${this.instanceName}] ${sessionName}`;
  }

  /**
   * Persist a topicId update for a session.
   *
   * SessionManager.getSession() returns the live Map reference, so mutating
   * topicId on it updates the in-memory store. We then call saveSessions()
   * directly to flush to disk without needing a dedicated SessionManager method.
   */
  private updateSessionTopicId(sessionId: string, topicId: number): void {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;
    session.topicId = topicId;
    saveSessions(this.sessionManager.getAllSessions());
  }
}
