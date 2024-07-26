export const config = {
  // server configuration
  host: String(process.env.HOST || 'localhost'),
  port: Number(process.env.PORT || 3000),

  // redis configuration
  redisUrl: String(process.env.REDIS_URL || 'localhost:6379'),

  logLevel: String(process.env.LOG_LEVEL || 'info'),
};
