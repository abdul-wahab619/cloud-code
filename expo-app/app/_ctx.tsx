import { createContext, useContext } from 'react';
import { Slot } from 'expo-router';

const Context = createContext(null);

export function useExpoContext() {
  return useContext(Context);
}

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <Context.Provider value={null}>
      <Slot />
      {children}
    </Context.Provider>
  );
}

export default Context;
