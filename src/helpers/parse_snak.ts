import { wikibaseTimeToEpochTime, wikibaseTimeToISOString, wikibaseTimeToSimpleDay } from './time.js'
import type { TimeInputValue } from './time.js'
import type { DataType } from '../types/claim.js'
import type { SimplifySnakOptions } from '../types/simplify_claims.js'
import type { SnakDataValue } from '../types/snakvalue.js'

const simple = datavalue => datavalue.value

const monolingualtext = (datavalue, options) => {
  return options.keepRichValues ? datavalue.value : datavalue.value.text
}

const entity = (datavalue, options) => prefixedId(datavalue, options.entityPrefix)

const entityLetter = {
  item: 'Q',
  lexeme: 'L',
  property: 'P',
} as const

const prefixedId = (datavalue, prefix) => {
  const { value } = datavalue
  const id = value.id || entityLetter[value['entity-type']] + value['numeric-id']
  return typeof prefix === 'string' ? `${prefix}:${id}` : id
}

const quantity = (datavalue, options) => {
  const { value } = datavalue
  const amount = parseFloat(value.amount)
  if (options.keepRichValues) {
    const richValue: any = {
      amount: parseFloat(value.amount),
      // ex: http://www.wikidata.org/entity/
      unit: value.unit.replace(/^https?:\/\/.*\/entity\//, ''),
    }
    if (value.upperBound != null) richValue.upperBound = parseFloat(value.upperBound)
    if (value.lowerBound != null) richValue.lowerBound = parseFloat(value.lowerBound)
    return richValue
  } else {
    return amount
  }
}

const coordinate = (datavalue, options) => {
  if (options.keepRichValues) {
    return datavalue.value
  } else {
    return [ datavalue.value.latitude, datavalue.value.longitude ]
  }
}

const time = (datavalue, options) => {
  let timeValue
  if (typeof options.timeConverter === 'function') {
    timeValue = options.timeConverter(datavalue.value)
  } else {
    timeValue = getTimeConverter(options.timeConverter)(datavalue.value)
  }
  if (options.keepRichValues) {
    const { timezone, before, after, precision, calendarmodel } = datavalue.value
    return { time: timeValue, timezone, before, after, precision, calendarmodel }
  } else {
    return timeValue
  }
}

const getTimeConverter = (key = 'iso') => {
  const converter = timeConverters[key]
  if (!converter) throw new Error(`invalid converter key: ${JSON.stringify(key).substring(0, 100)}`)
  return converter
}

// Each time converter should be able to accept 2 keys of arguments:
// - either datavalue.value objects (prefered as it gives access to the precision)
// - or the time string (datavalue.value.time)
export const timeConverters = {
  iso: wikibaseTimeToISOString,
  epoch: wikibaseTimeToEpochTime,
  'simple-day': wikibaseTimeToSimpleDay,
  none: (wikibaseTime: TimeInputValue) => typeof wikibaseTime === 'string' ? wikibaseTime : wikibaseTime.time,
} as const

export const parsers = {
  commonsMedia: simple,
  'external-id': simple,
  'geo-shape': simple,
  'globe-coordinate': coordinate,
  math: simple,
  monolingualtext,
  'musical-notation': simple,
  quantity,
  string: simple,
  'tabular-data': simple,
  time,
  url: simple,
  'wikibase-entityid': entity,
  'wikibase-form': entity,
  'wikibase-item': entity,
  'wikibase-lexeme': entity,
  'wikibase-property': entity,
  'wikibase-sense': entity,
} as const

const normalizeDatatype = datatype => datatype.toLowerCase().replace(/[\s-]/g, '')

const normalizedParsers = {}
for (const [ datatype, parser ] of Object.entries(parsers)) {
  normalizedParsers[normalizeDatatype(datatype)] = parser
}

export function parseSnak (datatype: DataType | undefined, datavalue: SnakDataValue, options: SimplifySnakOptions) {
  // @ts-expect-error Known case of missing datatype: form.claims, sense.claims, mediainfo.statements
  datatype = datatype || datavalue.type

  // Known case requiring normalization
  // - legacy "musical notation" datatype
  // - mediainfo won't have datatype="globe-coordinate", but datavalue.type="globecoordinate"
  const parser = normalizedParsers[normalizeDatatype(datatype)]
  if (!parser) {
    throw new Error(`${normalizeDatatype(datatype)} claim parser isn't implemented. Please report to https://github.com/maxlath/wikibase-sdk/issues`)
  }
  return parser(datavalue, options)
}
