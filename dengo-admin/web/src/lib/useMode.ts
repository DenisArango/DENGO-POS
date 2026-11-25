import { createContext, useContext } from 'react'

export const ModeContext = createContext<'real' | 'simulate'>('real')
export const useMode = () => useContext(ModeContext)
