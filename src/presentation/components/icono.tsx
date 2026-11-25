// Íconos de línea (lucide) con los colores del tema de global.css: sin hexadecimales en el código.
import type { LucideIcon } from '@/presentation/components/iconos';
import { useCSSVariable } from 'uniwind';

export type TonoIcono = 'primario' | 'sobre-primario' | 'texto' | 'texto-suave' | 'error' | 'exito' | 'info';

export function Icono({
  icono: Componente,
  tono = 'texto',
  tamano = 24,
  grosor = 2,
}: {
  icono: LucideIcon;
  tono?: TonoIcono;
  tamano?: number;
  grosor?: number;
}) {
  const color = useCSSVariable(`--color-${tono}`);
  return <Componente size={tamano} color={typeof color === 'string' ? color : undefined} strokeWidth={grosor} />;
}
