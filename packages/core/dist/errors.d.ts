import type { AnyEntity, Constructor, Dictionary, EntityMetadata, EntityProperty, IPrimaryKey } from './typings';
export declare class ValidationError<T extends AnyEntity = AnyEntity> extends Error {
    readonly entity?: T | undefined;
    constructor(message: string, entity?: T | undefined);
    /**
     * Gets instance of entity that caused this error.
     */
    getEntity(): AnyEntity | undefined;
    static fromWrongPropertyType(entity: AnyEntity, property: string, expectedType: string, givenType: string, givenValue: string): ValidationError;
    static fromWrongRepositoryType(entityName: string, repoType: string, method: string): ValidationError;
    static fromCollectionNotInitialized(entity: AnyEntity, prop: EntityProperty): ValidationError;
    static fromMergeWithoutPK(meta: EntityMetadata): ValidationError;
    static transactionRequired(): ValidationError;
    static entityNotManaged(entity: AnyEntity): ValidationError;
    static notEntity(owner: AnyEntity, prop: EntityProperty, data: any): ValidationError;
    static notDiscoveredEntity(data: any, meta?: EntityMetadata, action?: string): ValidationError;
    static invalidPropertyName(entityName: string, invalid: string): ValidationError;
    static invalidType(type: Constructor<any>, value: any, mode: string): ValidationError;
    static propertyRequired(entity: AnyEntity, property: EntityProperty): ValidationError;
    static cannotModifyInverseCollection(owner: AnyEntity, property: EntityProperty): ValidationError;
    static cannotModifyReadonlyCollection(owner: AnyEntity, property: EntityProperty): ValidationError;
    static cannotRemoveFromCollectionWithoutOrphanRemoval(owner: AnyEntity, property: EntityProperty): ValidationError;
    static invalidCompositeIdentifier(meta: EntityMetadata): ValidationError;
    static cannotCommit(): ValidationError;
    static cannotUseGlobalContext(): ValidationError;
    static cannotUseOperatorsInsideEmbeddables(className: string, propName: string, payload: unknown): ValidationError;
    static invalidEmbeddableQuery(className: string, propName: string, embeddableType: string): ValidationError;
}
export declare class CursorError<T extends AnyEntity = AnyEntity> extends ValidationError<T> {
    static entityNotPopulated(entity: AnyEntity, prop: string): ValidationError;
    static missingValue(entityName: string, prop: string): ValidationError;
}
export declare class OptimisticLockError<T extends AnyEntity = AnyEntity> extends ValidationError<T> {
    static notVersioned(meta: EntityMetadata): OptimisticLockError;
    static lockFailed(entityOrName: AnyEntity | string): OptimisticLockError;
    static lockFailedVersionMismatch(entity: AnyEntity, expectedLockVersion: number | Date, actualLockVersion: number | Date): OptimisticLockError;
}
export declare class MetadataError<T extends AnyEntity = AnyEntity> extends ValidationError<T> {
    static fromMissingPrimaryKey(meta: EntityMetadata): MetadataError;
    static fromWrongReference(meta: EntityMetadata, prop: EntityProperty, key: 'inversedBy' | 'mappedBy', owner?: EntityProperty): MetadataError;
    static fromWrongForeignKey(meta: EntityMetadata, prop: EntityProperty, key: string): MetadataError;
    static fromWrongTypeDefinition(meta: EntityMetadata, prop: EntityProperty): MetadataError;
    static fromWrongOwnership(meta: EntityMetadata, prop: EntityProperty, key: 'inversedBy' | 'mappedBy'): MetadataError;
    static fromWrongReferenceKind(meta: EntityMetadata, owner: EntityProperty, prop: EntityProperty): MetadataError;
    static fromInversideSidePrimary(meta: EntityMetadata, owner: EntityProperty, prop: EntityProperty): MetadataError;
    static entityNotFound(name: string, path: string): MetadataError;
    static unknownIndexProperty(meta: EntityMetadata, prop: string, type: string): MetadataError;
    static multipleVersionFields(meta: EntityMetadata, fields: string[]): MetadataError;
    static invalidVersionFieldType(meta: EntityMetadata): MetadataError;
    static fromUnknownEntity(className: string, source: string): MetadataError;
    static noEntityDiscovered(): MetadataError;
    static onlyAbstractEntitiesDiscovered(): MetadataError;
    static duplicateEntityDiscovered(paths: string[], subject?: string): MetadataError;
    static duplicateFieldName(className: string, names: [string, string][]): MetadataError;
    static multipleDecorators(entityName: string, propertyName: string): MetadataError;
    static missingMetadata(entity: string): MetadataError;
    static invalidPrimaryKey(meta: EntityMetadata, prop: EntityProperty, requiredName: string): MetadataError<Partial<any>>;
    static invalidManyToManyWithPivotEntity(meta1: EntityMetadata, prop1: EntityProperty, meta2: EntityMetadata, prop2: EntityProperty): MetadataError<Partial<any>>;
    static targetIsAbstract(meta: EntityMetadata, prop: EntityProperty): MetadataError<Partial<any>>;
    static nonPersistentCompositeProp(meta: EntityMetadata, prop: EntityProperty): MetadataError<Partial<any>>;
    static propertyTargetsEntityType(meta: EntityMetadata, prop: EntityProperty, target: EntityMetadata): MetadataError<Partial<any>>;
    static fromMissingOption(meta: EntityMetadata, prop: EntityProperty, option: string): MetadataError<Partial<any>>;
    private static fromMessage;
}
export declare class NotFoundError<T extends AnyEntity = AnyEntity> extends ValidationError<T> {
    static findOneFailed(name: string, where: Dictionary | IPrimaryKey): NotFoundError;
    static findExactlyOneFailed(name: string, where: Dictionary | IPrimaryKey): NotFoundError;
}
