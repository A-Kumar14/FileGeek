import React, { createContext, useState, useContext, useCallback, useMemo } from 'react';

const PersonaContext = createContext(null);

export function usePersona() {
  return useContext(PersonaContext);
}

// Persona definitions mirrored from backend — kept in sync manually.
// The backend is the source of truth; this is for instant UI feedback.
const PERSONAS = {
  academic: {
    id: 'academic',
    label: 'Academic Mentor',
    greeting: "Hello! I'm your Academic Mentor. Upload a document and let's explore it together.",
    voice: 'alloy',
    bg: 'var(--accent)',
    bgDark: 'var(--accent)',
  },
  professional: {
    id: 'professional',
    label: 'Professional Analyst',
    greeting: 'Good day. I\'m ready to analyze your documents with precision. Upload a file to begin.',
    voice: 'onyx',
    bg: 'var(--accent)',
    bgDark: 'var(--accent)',
  },
  casual: {
    id: 'casual',
    label: 'Casual Helper',
    greeting: "Hey there! Drop a file and ask me anything — I'll keep it simple.",
    voice: 'shimmer',
    bg: 'var(--accent)',
    bgDark: 'var(--accent)',
  },
  einstein: {
    id: 'einstein',
    label: 'Albert Einstein',
    greeting: 'Ah, willkommen! As I always say, the important thing is not to stop questioning. Show me your document!',
    voice: 'echo',
    bg: 'var(--accent)',
    bgDark: 'var(--accent)',
  },
  genz_tutor: {
    id: 'genz_tutor',
    label: 'Gen-Z Tutor',
    greeting: "yooo welcome to FileGeek!! drop ur file and let's get this bread fr fr",
    voice: 'nova',
    bg: 'var(--accent)',
    bgDark: 'var(--accent)',
  },
  sherlock: {
    id: 'sherlock',
    label: 'Sherlock Holmes',
    greeting: 'The game is afoot! Present your document, and I shall deduce its every secret.',
    voice: 'fable',
    bg: 'var(--accent)',
    bgDark: 'var(--accent)',
  },
};

export const PERSONA_LIST = Object.values(PERSONAS);

export function PersonaProvider({ children }) {
  const [personaId, setPersonaId] = useState(
    () => localStorage.getItem('filegeek-persona') || 'academic'
  );

  const persona = useMemo(() => PERSONAS[personaId] || PERSONAS.academic, [personaId]);

  const selectPersona = useCallback((id) => {
    setPersonaId(id);
    localStorage.setItem('filegeek-persona', id);
  }, []);

  return (
    <PersonaContext.Provider value={{ persona, personaId, selectPersona, personas: PERSONA_LIST }}>
      {children}
    </PersonaContext.Provider>
  );
}
