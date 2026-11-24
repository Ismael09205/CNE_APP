import { confirmarActa, MENSAJES_EVIDENCIA, type DatosConfirmacionActa } from '../entities/acta';
import { MENSAJES_ACTA, validarResultadosActa, type OpcionesValidacionActa, type ResultadosActaInput } from '../rules/acta.rules';
import { crearActaSchema } from '../schemas/acta.schema';

const LISTAS = ['l1', 'l2', 'l3', 'l4', 'l5'];
const opciones: OpcionesValidacionActa = { candidaturaIds: LISTAS };

const actaValida = (cambios: Partial<ResultadosActaInput> = {}): ResultadosActaInput => ({
  votosNulos: 5,
  votosBlancos: 3,
  totalSufragantes: 158,
  votos: [
    { candidaturaId: 'l1', votos: 50 },
    { candidaturaId: 'l2', votos: 40 },
    { candidaturaId: 'l3', votos: 30 },
    { candidaturaId: 'l4', votos: 20 },
    { candidaturaId: 'l5', votos: 10 },
  ],
  ...cambios,
});

const codigos = (a: ResultadosActaInput, o = opciones) => validarResultadosActa(a, o).map((v) => v.codigo);

describe('validarResultadosActa', () => {
  it('acepta un acta que cuadra (150 + 5 nulos + 3 blancos = 158)', () => {
    expect(validarResultadosActa(actaValida(), opciones)).toEqual([]);
  });

  it('acepta un acta en cero', () => {
    const cero = actaValida({ votosNulos: 0, votosBlancos: 0, totalSufragantes: 0, votos: LISTAS.map((id) => ({ candidaturaId: id, votos: 0 })) });
    expect(codigos(cero)).toEqual([]);
  });

  it('rechaza negativos y decimales, señalando el campo', () => {
    const acta = actaValida({ votosNulos: -1, votosBlancos: 2.5 });
    const v = validarResultadosActa(acta, opciones);
    expect(v).toEqual([
      { campo: ['votosNulos'], codigo: 'entero', mensaje: MENSAJES_ACTA.entero },
      { campo: ['votosBlancos'], codigo: 'entero', mensaje: MENSAJES_ACTA.entero },
    ]);
  });

  it('rechaza votos de organización no enteros en su campo', () => {
    const acta = actaValida();
    const votos = acta.votos.map((v, i) => (i === 2 ? { ...v, votos: Number.NaN } : v));
    expect(validarResultadosActa({ ...acta, votos }, opciones)[0].campo).toEqual(['votos', 2, 'votos']);
  });

  it('rechaza cuando la suma no cuadra con el total', () => {
    const v = validarResultadosActa(actaValida({ totalSufragantes: 160 }), opciones);
    expect(v).toEqual([
      { campo: ['totalSufragantes'], codigo: 'suma_no_cuadra', mensaje: MENSAJES_ACTA.sumaNoCuadra(158, 160) },
    ]);
  });

  it('rechaza votos de una organización mayores que el total', () => {
    const acta = actaValida({
      votosNulos: 0,
      votosBlancos: 0,
      totalSufragantes: 10,
      votos: [{ candidaturaId: 'l1', votos: 11 }, ...LISTAS.slice(1).map((id) => ({ candidaturaId: id, votos: 0 }))],
    });
    const v = validarResultadosActa(acta, opciones);
    expect(v.map((x) => [x.campo, x.codigo])).toEqual([
      [['votos', 0, 'votos'], 'votos_mayor_que_total'],
      [['totalSufragantes'], 'suma_no_cuadra'],
    ]);
  });

  it('valida el máximo de sufragantes solo si la mesa lo tiene', () => {
    expect(codigos(actaValida(), { ...opciones, maxSufragantes: 150 })).toEqual(['total_mayor_que_maximo']);
    expect(codigos(actaValida(), { ...opciones, maxSufragantes: 158 })).toEqual([]);
    expect(codigos(actaValida(), { ...opciones, maxSufragantes: null })).toEqual([]);
  });

  it('exige todas las candidaturas de la dignidad, sin repetir ni desconocidas', () => {
    const base = actaValida();
    expect(codigos({ ...base, votos: base.votos.slice(0, 4) })).toContain('candidatura_faltante');
    expect(codigos({ ...base, votos: [...base.votos.slice(0, 4), { candidaturaId: 'l1', votos: 10 }] })).toEqual([
      'candidatura_repetida',
      'candidatura_faltante',
    ]);
    expect(codigos({ ...base, votos: [...base.votos.slice(0, 4), { candidaturaId: 'x', votos: 10 }] })).toEqual([
      'candidatura_desconocida',
      'candidatura_faltante',
    ]);
  });
});

