import { Type } from './Type';
import type { Platform } from '../platforms';
import type { EntityProperty } from '../typings';
export declare class UuidType extends Type<string | null | undefined> {
    getColumnType(prop: EntityProperty, platform: Platform): string;
    compareAsType(): string;
    ensureComparable(): boolean;
}
