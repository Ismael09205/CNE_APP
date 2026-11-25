// Votos por candidatura (ADR-17): barras animadas con Victory Native XL, una por lista y en su
// color (RNF-07, D-18). Debajo, la misma información en texto grande para leerla sin la gráfica
// (personas mayores y lectores de pantalla, RNF-05).
import { useFont } from '@shopify/react-native-skia';
import { Text, View } from 'react-native';
import { Bar, CartesianChart } from 'victory-native';

import { porcentajeTexto, proporcion, type TotalCandidatura } from '@/domain/entities/resultados';

import { LogoLista } from './logo-lista';
import { useCSSVariable } from 'uniwind';

const FUENTE = require('@expo-google-fonts/poppins/600SemiBold/Poppins_600SemiBold.ttf');

export function GraficoVotos({ totales }: { totales: readonly TotalCandidatura[] }) {
  const fuente = useFont(FUENTE, 14);
  const colorTexto = String(useCSSVariable('--color-texto-suave') ?? '#4b5563');
  const colorLinea = String(useCSSVariable('--color-borde') ?? '#d5dde0');
  const total = totales.reduce((s, t) => s + t.votos, 0);
  const datos = totales.map((t) => ({ lista: t.lista, votos: t.votos }));
  const maximo = Math.max(10, ...totales.map((t) => t.votos));

  return (
    <View className="my-2 gap-3 rounded-2xl bg-tarjeta p-4 shadow-tarjeta">
      {/* La gráfica es decorativa para los lectores de pantalla: la lista de abajo lleva los datos. */}
      <View className="h-56" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {datos.length > 0 ? (
          <CartesianChart
            data={datos}
            xKey="lista"
            yKeys={['votos']}
            domain={{ y: [0, Math.ceil(maximo * 1.15)] }}
            domainPadding={{ left: 36, right: 36, top: 8 }}
            xAxis={{ font: fuente, labelColor: colorTexto, lineWidth: 0, formatXLabel: (l) => `L. ${l}` }}
            yAxis={[{ font: fuente, labelColor: colorTexto, lineColor: colorLinea, tickCount: 4, formatYLabel: (v) => String(Math.round(Number(v))) }]}>
            {({ points, chartBounds }) => (
              <>
                {points.votos.map((p, i) => (
                  <Bar
                    key={datos[i].lista}
                    points={[p]}
                    chartBounds={chartBounds}
                    barCount={points.votos.length}
                    innerPadding={0.35}
                    color={totales[i].color}
                    roundedCorners={{ topLeft: 8, topRight: 8 }}
                    animate={{ type: 'spring' }}
                    labels={{ position: 'top', font: fuente, color: colorTexto }}
                  />
                ))}
              </>
            )}
          </CartesianChart>
        ) : null}
      </View>

      {totales.map((t, i) => (
        <View
          key={t.candidaturaId}
          className={`gap-2 pt-3 ${i > 0 ? 'border-t border-borde' : ''}`}
          accessible
          accessibilityLabel={`Puesto ${i + 1}. Lista ${t.lista}, ${t.organizacionPolitica}, ${t.candidato}: ${t.votos} votos, ${porcentajeTexto(t.votos, total)}`}>
          <View className="flex-row items-center justify-between gap-3">
            <LogoLista lista={t.lista} color={t.color} />
            <View className="items-end">
              <Text className="font-negrita text-xl text-texto">{t.votos.toLocaleString('es-EC')}</Text>
              <Text className="font-medio text-base text-texto-suave">{porcentajeTexto(t.votos, total)}</Text>
            </View>
          </View>
          <View>
            <Text className="font-seminegrita text-base text-texto">
              Lista {t.lista} · {t.organizacionPolitica}
            </Text>
            <Text className="font-regular text-base text-texto-suave">{t.candidato}</Text>
          </View>
          <View className="h-2.5 overflow-hidden rounded-full bg-pista">
            {/* Ancho y color son datos (votos y color de la lista), por eso van en style. */}
            <View className="h-full rounded-full" style={{ width: `${proporcion(t.votos, total) * 100}%`, backgroundColor: t.color }} />
          </View>
        </View>
      ))}
    </View>
  );
}
