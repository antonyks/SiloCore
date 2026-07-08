export interface AdminAnalyticsSummary {
  providers: {
    total: number;
    active: number;
    disabled: number;
  };
  users: {
    total: number;
    active: number;
    banned: number;
    deleted: number;
    review: number;
  };
}

export interface AdminSystemStatus {
  backend: {
    status: 'online';
  };
  database: {
    status: 'online' | 'error';
    errorMessage?: string;
  };
  inference: {
    status: 'online' | 'review' | 'offline';
    providers: number;
    errors: number;
    skipped: number;
  };
}
