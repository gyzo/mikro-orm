import { type Dictionary, type EmbeddableOptions, type EntityMetadata, type EntityOptions, type EntityProperty, type GenerateOptions, type IndexOptions, type NamingStrategy, type OneToOneOptions, type Platform, type UniqueOptions } from '@mikro-orm/core';
/**
 * @see https://github.com/tc39/proposal-regexp-unicode-property-escapes#other-examples
 */
export declare const identifierRegex: RegExp;
export declare class SourceFile {
    protected readonly meta: EntityMetadata;
    protected readonly namingStrategy: NamingStrategy;
    protected readonly platform: Platform;
    protected readonly options: GenerateOptions;
    protected readonly coreImports: Set<string>;
    protected readonly entityImports: Set<string>;
    constructor(meta: EntityMetadata, namingStrategy: NamingStrategy, platform: Platform, options: GenerateOptions);
    generate(): string;
    protected getIndexOptions(index: EntityMetadata['indexes'][number], isAtEntityLevel?: boolean): IndexOptions<Dictionary>;
    protected getUniqueOptions(index: EntityMetadata['uniques'][number], isAtEntityLevel?: boolean): UniqueOptions<Dictionary>;
    protected generateImports(): string;
    protected getEntityClass(classBody: string): string;
    getBaseName(extension?: string): string;
    protected quote(val: string): string;
    protected getPropertyDefinition(prop: EntityProperty, padLeft: number): string;
    protected getEnumClassDefinition(prop: EntityProperty, padLeft: number): string;
    protected serializeObject(options: {}, wordwrap?: number, spaces?: number, level?: number): string;
    protected serializeValue(val: unknown, wordwrap?: number, spaces?: number, level?: number): unknown;
    protected getEntityDeclOptions(): EntityOptions<unknown>;
    protected getEmbeddableDeclOptions(): EmbeddableOptions;
    private getCollectionDecl;
    private getPropertyDecorator;
    protected getPropertyIndexes(prop: EntityProperty, options: Dictionary): string[];
    protected getCommonDecoratorOptions(options: Dictionary, prop: EntityProperty): void;
    private propTypeBreakdowns;
    private breakdownOfIType;
    protected getScalarPropertyDecoratorOptions(options: Dictionary, prop: EntityProperty): void;
    protected getManyToManyDecoratorOptions(options: Dictionary, prop: EntityProperty): void;
    protected getOneToManyDecoratorOptions(options: Dictionary, prop: EntityProperty): void;
    protected getEmbeddedPropertyDeclarationOptions(options: Dictionary, prop: EntityProperty): void;
    protected getForeignKeyDecoratorOptions(options: OneToOneOptions<any, any>, prop: EntityProperty): void;
    protected getDecoratorType(prop: EntityProperty): string;
    protected referenceCoreImport(identifier: string): string;
}
