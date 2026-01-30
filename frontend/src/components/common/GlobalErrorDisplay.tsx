import { useState } from 'react';

interface GlobalErrorDisplayProps {
  error?: Error;
  onReset?: () => void;
}

const GlobalErrorDisplay: React.FC<GlobalErrorDisplayProps> = ({ 
  error, 
  onReset 
}) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!error) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 border border-gray-100">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
             <span className="text-red-600 text-2xl font-bold">!</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">Application Error</h3>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
        
        {showDetails && (
          <div className="bg-gray-50 p-4 rounded-lg mb-6 text-xs font-mono border border-gray-200">
            <pre className="overflow-auto max-h-40 whitespace-pre-wrap text-gray-700">
              {error.stack || 'No stack trace available'}
            </pre>
          </div>
        )}
        
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center w-full gap-3">
            {onReset && (
              <button
                onClick={onReset}
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            )}
            
            <button
              onClick={() => window.location.reload()}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors"
            >
              Reload Page
            </button>
          </div>

          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-gray-400 hover:text-gray-600 underline decoration-dotted"
          >
            {showDetails ? 'Hide' : 'Show'} technical details
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalErrorDisplay;