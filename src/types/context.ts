export interface McpContext {
  userId: string;
  scopeType: 'user' | 'team';
  teamId?: string;
  isAdmin?: boolean;
}
