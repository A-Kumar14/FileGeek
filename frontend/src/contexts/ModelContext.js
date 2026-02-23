import React, { createContext, useState, useContext, useEffect } from 'react';

const ModelContext = createContext(null);

export function useModelContext() {
  return useContext(ModelContext);
}

export function ModelProvider({ children }) {
  const [selectedModel, setSelectedModel] = useState(() => {
    // Load from localStorage or default to grok-3
    return localStorage.getItem('filegeek-selected-model') || 'grok-3';
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
