import { inspect } from 'node:util';
import type { Platform } from '../platforms';
import type { Constructor, EntityMetadata, EntityProperty } from '../typings';
export interface TransformContext {
    fromQuery?: boolean;
    key?: string;
    mode?: 'hydration' | 'query' | 'query-data' | 'discovery' | 'serialization';
}
export type IType<Runtime, Raw, Serialized = Raw> = Runtime & {
    __raw?: Raw;
    __runtime?: Runtime;
    __serialized?: Serialized;
};
export declare abstract class Type<JSType = string, DBType = JSType> {
    private static readonly types;
    platform?: Platform;
    meta?: EntityMetadata;
    prop?: EntityProperty;
    /**
     * Converts a value from its JS representation to its database representation of this type.
     */
    convertToDatabaseValue(value: JSType, platform: Platform, context?: TransformContext): DBType;
    /**
     * Converts a value from its database representation to its JS representation of this type.
     */
    convertToJSValue(value: DBType, platform: Platform): JSType;
    /**
     * Converts a value from its JS representation to its database representation of this type.
     */
    convertToDatabaseValueSQL?(key: string, platform: Platform): string;
    /**
     * Modifies the SQL expression (identifier, parameter) to convert to a JS value.
     */
    convertToJSValueSQL?(key: string, platform: Platform): string;
    /**
     * How should the raw database values be compared? Used in `EntityComparator`.
     * Possible values: string | number | bigint | boolean | date | any | buffer | array
     */
    compareAsType(): string;
    /**
     * Allows to override the internal comparison logic.
     */
    compareValues?(a: DBType, b: DBType): boolean;
    get runtimeType(): string;
    get name(): string;
    /**
     * When a value is hydrated, we convert it back to the database value to ensure comparability,
     * as often the raw database response is not the same as the `convertToDatabaseValue` result.
     * This allows to disable the additional conversion in case you know it is not needed.
     */
    ensureComparable<T extends object>(meta: EntityMetadata<T>, prop: EntityProperty<T>): boolean;
    /**
     * Converts a value from its JS representation to its serialized JSON form of this type.
     * By default uses the runtime value.
     */
    toJSON(value: JSType, platform: Platform): JSType | DBType;
    /**
     * Gets the SQL declaration snippet for a field of this type.
     */
    getColumnType(prop: EntityProperty, platform: Platform): string;
    /**
     * Get the default length for values of this type
     *
     * When doing schema generation, if neither "length" nor "columnType" option is provided,
     * the length will be defaulted to this value.
     *
     * When doing entity generation, if the type is recognized to this type, and the inferred length is this value,
     * the length option will be omitted in the output. If this method is not defined, length is always outputted
     * based on what is in the database metadata.
     *
     * @param platform The platform the default will be used for.
     *
     * @return The default value for the given platform.
     */
    getDefaultLength?(platform: Platform): number;
    static getType<JSType, DBType = JSType, TypeClass extends Constructor<Type<JSType, DBType>> = Constructor<Type<JSType, DBType>>>(cls: TypeClass): InstanceType<TypeClass>;
    /**
     * Checks whether the argument is instance of `Type`.
     */
    static isMappedType(data: any): data is Type<any>;
    /** @ignore */
    [inspect.custom](depth?: number): string;
}
