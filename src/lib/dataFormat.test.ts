import { describe, expect, it } from 'vitest'
import {
  dataFormatProblem,
  isSupportedDataFormat,
  MSG_DATA_FORMAT_INVALID,
  MSG_DATA_FORMAT_NEWER,
  readDataFormat,
  SUPPORTED_DATA_FORMAT,
} from './dataFormat'

describe('readDataFormat', () => {
  it('behandelt fehlende Datei und fehlendes Feld als Format 1', () => {
    expect(readDataFormat(undefined)).toEqual({ valid: true, format: 1 })
    expect(readDataFormat({})).toEqual({ valid: true, format: 1 })
    expect(isSupportedDataFormat(undefined)).toBe(true)
    expect(SUPPORTED_DATA_FORMAT).toBe(1)
  })

  it('unterstützt {format:1}, nicht {format:2}', () => {
    expect(isSupportedDataFormat({ format: 1 })).toBe(true)
    expect(isSupportedDataFormat({ format: 2 })).toBe(false)
    expect(readDataFormat({ format: 2 })).toEqual({ valid: true, format: 2 })
    expect(dataFormatProblem({ format: 2 })).toBe(MSG_DATA_FORMAT_NEWER)
  })

  it.each([{ format: '1' }, { format: 0 }, { format: 1.5 }, { format: null }, null, 5, 'x', []])(
    'hält %j für ungültig',
    (json) => {
      expect(readDataFormat(json)).toEqual({ valid: false })
      expect(isSupportedDataFormat(json)).toBe(false)
      expect(dataFormatProblem(json)).toBe(MSG_DATA_FORMAT_INVALID)
    },
  )

  it('meldet bei unterstütztem Format kein Problem und ignoriert unbekannte Felder', () => {
    expect(dataFormatProblem({ format: 1, extra: true })).toBeNull()
    expect(dataFormatProblem(undefined)).toBeNull()
  })
})
