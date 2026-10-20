// src/demo/vacio.tsx
// Stub del build NORMAL: no incluye nada del demo (ni textos, ni contacto,
// ni consultas al backend). Ver vite.config.js.
import { ReactNode } from 'react';

export const DemoProvider = ({ children }: { children: ReactNode }) => <>{children}</>;

export const DemoGate = ({ children }: { children: ReactNode }) => <>{children}</>;

export const DemoBadge = () => null;
