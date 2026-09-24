'use strict'

const NullProtoObj = require('null-prototype-object')

const cache = new NullProtoObj()

module.exports = ctx => namespace => cache[namespace] || (cache[namespace] = ctx(namespace))
