import { MENSAJES_CEDULA, validarCedula } from '../rules/cedula.mod10';
import { cedulaSchema } from '../schemas/perfil.schema';
import { crearCedula } from '../value-objects/cedula';

describe('validarCedula (módulo 10)', () => {
  it.each(['1710034065', '1000000008', '0926687856', '1003123450'])('acepta %s', (c) => {
    expect(validarCedula(c)).toEqual({ valida: true });
  });

  it.each([
    ['123', 'formato'],
    ['17100340650', 'formato'],
    ['17100340a5', 'formato'],
    ['', 'formato'],
    ['0010034065', 'provincia'], // 00
    ['2510034065', 'provincia'], // 25
    ['3010034065', 'provincia'], // 30 (exterior) no se acepta: decisión del equipo
    ['1760034065', 'tercer_digito'], // 3er dígito 6
    ['1790034065', 'tercer_digito'], // 3er dígito 9 (RUC sociedad)
    ['1710034064', 'digito_verificador'],
    ['1710034066', 'digito_verificador'],
  ] as const)('rechaza %s por %s', (c, motivo) => {
    expect(validarCedula(c)).toEqual({ valida: false, motivo });
  });

  it('acepta los límites de provincia 01 y 24', () => {
    expect(validarCedula('0100000009').valida).toBe(true);
    expect(validarCedula('2400000002').valida).toBe(true);
  });
});

describe('crearCedula (value object)', () => {
  it('recorta espacios y crea la cédula', () => {
    const r = crearCedula('  1710034065 ');
    expect(r).toEqual({ ok: true, value: '1710034065' });
  });

  it('devuelve el motivo si es inválida', () => {
    expect(crearCedula('1710034064')).toEqual({ ok: false, error: 'digito_verificador' });
  });
});

describe('cedulaSchema (Zod)', () => {
  it('muestra el mensaje en español del motivo', () => {
    const r = cedulaSchema.safeParse('2510034065');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe(MENSAJES_CEDULA.provincia);
  });
});
