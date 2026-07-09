import dotenv from 'dotenv';
dotenv.config();
import app from './app';
import { connectDatabase } from './config/database';
import { logger } from './config/logger';

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDatabase();
    const server = app.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT}`));
    server.timeout = 0;
    server.requestTimeout = 0;
  } catch (error:unknown) {
    if(error instanceof Error)
    logger.error(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

startServer();
