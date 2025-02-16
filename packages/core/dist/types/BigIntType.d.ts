import { Type } from './Type';
import type { Platform } from '../platforms';
import type { EntityProperty } from '../typings';
/**
 * This type will automatically convert string values returned from the database to native JS bigints (default)
 * or numbers (safe only for values up to `Number.MAX_SAFE_INTEGER`), or strings, depending on the `mode`.
 */
export declare class BigIntType extends Type<string | bigint | number | null | undefined, string | null | undefined> {
    mode?: "bigint" | "number" | "string" | undefined;
    constructor(mode?: "bigint" | "number" | "string" | undefined);
    convertToDatabaseValue(value: string | bigint | null | undefined): string | null | undefined;
    convertToJSValue(value: string | bigint | null | undefined): bigint | number | string | null | undefined;
    toJSON(value: string | bigint | null | undefined): string | bigint | null | undefined;
    getColumnType(prop: EntityProperty, platform: Platform): string;
    compareAsType(): string;
}
