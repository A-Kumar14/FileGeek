import React, { createContext, useState, useContext, useEffect } from 'react';

const ModelContext = createContext(null);

export function useModelContext() {
  return useContext(ModelContext);
}

export function ModelProvider({ children }) {
  const [selectedModel, setSelectedModel] = useState(() => {
    // null means "use backend default" — avoids sending a mismatched model name
    const stored = localStorage.getItem('filegeek-selected-model');
    // Migrate old "grok-3" default so existing users don't get stuck
    if (!stored || stored === 'grok-3') return null;
    return stored;
  });

  // Save to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('filegeek-selected-model', selectedModel);
  }, [selectedModel]);

  // Get provider from model name
  const getProvider = (modelId) => {
    return 'poe'; // all models route through Poe
  };

  const provider = getProvider(selectedModel);

  return (
    <ModelContext.Provider
      value={{
        selectedModel,
        setSelectedModel,
        provider,
      }}
    >
      {children}
    </ModelContext.Provider>
  );
}
