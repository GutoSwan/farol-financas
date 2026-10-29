import { describe,it,expect } from 'vitest'
import { parseBRLToCents,formatBRL } from '../src/domain/value-objects/Money'
describe('Money',()=>{it('converte centavos corretamente',()=>{expect(parseBRLToCents('1.234,56')).toBe(123456);expect(parseBRLToCents('0,09')).toBe(9);expect(formatBRL(21050)).toContain('210,50')});it('rejeita formatos inválidos',()=>{expect(()=>parseBRLToCents('-12')).toThrow();expect(()=>parseBRLToCents('1,234')).toThrow()})})
