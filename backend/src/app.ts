import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { json, urlencoded } from 'express';
import { router as moduleRouter, createModuleRouter } from './modules';
import type { ApiComposition } from './composition/api';
import { notFoundHandler, errorHandler, requestIdMiddleware } from './middleware';

/** Default export retains legacy service instances; production passes its composition. */
export function createApp(composition?: ApiComposition) {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cors());
  app.use(json());
  app.use(urlencoded({ extended: true }));
  app.use(morgan('dev'));

  app.use('/api', composition ? createModuleRouter(composition) : moduleRouter);


  app.get('/health', (_, res) => res.json({ status: 'OK', service: 'backend' }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp();
