/**
 * Encodes an object into logfmt format
 * @param obj - The object to encode
 * @returns The logfmt encoded string
 */
declare function encode(obj: Record<string, any>): string

export = encode
