import type { EntityData, EntityDictionary, EntityMetadata, EntityProperty, IMetadataStorage } from '../typings';
import type { Platform } from '../platforms';
type Comparator<T> = (a: T, b: T) => EntityData<T>;
type ResultMapper<T> = (result: EntityData<T>) => EntityData<T> | null;
type SnapshotGenerator<T> = (entity: T) => EntityData<T>;
type CompositeKeyPart = string | CompositeKeyPart[];
export declare class EntityComparator {
    private readonly metadata;
    private readonly platform;
    private readonly comparators;
    private readonly mappers;
    private readonly snapshotGenerators;
    private readonly pkGetters;
    private readonly pkGettersConverted;
    private readonly pkSerializers;
    private tmpIndex;
    constructor(metadata: IMetadataStorage, platform: Platform);
    /**
     * Computes difference between two entities.
     */
    diffEntities<T>(entityName: string, a: EntityData<T>, b: EntityData<T>): EntityData<T>;
    matching<T>(entityName: string, a: EntityData<T>, b: EntityData<T>): boolean;
    /**
     * Removes ORM specific code from entities and prepares it for serializing. Used before change set computation.
     * References will be mapped to primary keys, collections to arrays of primary keys.
     */
    prepareEntity<T>(entity: T): EntityData<T>;
    /**
     * Maps database columns to properties.
     */
    mapResult<T>(entityName: string, result: EntityDictionary<T>): EntityData<T>;
    /**
     * @internal Highly performance-sensitive method.
     */
    getPkGetter<T>(meta: EntityMetadata<T>): any;
    /**
     * @internal Highly performance-sensitive method.
     */
    getPkGetterConverted<T>(meta: EntityMetadata<T>): any;
    /**
     * @internal Highly performance-sensitive method.
     */
    getPkSerializer<T>(meta: EntityMetadata<T>): any;
    /**
     * @internal Highly performance-sensitive method.
     */
    getSnapshotGenerator<T>(entityName: string): SnapshotGenerator<T>;
    /**
     * @internal
     */
    propName(name: string, parent?: string): string;
    /**
     * @internal respects nested composite keys, e.g. `[1, [2, 3]]`
     */
    createCompositeKeyArray(prop: EntityProperty, parents?: EntityProperty[]): string;
    /**
     * @internal
     */
    formatCompositeKeyPart(part: CompositeKeyPart): string;
    /**
     * @internal Highly performance-sensitive method.
     */
    getResultMapper<T>(entityName: string): ResultMapper<T>;
    private getPropertyCondition;
    private getEmbeddedArrayPropertySnapshot;
    /**
     * we need to serialize only object embeddables, and only the top level ones, so root object embeddable
     * properties and first child nested object embeddables with inlined parent
     */
    private shouldSerialize;
    private getEmbeddedPropertySnapshot;
    private registerCustomType;
    private getPropertySnapshot;
    /**
     * @internal Highly performance-sensitive method.
     */
    getEntityComparator<T extends object>(entityName: string): Comparator<T>;
    private getGenericComparator;
    private getPropertyComparator;
    private wrap;
    private safeKey;
    /**
     * perf: used to generate list of comparable properties during discovery, so we speed up the runtime comparison
     */
    static isComparable<T>(prop: EntityProperty<T>, root: EntityMetadata): boolean;
}
export {};
