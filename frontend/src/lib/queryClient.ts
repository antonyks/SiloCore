import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import {ErrorHandler} from './errorHandler';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      
      ErrorHandler.handleApiError(error);
      
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: unknown) => {
      ErrorHandler.handleApiError(error);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