describe('crearActaSchema (Zod + superRefine)', () => {
  const schema = crearActaSchema(opciones);

  it('acepta el acta válida', () => {
    expect(schema.safeParse(actaValida()).success).toBe(true);
  });

  it('entrega los errores del dominio con su ruta para el formulario', () => {
    const r = schema.safeParse(actaValida({ totalSufragantes: 100 }));
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => [i.path, i.message])).toEqual([
      [['totalSufragantes'], MENSAJES_ACTA.sumaNoCuadra(158, 100)],
    ]);
  });

  it('rechaza campos que no son números (campo vacío en el formulario)', () => {
    const r = schema.safeParse({ ...actaValida(), votosNulos: Number.NaN });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ['votosNulos'], message: MENSAJES_ACTA.entero });
  });
});

describe('confirmarActa', () => {
  const datos = (cambios: Partial<DatosConfirmacionActa> = {}): DatosConfirmacionActa => ({
    ...actaValida(),
    id: 'acta-1',
    mesaId: 'mesa-1',
    dignidad: 'alcaldia',
    veedorId: 'veedor-1',
    confirmadaEn: new Date('2027-02-16T18:00:00Z'),
    evidencia: {
      fotoPath: 'file:///docs/actas/acta-1.jpg',
      lat: 0.3,
      lng: -78.26,
      precisionM: 8,
      ubicacionSimulada: false,
      capturadaEn: new Date('2027-02-16T17:59:00Z'),
    },
    ...cambios,
  });

  it('crea un acta enviada e inmutable', () => {
    const r = confirmarActa(datos(), opciones);
    if (!r.ok) throw new Error('debía ser válida');
    expect(r.value.estado).toBe('enviada');
    expect(Object.isFrozen(r.value)).toBe(true);
    expect(Object.isFrozen(r.value.votos)).toBe(true);
    expect(Object.isFrozen(r.value.votos[0])).toBe(true);
    expect(Object.isFrozen(r.value.evidencia)).toBe(true);
    // En modo no estricto la asignación se ignora; en modo estricto lanza TypeError.
    try {
      (r.value as { votosNulos: number }).votosNulos = 99;
    } catch {}
    expect(r.value.votosNulos).toBe(5);
  });

  it('exige foto y ubicación (RF-13)', () => {
    const r = confirmarActa(
      datos({ evidencia: { ...datos().evidencia, fotoPath: ' ', lat: Number.NaN } }),
      opciones,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.map((v) => v.mensaje)).toEqual([MENSAJES_EVIDENCIA.foto, MENSAJES_EVIDENCIA.ubicacion]);
    }
  });

  it('registra la ubicación simulada sin rechazar el acta', () => {
    const r = confirmarActa(datos({ evidencia: { ...datos().evidencia, ubicacionSimulada: true } }), opciones);
    expect(r.ok && r.value.evidencia.ubicacionSimulada).toBe(true);
  });

  it('no confirma un acta que no cuadra', () => {
    expect(confirmarActa(datos({ votosBlancos: 4 }), opciones).ok).toBe(false);
  });
});
